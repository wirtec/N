import { runScrape } from "@/lib/scrape";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const token = process.env.SCRAPE_TOKEN;
  if (!token) return true; // no token configured → open
  const header = req.headers.get("authorization") ?? "";
  const provided = header.replace(/^Bearer\s+/i, "") || req.nextUrl.searchParams.get("token") || "";
  return provided === token;
}

/**
 * GET|POST /api/scrape?limit=10&translate=1&feed=<rss url>
 * Fetches the Google News RSS feed, stores new items, resolves real URLs,
 * extracts text + images and translates to Persian.
 */
async function handle(req: NextRequest) {
  if (!authorized(req)) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const limit = Math.min(30, Math.max(0, parseInt(sp.get("limit") ?? "8", 10) || 8));
  const translate = sp.get("translate") !== "0";
  const feedUrl = sp.get("feed") || undefined;
  try {
    const summary = await runScrape({ limit, translate, feedUrl });
    return Response.json({ ok: true, ...summary });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
