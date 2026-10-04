import { db } from "@/db";
import { articles } from "@/db/schema";
import { desc, eq, ilike, or, and, count, type SQL } from "drizzle-orm";
import { normalizeLang, serializeArticle } from "@/lib/serialize";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/news?lang=en|fa|both&page=1&limit=20&q=search&extracted=1&full=0
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const lang = normalizeLang(sp.get("lang"));
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") ?? "20", 10) || 20));
  const q = sp.get("q")?.trim();
  const onlyExtracted = sp.get("extracted") === "1";
  const full = sp.get("full") === "1";

  const conditions: SQL[] = [];
  if (onlyExtracted) conditions.push(eq(articles.extracted, true));
  if (q) {
    const like = `%${q}%`;
    conditions.push(or(ilike(articles.title, like), ilike(articles.titleFa, like), ilike(articles.content, like))!);
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(articles)
      .where(where)
      .orderBy(desc(articles.pubDate), desc(articles.id))
      .limit(limit)
      .offset((page - 1) * limit),
    db.select({ total: count() }).from(articles).where(where),
  ]);

  return Response.json({
    ok: true,
    lang,
    page,
    limit,
    total: Number(total),
    items: rows.map((r) => serializeArticle(r, lang, full)),
  });
}
