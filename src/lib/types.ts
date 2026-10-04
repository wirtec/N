import type { RelatedLink } from "@/db/schema";

export type ArticleDTO = {
  id: number;
  guid: string;
  google_link: string;
  source_url: string | null;
  source: string | null;
  pub_date: string | null;
  related_links: RelatedLink[];
  top_image: string | null;
  images: string[];
  extracted: boolean;
  extract_error: string | null;
  updated_at: string;
  url: string;
  en: { title: string; excerpt: string | null; content?: string | null };
  fa: { title: string; excerpt: string | null; content?: string | null };
};
