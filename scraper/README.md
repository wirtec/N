# Google News RSS Scraper · خبرخوان گوگل‌نیوز

Scrapes this feed (or any Google News RSS feed):

```
https://news.google.com/rss/topics/CAAqKggKIiRDQkFTRlFvSUwyMHZNRGRqTVhZU0JXVnVMVlZUR2dKVlV5Z0FQAQ?hl=en-US&gl=US&ceid=US:en
```

For every item it collects → **title, date, link**, all **links inside the description with their titles**, the **real publisher URL**, the **full article text**, **all images** of the article, and a **Persian translation** (title / excerpt / content).  
Output is a JSON API + a bilingual (EN / FA) HTML page.

---

## 🇬🇧 English guide

### 1. Run locally

```bash
cd scraper
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

python scrape.py --limit 10          # opens up to 10 articles, translates to Persian
python scrape.py --no-translate      # skip translation
python scrape.py --feed "<other google news rss url>" --out output
```

Results:

| File | Description |
|------|-------------|
| `output/news.json` | all items (feed fields + `source_url`, `content`, `content_fa`, `images[]`, `related_links[]`) |
| `output/index.html` | standalone bilingual web page with all images — open it in a browser |

### 2. Python API (FastAPI)

```bash
uvicorn api:app --reload --port 8000
```

| Endpoint | Description |
|----------|-------------|
| `GET /` | bilingual HTML page |
| `GET /api/news?lang=en\|fa\|both&page=1&limit=20&full=1` | list of scraped news |
| `GET /api/news/{index}?lang=both` | one article, both languages, all images |
| `GET /api/feed` | live RSS parse only (title, date, link, description links) |
| `POST /api/scrape?limit=5` | run the scraper now |
| `GET /docs` | Swagger UI |

### 3. GitHub Actions (automatic every 30 min)

1. Push this repository to GitHub.
2. **Settings → Actions → General → Workflow permissions** → *Read and write permissions*.
3. (Optional) **Settings → Secrets and variables → Actions**
   * secret `API_URL` – base URL of the Next.js app (e.g. `https://my-app.vercel.app`) → results are pushed to `POST /api/ingest`
   * secret `INGEST_TOKEN` – same value as the `INGEST_TOKEN` env of the web app
   * variable `FEED_URL` – override the feed
   * variable `PUBLISH_PAGES=true` – also deploy `output/` to GitHub Pages (enable Pages → Source: *GitHub Actions*)
4. Go to **Actions → “Scrape Google News (EN/FA)” → Run workflow** to trigger the first run.  
   Afterwards it runs automatically every 30 minutes, commits `scraper/output/news.json` + `index.html`, and uploads them as an artifact.

Raw JSON will be available at:
`https://raw.githubusercontent.com/<user>/<repo>/main/scraper/output/news.json`  
and, with Pages enabled, the HTML at `https://<user>.github.io/<repo>/`.

### 4. Web app (Next.js + PostgreSQL) — same project root

The Next.js app in the repo root offers the same pipeline in TypeScript plus a database:

| Endpoint | Description |
|----------|-------------|
| `GET /api/feed` | live RSS: title, date, link, description links |
| `POST /api/scrape?limit=8` | scrape + extract + translate into PostgreSQL |
| `GET /api/news?lang=fa` | stored articles (paginated, searchable) |
| `GET /api/news/:id?lang=both` | full article, EN + FA, all images |
| `POST /api/ingest` | receives the Python output (`news.json`) |
| `GET /api/runs` | scrape history |

Pages: `/` (list), `/news/:id` (article), `/docs` (API guide). Language switch EN/FA in the header.  
Env vars: `DATABASE_URL`, optional `SCRAPE_TOKEN`, `INGEST_TOKEN`.

---

## 🇮🇷 راهنمای فارسی

### ۱. اجرای محلی

```bash
cd scraper
python -m venv .venv && source .venv/bin/activate   # ویندوز: .venv\Scripts\activate
pip install -r requirements.txt

python scrape.py --limit 10          # حداکثر ۱۰ خبر را باز می‌کند و به فارسی ترجمه می‌کند
python scrape.py --no-translate      # بدون ترجمه
python scrape.py --feed "<آدرس فید دیگر>" --out output
```

خروجی‌ها:

