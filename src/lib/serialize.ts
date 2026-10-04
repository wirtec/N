import type { Article } from "@/db/schema";

export type Lang = "en" | "fa";

export function normalizeLang(v: string | null | undefined): Lang | "both" {
  if (v === "fa") return "fa";
  if (v === "en") return "en";
  return "both";
}

export function serializeArticle(a: Article, lang: Lang | "both" = "both", full = true) {
  const base = {
    id: a.id,
    guid: a.guid,
    google_link: a.googleLink,
    source_url: a.sourceUrl,
    source: a.source,
    pub_date: a.pubDate ? a.pubDate.toISOString() : null,
    related_links: a.relatedLinks,
    top_image: a.topImage,
    images: a.images,
    extracted: a.extracted,
    extract_error: a.extractError,
    updated_at: a.updatedAt.toISOString(),
    url: `/news/${a.id}`,
  };

  const en = {
    title: a.title,
    excerpt: a.excerpt,
    ...(full ? { content: a.content } : {}),
  };
  const fa = {
    title: a.titleFa ?? a.title,
    excerpt: a.excerptFa ?? a.excerpt,
    ...(full ? { content: a.contentFa ?? a.content } : {}),
  };

  if (lang === "en") return { ...base, lang: "en", ...en };
  if (lang === "fa") return { ...base, lang: "fa", ...fa };
  return { ...base, lang: "both", title: a.title, en, fa };
}
