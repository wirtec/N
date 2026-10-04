import { db } from "@/db";
import { articles } from "@/db/schema";
import { desc, ilike, or, count } from "drizzle-orm";
import { serializeArticle } from "@/lib/serialize";
import { ArticleList } from "@/components/ArticleList";
import type { ArticleDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 18;

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const q = (sp.q ?? "").trim();
  const where = q
    ? or(ilike(articles.title, `%${q}%`), ilike(articles.titleFa, `%${q}%`), ilike(articles.content, `%${q}%`))
    : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(articles)
      .where(where)
      .orderBy(desc(articles.pubDate), desc(articles.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(articles).where(where),
  ]);

  const items = rows.map((r) => serializeArticle(r, "both", false)) as unknown as ArticleDTO[];
  const pages = Math.max(1, Math.ceil(Number(total) / PAGE_SIZE));

  return <ArticleList items={items} total={Number(total)} page={page} pages={pages} q={q} />;
}