| فایل | توضیح |
|------|-------|
| `output/news.json` | همهٔ خبرها: عنوان، تاریخ، لینک گوگل، لینک اصلی، لینک‌های داخل توضیحات با عنوان، متن کامل انگلیسی و فارسی، همهٔ تصاویر |
| `output/index.html` | صفحهٔ وب دوزبانهٔ مستقل با همهٔ تصاویر — کافیست در مرورگر باز کنید |

### ۲. API پایتون (FastAPI)

```bash
uvicorn api:app --reload --port 8000
```

* `GET /` → صفحهٔ HTML دوزبانه
* `GET /api/news?lang=fa` → فهرست خبرها (`lang` می‌تواند `en`، `fa` یا `both` باشد)
* `GET /api/news/0?lang=both` → یک خبر با متن کامل هر دو زبان و همهٔ تصاویر
* `GET /api/feed` → فقط خواندن فید (عنوان، تاریخ، لینک، لینک‌های توضیحات)
* `POST /api/scrape?limit=5` → اجرای فوری اسکریپر
* `GET /docs` → مستندات Swagger

### ۳. اجرای خودکار با GitHub Actions (هر ۳۰ دقیقه)

۱. ریپو را روی گیت‌هاب پوش کنید.  
۲. **Settings → Actions → General → Workflow permissions** را روی *Read and write permissions* بگذارید.  
۳. (اختیاری) در **Settings → Secrets and variables → Actions**:
   * سکرت `API_URL` = آدرس اپ Next.js (مثلاً `https://my-app.vercel.app`) تا نتایج به `POST /api/ingest` ارسال شود
   * سکرت `INGEST_TOKEN` = همان مقدار متغیر `INGEST_TOKEN` در اپ وب
   * متغیر `FEED_URL` برای تغییر فید
   * متغیر `PUBLISH_PAGES=true` برای انتشار خودکار روی GitHub Pages (در Pages گزینهٔ Source را روی *GitHub Actions* بگذارید)
۴. از تب **Actions → Scrape Google News (EN/FA) → Run workflow** اولین اجرا را دستی بزنید. بعد از آن هر ۳۰ دقیقه خودکار اجرا می‌شود، فایل‌های `scraper/output/news.json` و `index.html` را در ریپو کامیت می‌کند و به‌عنوان Artifact هم آپلود می‌کند.

آدرس JSON خام:
`https://raw.githubusercontent.com/<user>/<repo>/main/scraper/output/news.json`  
و با فعال بودن Pages صفحهٔ HTML در: `https://<user>.github.io/<repo>/`

### ۴. اپ وب (Next.js + PostgreSQL)

اپ Next.js در ریشهٔ پروژه همین پایپ‌لاین را با TypeScript و پایگاه‌داده ارائه می‌دهد:

* `GET /api/feed` → فید زنده
* `POST /api/scrape?limit=8` → واکشی، استخراج متن و تصاویر، ترجمه و ذخیره در PostgreSQL
* `GET /api/news?lang=fa` → خبرهای ذخیره‌شده
* `GET /api/news/:id?lang=both` → خبر کامل دوزبانه با همهٔ تصاویر
* `POST /api/ingest` → دریافت خروجی اسکریپت پایتون
* صفحات: `/` فهرست، `/news/:id` خبر، `/docs` راهنمای API — دکمهٔ تغییر زبان EN/فا در هدر

---

## Notes / نکات

* Google News links (`news.google.com/rss/articles/...`) are encoded. The scraper decodes them via Google's internal `batchexecute` endpoint (with a legacy base64 fallback). If Google changes this again, `source_url` will be empty and `extract_error` explains why.
* Translation uses the free Google Translate endpoint (`deep-translator`). Long articles are chunked; the body is capped at ~12 000 characters. If translation fails, the English text is used as fallback.
* Some publishers block bots (403 / paywall). Those items keep title/date/links but `content` stays empty and `extract_error` is set.
* لینک‌های گوگل‌نیوز کدگذاری‌شده‌اند و اسکریپت آن‌ها را به لینک اصلی ناشر تبدیل می‌کند. برخی سایت‌ها ربات‌ها را مسدود می‌کنند؛ در این حالت عنوان/تاریخ/لینک ذخیره می‌شود ولی متن خالی می‌ماند و علت در `extract_error` می‌آید.
