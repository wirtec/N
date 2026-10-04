"use client";

import { useLang } from "@/components/LangProvider";

const endpoints = [
  {
    method: "GET",
    path: "/api/feed",
    en: "Live parse of the Google News RSS: title, date, link, source and every link (with its title) inside the description. Does not open the articles.",
    fa: "خواندن زندهٔ فید RSS گوگل‌نیوز: عنوان، تاریخ، لینک، منبع و همهٔ لینک‌های داخل توضیحات به همراه عنوانشان. خبرها را باز نمی‌کند.",
    params: "?url=<rss url>",
  },
  {
    method: "GET | POST",
    path: "/api/scrape",
    en: "Fetch the feed, store new items, resolve real publisher URLs, extract full text + images and translate to Persian. Protect with SCRAPE_TOKEN env (Bearer token or ?token=).",
    fa: "واکشی فید، ذخیرهٔ خبرهای جدید، پیدا کردن لینک اصلی ناشر، استخراج متن کامل و تصاویر و ترجمه به فارسی. با متغیر محیطی SCRAPE_TOKEN محافظت می‌شود (Bearer یا ?token=).",
    params: "?limit=8&translate=1&feed=<rss url>",
  },
  {
    method: "GET",
    path: "/api/news",
    en: "Paginated list of stored articles. lang=en|fa|both selects the output language; full=1 includes the article body.",
    fa: "فهرست صفحه‌بندی‌شدهٔ خبرهای ذخیره‌شده. lang=en|fa|both زبان خروجی را انتخاب می‌کند؛ full=1 متن کامل را هم برمی‌گرداند.",
    params: "?lang=fa&page=1&limit=20&q=text&extracted=1&full=0",
  },
  {
    method: "GET",
    path: "/api/news/:id",
    en: "One article with title, date, Google link, real link, description links, full content (EN + FA) and all images.",
    fa: "یک خبر با عنوان، تاریخ، لینک گوگل، لینک اصلی، لینک‌های توضیحات، متن کامل (فارسی + انگلیسی) و همهٔ تصاویر.",
    params: "?lang=both",
  },
  {
    method: "POST",
    path: "/api/news/:id",
    en: "Re-extract and re-translate a single article.",
    fa: "استخراج و ترجمهٔ مجدد یک خبر.",
    params: "?translate=1",
  },
  {
    method: "POST",
    path: "/api/ingest",
    en: "Bulk upsert of articles produced by the Python scraper (GitHub Actions). Body: { feed_url, items: [...] }. Protect with INGEST_TOKEN.",
    fa: "درج/به‌روزرسانی گروهی خبرهایی که اسکریپت پایتون (GitHub Actions) تولید کرده. بدنه: { feed_url, items: [...] }. با INGEST_TOKEN محافظت می‌شود.",
    params: "",
  },
  {
    method: "GET",
    path: "/api/runs",
    en: "Last 20 scrape runs (web + python) with counters.",
    fa: "۲۰ اجرای اخیر واکشی (وب + پایتون) با شمارنده‌ها.",
    params: "",
  },
  {
    method: "GET",
    path: "/api/health",
    en: "Health check (database connectivity).",
    fa: "بررسی سلامت (اتصال به پایگاه‌داده).",
    params: "",
  },
];

const sampleItem = `{
  "id": 12,
  "guid": "CBMi...",
  "google_link": "https://news.google.com/rss/articles/CBMi...?oc=5",
  "source_url": "https://publisher.com/story",
  "source": "Reuters",
  "pub_date": "2026-01-10T14:05:00.000Z",
  "related_links": [
    { "title": "Headline A", "url": "https://news.google.com/rss/articles/...", "source": "CNN" }
  ],
  "top_image": "https://publisher.com/img/hero.jpg",
  "images": ["https://publisher.com/img/hero.jpg", "https://publisher.com/img/2.jpg"],
  "extracted": true,
  "en": { "title": "…", "excerpt": "…", "content": "full text…" },
  "fa": { "title": "…", "excerpt": "…", "content": "متن کامل…" }
}`;

