import {
  pgTable,
  serial,
  text,
  timestamp,
  jsonb,
  integer,
  boolean,
} from "drizzle-orm/pg-core";

export type RelatedLink = {
  title: string;
  url: string;
  source: string | null;
};

export const articles = pgTable("articles", {
  id: serial("id").primaryKey(),
  guid: text("guid").notNull().unique(),
  // Original (English) fields from the RSS feed
  title: text("title").notNull(),
  titleFa: text("title_fa"),
  googleLink: text("google_link").notNull(),
  sourceUrl: text("source_url"),
  source: text("source"),
  pubDate: timestamp("pub_date", { withTimezone: true }),
  descriptionHtml: text("description_html"),
  relatedLinks: jsonb("related_links").$type<RelatedLink[]>().notNull().default([]),
  // Extracted article body
  content: text("content"),
  contentFa: text("content_fa"),
  excerpt: text("excerpt"),
  excerptFa: text("excerpt_fa"),
  topImage: text("top_image"),
  images: jsonb("images").$type<string[]>().notNull().default([]),
  extracted: boolean("extracted").notNull().default(false),
  extractError: text("extract_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const scrapeRuns = pgTable("scrape_runs", {
  id: serial("id").primaryKey(),
  feedUrl: text("feed_url").notNull(),
  source: text("source").notNull().default("web"), // web | python | manual
  itemsFound: integer("items_found").notNull().default(0),
  itemsNew: integer("items_new").notNull().default(0),
  itemsExtracted: integer("items_extracted").notNull().default(0),
  status: text("status").notNull().default("ok"),
  message: text("message"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export type Article = typeof articles.$inferSelect;
export type NewArticle = typeof articles.$inferInsert;
export type ScrapeRun = typeof scrapeRuns.$inferSelect;
