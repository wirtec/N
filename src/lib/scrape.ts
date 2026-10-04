import { db } from "@/db";
import { articles, scrapeRuns, type RelatedLink } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { fetchFeed, DEFAULT_FEED_URL, type FeedItem } from "./rss";
import { resolveUrl } from "./gnews-decode";
import { extractArticle } from "./extract";
import { translateText } from "./translate";

export type ScrapeOptions = {
  feedUrl?: string;
  limit?: number; // max number of articles to fully extract per run
  translate?: boolean;
  concurrency?: number;
};

export type ScrapeSummary = {
  runId: number;
  feedUrl: string;
  itemsFound: number;
  itemsNew: number;
  itemsExtracted: number;
  errors: { guid: string; error: string }[];
  durationMs: number;
};

const MAX_TRANSLATE_CHARS = 12000;

async function upsertFeedItems(items: FeedItem[]): Promise<Set<string>> {
  if (!items.length) return new Set();
  const guids = items.map((i) => i.guid);
  const existing = await db
    .select({ guid: articles.guid })
    .from(articles)
    .where(inArray(articles.guid, guids));
  const existingSet = new Set(existing.map((e) => e.guid));
  const newItems = items.filter((i) => !existingSet.has(i.guid));
  if (newItems.length) {
    await db
      .insert(articles)
      .values(
        newItems.map((i) => ({
          guid: i.guid,
          title: i.title,
          googleLink: i.link,
          source: i.source,
          pubDate: i.pubDate,
          descriptionHtml: i.descriptionHtml,
          relatedLinks: i.relatedLinks as RelatedLink[],
        })),
      )
      .onConflictDoNothing();
  }
  return new Set(newItems.map((i) => i.guid));
}

export async function processArticle(id: number, opts: { translate: boolean }): Promise<void> {
  const [row] = await db.select().from(articles).where(eq(articles.id, id));
  if (!row) throw new Error("article not found");

  let sourceUrl = row.sourceUrl;
  if (!sourceUrl) {
    sourceUrl = await resolveUrl(row.googleLink);
  }
  if (!sourceUrl) {
    await db
      .update(articles)
      .set({ extractError: "Could not resolve Google News link", updatedAt: new Date() })
      .where(eq(articles.id, id));
    throw new Error("Could not resolve Google News link");
  }

  let extracted;
  try {
    extracted = await extractArticle(sourceUrl);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db
      .update(articles)
      .set({ sourceUrl, extractError: msg, updatedAt: new Date() })
      .where(eq(articles.id, id));
    throw new Error(msg);
  }

  let titleFa: string | null = row.titleFa;
  let contentFa: string | null = null;
  let excerptFa: string | null = null;
  if (opts.translate) {
    if (!titleFa) titleFa = await translateText(row.title, "fa", "en");
    const body = extracted.content.slice(0, MAX_TRANSLATE_CHARS);
    contentFa = await translateText(body, "fa", "en");
    excerptFa = await translateText(extracted.excerpt, "fa", "en");
  }

  await db
    .update(articles)
    .set({
      sourceUrl: extracted.url,
      source: row.source ?? extracted.siteName,
      content: extracted.content,
      excerpt: extracted.excerpt,
      topImage: extracted.topImage,
      images: extracted.images,
      titleFa,
      contentFa,
      excerptFa,
      extracted: true,
      extractError: null,
      updatedAt: new Date(),
    })
    .where(eq(articles.id, id));
}

async function runPool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>) {
  let idx = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (idx < items.length) {
      const item = items[idx++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

export async function runScrape(options: ScrapeOptions = {}): Promise<ScrapeSummary> {
  const feedUrl = options.feedUrl || DEFAULT_FEED_URL;
  const limit = options.limit ?? 10;
  const translate = options.translate ?? true;
  const concurrency = options.concurrency ?? 3;
  const started = Date.now();

  const [run] = await db
    .insert(scrapeRuns)
    .values({ feedUrl, source: "web", status: "running" })
    .returning();

  const errors: { guid: string; error: string }[] = [];
  let itemsFound = 0;
  let itemsNew = 0;
  let itemsExtracted = 0;

  try {
    const feed = await fetchFeed(feedUrl);
    itemsFound = feed.items.length;
    const newGuids = await upsertFeedItems(feed.items);
    itemsNew = newGuids.size;

    // Extract anything not yet extracted (newest first), up to `limit`
    const pending = await db
      .select({ id: articles.id, guid: articles.guid })
      .from(articles)
      .where(eq(articles.extracted, false))
      .orderBy(articles.pubDate)
      .limit(500);
    const toProcess = pending.reverse().slice(0, limit);

    await runPool(toProcess, concurrency, async (p) => {
      try {
        await processArticle(p.id, { translate });
        itemsExtracted++;
      } catch (e) {
        errors.push({ guid: p.guid, error: e instanceof Error ? e.message : String(e) });
      }
    });

    await db
      .update(scrapeRuns)
      .set({
        itemsFound,
        itemsNew,
        itemsExtracted,
        status: errors.length && !itemsExtracted ? "error" : "ok",
        message: errors.length ? `${errors.length} extraction error(s)` : null,
        finishedAt: new Date(),
      })
      .where(eq(scrapeRuns.id, run.id));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db
      .update(scrapeRuns)
      .set({ status: "error", message: msg, finishedAt: new Date(), itemsFound, itemsNew, itemsExtracted })
      .where(eq(scrapeRuns.id, run.id));
    throw e;
  }

  return { runId: run.id, feedUrl, itemsFound, itemsNew, itemsExtracted, errors, durationMs: Date.now() - started };
}