export default function DocsPage() {
  const { lang } = useLang();
  const fa = lang === "fa";

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold">{fa ? "راهنمای API" : "API Guide"}</h1>
      <p className="mt-2 text-slate-600">
        {fa
          ? "این سرویس فید RSS گوگل‌نیوز را می‌خواند، عنوان/تاریخ/لینک هر خبر و لینک‌های داخل توضیحات را استخراج می‌کند، سپس لینک اصلی خبر را باز کرده متن کامل و تصاویر را برمی‌دارد و به فارسی ترجمه می‌کند. همهٔ داده‌ها از طریق API و همین وب‌سایت در دسترس هستند."
          : "This service reads a Google News RSS feed, extracts each item's title/date/link plus the links inside the description, then opens the real article to grab the full text and images and translates it to Persian. Everything is available via the API and this web UI."}
      </p>

      <section className="mt-8 space-y-4">
        {endpoints.map((e) => (
          <div key={e.path + e.method} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-2" dir="ltr">
              <span className="rounded-md bg-slate-900 px-2 py-0.5 font-mono text-xs text-white">{e.method}</span>
              <code className="font-mono text-sm font-semibold text-blue-700">{e.path}</code>
              {e.params && <code className="font-mono text-xs text-slate-500">{e.params}</code>}
            </div>
            <p className="mt-2 text-sm text-slate-700">{fa ? e.fa : e.en}</p>
          </div>
        ))}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-bold">{fa ? "نمونهٔ خروجی" : "Sample item"}</h2>
        <pre dir="ltr" className="mt-3 overflow-x-auto rounded-2xl bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">
          {sampleItem}
        </pre>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-bold">{fa ? "نمونهٔ فراخوانی" : "Examples"}</h2>
        <pre dir="ltr" className="mt-3 overflow-x-auto rounded-2xl bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">
{`# 1) Read RSS only (title, date, link + description links)
curl "$BASE/api/feed"

# 2) Scrape: open every article, extract text + images, translate
curl -X POST "$BASE/api/scrape?limit=10"

# 3) List in Persian
curl "$BASE/api/news?lang=fa&limit=5"

# 4) Full article, both languages, all images
curl "$BASE/api/news/12?lang=both"

# 5) Push results from the Python scraper
curl -X POST "$BASE/api/ingest" -H "Authorization: Bearer $INGEST_TOKEN" \\
     -H "Content-Type: application/json" --data @output/news.json`}
        </pre>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-bold">{fa ? "اسکریپت پایتون و GitHub Actions" : "Python scraper & GitHub Actions"}</h2>
        <div className="mt-3 space-y-2 text-sm text-slate-700">
          <p>
            {fa
              ? "پوشهٔ scraper/ شامل اسکریپت پایتون (scrape.py)، یک API با FastAPI (api.py) و راهنمای کامل (README.md) است. ورک‌فلوی .github/workflows/scrape.yml هر ۳۰ دقیقه اجرا می‌شود، خروجی JSON و HTML دوزبانه را می‌سازد، آن را در ریپو کامیت می‌کند و در صورت تنظیم API_URL، نتایج را به /api/ingest می‌فرستد."
              : "The scraper/ folder contains the Python script (scrape.py), a FastAPI server (api.py) and a full README.md. The workflow .github/workflows/scrape.yml runs every 30 minutes, produces bilingual JSON + HTML output, commits it to the repo and — if API_URL is configured — pushes results to /api/ingest."}
          </p>
          <pre dir="ltr" className="overflow-x-auto rounded-2xl bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">
{`cd scraper
pip install -r requirements.txt
python scrape.py --limit 10            # → output/news.json + output/index.html
uvicorn api:app --reload --port 8000   # → http://localhost:8000/docs`}
          </pre>
        </div>
      </section>
    </main>
  );
}
