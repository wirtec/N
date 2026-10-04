"""
Minimal FastAPI server for the Python scraper output.
----------------------------------------------------
    uvicorn api:app --reload --port 8000
    open http://localhost:8000/docs   (Swagger UI)

Endpoints
    GET  /                      -> bilingual HTML page (output/index.html)
    GET  /api/news?lang=en|fa|both&limit=20&page=1
    GET  /api/news/{index}?lang=both
    GET  /api/feed              -> live RSS parse (title, date, link, description links)
    POST /api/scrape?limit=5    -> run the scraper now (blocking)
    GET  /health
"""
from __future__ import annotations

import json
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import HTMLResponse, JSONResponse

from scrape import DEFAULT_FEED, fetch_feed, run
from dataclasses import asdict

OUT = Path(__file__).parent / "output"
app = FastAPI(title="Google News Scraper API", version="1.0.0", description="Titles, dates, links, full text & images — EN/FA")


def _load() -> dict:
    p = OUT / "news.json"
    if not p.exists():
        return {"feed_url": DEFAULT_FEED, "generated_at": None, "count": 0, "items": []}
    return json.loads(p.read_text(encoding="utf-8"))


def _localize(item: dict, lang: str, full: bool = True) -> dict:
    base = {k: v for k, v in item.items() if k not in ("title", "title_fa", "excerpt", "excerpt_fa", "content", "content_fa")}
    en = {"title": item["title"], "excerpt": item.get("excerpt")}
    fa = {"title": item.get("title_fa") or item["title"], "excerpt": item.get("excerpt_fa") or item.get("excerpt")}
    if full:
        en["content"] = item.get("content")
        fa["content"] = item.get("content_fa") or item.get("content")
    if lang == "en":
        return {**base, "lang": "en", **en}
    if lang == "fa":
        return {**base, "lang": "fa", **fa}
    return {**base, "lang": "both", "en": en, "fa": fa}


@app.get("/", response_class=HTMLResponse)
def index():
    p = OUT / "index.html"
    if not p.exists():
        return HTMLResponse("<h1>No output yet</h1><p>Run <code>python scrape.py</code> or POST /api/scrape</p>")
    return HTMLResponse(p.read_text(encoding="utf-8"))


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/api/news")
def list_news(lang: str = Query("both", pattern="^(en|fa|both)$"), page: int = 1, limit: int = 20, full: bool = False):
    data = _load()
    items = data["items"]
    start = (max(page, 1) - 1) * limit
    return {
        "ok": True,
        "lang": lang,
        "page": page,
        "limit": limit,
        "total": len(items),
        "generated_at": data.get("generated_at"),
        "items": [{"index": start + i, **_localize(it, lang, full)} for i, it in enumerate(items[start : start + limit])],
    }


@app.get("/api/news/{index}")
def get_news(index: int, lang: str = Query("both", pattern="^(en|fa|both)$")):
    items = _load()["items"]
    if index < 0 or index >= len(items):
        raise HTTPException(404, "not found")
    return {"ok": True, "item": {"index": index, **_localize(items[index], lang, True)}}


@app.get("/api/feed")
def live_feed(url: str = DEFAULT_FEED):
    items = fetch_feed(url)
    return {"ok": True, "count": len(items), "items": [asdict(a) for a in items]}


@app.post("/api/scrape")
def scrape_now(limit: int = 5, translate: bool = True, feed: str = DEFAULT_FEED):
    result = run(feed, limit, translate, OUT, workers=3, keep=300)
    return JSONResponse({"ok": True, "count": result["count"], "generated_at": result["generated_at"]})
