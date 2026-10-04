import { fetchFeed, DEFAULT_FEED_URL } from "@/lib/rss";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/feed?url=<rss url>
 * Live pass-through of the Google News RSS: title, date, link and
 * the links (with titles + sources) found inside each description.
 * Does NOT open the articles — use /api/scrape for that.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url") || DEFAULT_FEED_URL;
  try {
    const feed = await fetchFeed(url);
    return Response.json({
      ok: true,
      feed_title: feed.feedTitle,
      feed_url: feed.feedUrl,
      count: feed.items.length,
      items: feed.items.map((i) => ({
        guid: i.guid,
        title: i.title,
        link: i.link,
        pub_date: i.pubDate ? i.pubDate.toISOString() : null,
        source: i.source,
        related_links: i.relatedLinks,
        description_html: i.descriptionHtml,
      })),
    });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
