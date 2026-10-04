import { db } from "@/db";
import { articles, scrapeRuns, type RelatedLink } from "@/db/schema";
import { sql } from "drizzle-orm";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type IngestItem = {
  guid?: string;
  title: string;
  title_fa?: string | null;
  google_link: string;
  source_url?: string | null;
  source?: string | null;
  pub_date?: string | null;
  description_html?: string | null;
  related_links?: RelatedLink[];
  content?: string | null;
  content_fa?: string | null;
  excerpt?: string | null;
  excerpt_fa?: string | null;
  top_image?: string | null;
  images?: string[];
  extract_error?: string | null;
};

function authorized(req: NextRequest): boolean {
  const token = process.env.INGEST_TOKEN || process.env.SCRAPE_TOKEN;
  if (!token) return true;
  const header = req.headers.get("authorization") ?? "";
  return header.replace(/^Bearer\s+/i, "") === token;
}

/**
 * POST /api/ingest
 * Body: { feed_url?: string, items: IngestItem[] }
 * Used by the Python scraper (GitHub Actions) to push scraped articles into the database.
 */
export async function POST(req: NextRequest) {
  if (!authorized(req)) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  let body: { feed_url?: string; items?: IngestItem[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) return Response.json({ ok: false, error: "items[] required" }, { status: 400 });

  let inserted = 0;
  let updated = 0;
  for (const it of items) {
    if (!it.title || !it.google_link) continue;
    const guid = it.guid || it.google_link;
    const pub = it.pub_date ? new Date(it.pub_date) : null;
    const hasContent = Boolean(it.content && it.content.trim());
    const values = {
      guid,
      title: it.title,
      titleFa: it.title_fa ?? null,
      googleLink: it.google_link,
      sourceUrl: it.source_url ?? null,
      source: it.source ?? null,
      pubDate: pub && !isNaN(pub.getTime()) ? pub : null,
      descriptionHtml: it.description_html ?? null,
      relatedLinks: it.related_links ?? [],
      content: it.content ?? null,
      contentFa: it.content_fa ?? null,
      excerpt: it.excerpt ?? null,
      excerptFa: it.excerpt_fa ?? null,
      topImage: it.top_image ?? null,
      images: it.images ?? [],
      extracted: hasContent,
      extractError: it.extract_error ?? null,
      updatedAt: new Date(),
    };
    const res = await db
      .insert(articles)
      .values(values)
      .onConflictDoUpdate({
        target: articles.guid,
        set: {
          titleFa: sql`coalesce(excluded.title_fa, ${articles.titleFa})`,
          sourceUrl: sql`coalesce(excluded.source_url, ${articles.sourceUrl})`,
          source: sql`coalesce(excluded.source, ${articles.source})`,
          relatedLinks: sql`excluded.related_links`,
          content: sql`coalesce(excluded.content, ${articles.content})`,
          contentFa: sql`coalesce(excluded.content_fa, ${articles.contentFa})`,
          excerpt: sql`coalesce(excluded.excerpt, ${articles.excerpt})`,
          excerptFa: sql`coalesce(excluded.excerpt_fa, ${articles.excerptFa})`,
          topImage: sql`coalesce(excluded.top_image, ${articles.topImage})`,
          images: sql`case when jsonb_array_length(excluded.images) > 0 then excluded.images else ${articles.images} end`,
          extracted: sql`${articles.extracted} or excluded.extracted`,
          extractError: sql`excluded.extract_error`,
          updatedAt: new Date(),
        },
      })
      .returning({ createdAt: articles.createdAt, updatedAt: articles.updatedAt });
    const row = res[0];
    if (row && Math.abs(row.createdAt.getTime() - row.updatedAt.getTime()) < 2000) inserted++;
    else updated++;
  }

  await db.insert(scrapeRuns).values({
    feedUrl: body.feed_url ?? "python-ingest",
    source: "python",
    itemsFound: items.length,
    itemsNew: inserted,
    itemsExtracted: items.filter((i) => i.content && i.content.trim()).length,
    status: "ok",
    finishedAt: new Date(),
  });

  return Response.json({ ok: true, received: items.length, inserted, updated });
}
