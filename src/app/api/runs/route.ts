import { db } from "@/db";
import { scrapeRuns } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** GET /api/runs → last 20 scrape runs (web + python) */
export async function GET() {
  const rows = await db.select().from(scrapeRuns).orderBy(desc(scrapeRuns.id)).limit(20);
  return Response.json({ ok: true, runs: rows });
}
