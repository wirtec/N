import { db } from "@/db";
import { articles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { normalizeLang, serializeArticle } from "@/lib/serialize";
import { processArticle } from "@/lib/scrape";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/news/:id?lang=en|fa|both
 * Returns the full article: title, date, links, related links, content (en + fa) and all images.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const numId = parseInt(id, 10);
  if (!numId) return Response.json({ ok: false, error: "invalid id" }, { status: 400 });
  const [row] = await db.select().from(articles).where(eq(articles.id, numId));
  if (!row) return Response.json({ ok: false, error: "not found" }, { status: 404 });
  const lang = normalizeLang(req.nextUrl.searchParams.get("lang"));
  return Response.json({ ok: true, item: serializeArticle(row, lang, true) });
}

/**
 * POST /api/news/:id  → re-extract + re-translate this single article.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const numId = parseInt(id, 10);
  if (!numId) return Response.json({ ok: false, error: "invalid id" }, { status: 400 });
  try {
    await processArticle(numId, { translate: req.nextUrl.searchParams.get("translate") !== "0" });
    const [row] = await db.select().from(articles).where(eq(articles.id, numId));
    return Response.json({ ok: true, item: serializeArticle(row, "both", true) });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
