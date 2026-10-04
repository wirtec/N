import { db } from "@/db";
import { articles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { serializeArticle } from "@/lib/serialize";
import { ArticleDetail } from "@/components/ArticleDetail";
import type { ArticleDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NewsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = parseInt(id, 10);
  if (!numId) notFound();
  const [row] = await db.select().from(articles).where(eq(articles.id, numId));
  if (!row) notFound();
  const article = serializeArticle(row, "both", true) as unknown as ArticleDTO;
  return <ArticleDetail article={article} />;
}
