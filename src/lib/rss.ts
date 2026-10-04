import { XMLParser } from "fast-xml-parser";
import type { RelatedLink } from "@/db/schema";

export const DEFAULT_FEED_URL =
  "https://news.google.com/rss/topics/CAAqKggKIiRDQkFTRlFvSUwyMHZNRGRqTVhZU0JXVnVMVlZUR2dKVlV5Z0FQAQ?hl=en-US&gl=US&ceid=US:en";

export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export type FeedItem = {
  guid: string;
  title: string;
  link: string;
  pubDate: Date | null;
  source: string | null;
  descriptionHtml: string;
  relatedLinks: RelatedLink[];
};

export type ParsedFeed = {
  feedTitle: string;
  feedUrl: string;
  items: FeedItem[];
};

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, ""));
}

/**
 * Google News topic descriptions look like:
 * <ol><li><a href="URL">Title</a>&nbsp;&nbsp;<font color="#6f6f6f">Source</font></li>...</ol>
 * We pull every anchor (link + its title) and the source label next to it.
 */
export function parseDescriptionLinks(html: string): RelatedLink[] {
  if (!html) return [];
  const out: RelatedLink[] = [];
  const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  const anchorRegex = /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i;
  const fontRegex = /<font[^>]*>([\s\S]*?)<\/font>/i;

  let m: RegExpExecArray | null;
  let found = false;
  while ((m = liRegex.exec(html)) !== null) {
    found = true;
    const li = m[1];
    const a = anchorRegex.exec(li);
    if (!a) continue;
    const f = fontRegex.exec(li);
    out.push({
      url: decodeEntities(a[1]),
      title: stripTags(a[2]),
      source: f ? stripTags(f[1]) : null,
    });
  }
  if (!found) {
    // fallback: grab any anchors
    const all = /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    while ((m = all.exec(html)) !== null) {
      out.push({ url: decodeEntities(m[1]), title: stripTags(m[2]), source: null });
    }
  }
  return out;
}

type RawItem = Record<string, unknown>;

function asText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "object" && v !== null && "#text" in v) {
    return String((v as { "#text": unknown })["#text"] ?? "");
  }
  return String(v);
}

export async function fetchFeed(feedUrl: string = DEFAULT_FEED_URL): Promise<ParsedFeed> {
  const res = await fetch(feedUrl, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml, application/xml, text/xml" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Feed request failed with status ${res.status}`);
  const xml = await res.text();
  return parseFeedXml(xml, feedUrl);
}

export function parseFeedXml(xml: string, feedUrl: string): ParsedFeed {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    cdataPropName: "__cdata",
    textNodeName: "#text",
  });
  const doc = parser.parse(xml);
  const channel = doc?.rss?.channel ?? {};
  const rawItems: RawItem[] = Array.isArray(channel.item)
    ? channel.item
    : channel.item
      ? [channel.item]
      : [];

  const items: FeedItem[] = rawItems.map((it) => {
    const descRaw = it.description;
    let descriptionHtml = "";
    if (typeof descRaw === "string") descriptionHtml = descRaw;
    else if (descRaw && typeof descRaw === "object") {
      const d = descRaw as Record<string, unknown>;
      descriptionHtml = asText(d.__cdata ?? d["#text"] ?? "");
    }
    descriptionHtml = decodeEntities(descriptionHtml)
      // decodeEntities turns &lt; into < — needed because Google escapes the HTML
      .replace(/&nbsp;/g, " ");

    const sourceNode = it.source as Record<string, unknown> | string | undefined;
    const source =
      typeof sourceNode === "string"
        ? sourceNode
        : sourceNode
          ? asText(sourceNode["#text"] ?? "")
          : null;

    const pubRaw = asText(it.pubDate);
    const pubDate = pubRaw ? new Date(pubRaw) : null;
    const link = asText(it.link).trim();
    const guid = asText(it.guid).trim() || link;

    return {
      guid,
      title: decodeEntities(asText(it.title)),
      link,
      pubDate: pubDate && !isNaN(pubDate.getTime()) ? pubDate : null,
      source: source || null,
      descriptionHtml,
      relatedLinks: parseDescriptionLinks(descriptionHtml),
    };
  });

  return { feedTitle: decodeEntities(asText(channel.title)), feedUrl, items };
}
