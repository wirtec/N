#!/usr/bin/env python3
"""
Google News RSS scraper  —  اسکریپر فید RSS گوگل‌نیوز
======================================================

For every item in the feed it collects:
  * title, pubDate, link (Google News link) and source
  * every link inside <description> together with its title + source
  * the REAL publisher URL (Google News links are encoded and must be decoded)
  * the full article text and ALL images of the article
  * Persian translation of title / excerpt / content (free Google Translate)

Outputs:
  output/news.json    – machine readable (used by /api/ingest of the Next.js app)
  output/index.html   – standalone bilingual (EN/FA) web page with all images
  optional: POST to  $API_URL/api/ingest  (Bearer $INGEST_TOKEN)

Usage:
  pip install -r requirements.txt
  python scrape.py --limit 10
  python scrape.py --feed "<rss url>" --no-translate --out output
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html import escape, unescape
from pathlib import Path
from typing import Any
from urllib.parse import quote, urljoin, urlparse

import feedparser
import requests
from bs4 import BeautifulSoup

DEFAULT_FEED = (
    "https://news.google.com/rss/topics/"
    "CAAqKggKIiRDQkFTRlFvSUwyMHZNRGRqTVhZU0JXVnVMVlZUR2dKVlV5Z0FQAQ?hl=en-US&gl=US&ceid=US:en"
)
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"})

IMG_BLOCK = re.compile(r"(pixel|tracking|1x1|spacer|blank\.gif|logo|icon|avatar|sprite|badge|\.svg(\?|$))", re.I)


# --------------------------------------------------------------------------- #
# Data model
# --------------------------------------------------------------------------- #
@dataclass
class RelatedLink:
    title: str
    url: str
    source: str | None = None


@dataclass
class Article:
    guid: str
    title: str
    google_link: str
    pub_date: str | None
    source: str | None
    description_html: str
    related_links: list[RelatedLink] = field(default_factory=list)
    source_url: str | None = None
    title_fa: str | None = None
    excerpt: str | None = None
    excerpt_fa: str | None = None
    content: str | None = None
    content_fa: str | None = None
    top_image: str | None = None
    images: list[str] = field(default_factory=list)
    extract_error: str | None = None


# --------------------------------------------------------------------------- #
# 1) RSS: title / date / link / description links
# --------------------------------------------------------------------------- #
def parse_description_links(html: str) -> list[RelatedLink]:
    """Google puts <ol><li><a href=URL>Title</a> <font>Source</font></li></ol> in description."""
    if not html:
        return []
    soup = BeautifulSoup(unescape(html), "html.parser")
    out: list[RelatedLink] = []
    lis = soup.find_all("li")
    if lis:
        for li in lis:
            a = li.find("a")
            if not a or not a.get("href"):
                continue
            font = li.find("font")
            out.append(RelatedLink(title=a.get_text(" ", strip=True), url=a["href"], source=font.get_text(strip=True) if font else None))
    else:
        for a in soup.find_all("a", href=True):
            out.append(RelatedLink(title=a.get_text(" ", strip=True), url=a["href"]))
    return out


def fetch_feed(feed_url: str) -> list[Article]:
    resp = SESSION.get(feed_url, timeout=30)
    resp.raise_for_status()
    parsed = feedparser.parse(resp.content)
    items: list[Article] = []
    for e in parsed.entries:
        pub = None
        if e.get("published"):
            try:
                pub = parsedate_to_datetime(e["published"]).astimezone(timezone.utc).isoformat()
            except Exception:
                pub = None
        source = None
        if e.get("source") and isinstance(e["source"], dict):
            source = e["source"].get("title")
        desc = e.get("summary", "") or e.get("description", "")
        items.append(
            Article(
                guid=e.get("id") or e.get("link"),
                title=unescape(e.get("title", "")).strip(),
                google_link=e.get("link", ""),
                pub_date=pub,
                source=source,
                description_html=desc,
                related_links=parse_description_links(desc),
            )
        )
    return items


# --------------------------------------------------------------------------- #
# 2) Decode Google News links → real publisher URL
# --------------------------------------------------------------------------- #
def _article_id(url: str) -> str | None:
    p = urlparse(url)
    if not p.netloc.endswith("news.google.com"):
        return None
    parts = [x for x in p.path.split("/") if x]
    for key in ("articles", "read"):
        if key in parts:
            i = parts.index(key)
            return parts[i + 1] if i + 1 < len(parts) else None
    return None


def _decode_legacy(gid: str) -> str | None:
    try:
        pad = gid + "=" * (-len(gid) % 4)
        raw = base64.urlsafe_b64decode(pad)
        prefix, suffix = b"\x08\x13\x22", b"\xd2\x01\x00"
        if raw.startswith(prefix):
            raw = raw[len(prefix):]
        if raw.endswith(suffix):
            raw = raw[: -len(suffix)]
        length = raw[0]
        start = 1
        if length >= 0x80:
            length = (length & 0x7F) | (raw[1] << 7)
            start = 2
        cand = raw[start : start + length]
        if cand.startswith(b"AU_yqL"):
            return None
        txt = cand.decode("utf-8", "ignore")
        return txt if txt.startswith("http") else None
    except Exception:
        return None


def _decoding_params(gid: str) -> tuple[str, str] | None:
    for url in (f"https://news.google.com/articles/{gid}", f"https://news.google.com/rss/articles/{gid}"):
        try:
            r = SESSION.get(url, timeout=20)
            if r.status_code != 200:
                continue
            sig = re.search(r'data-n-a-sg="([^"]+)"', r.text)
            ts = re.search(r'data-n-a-ts="([^"]+)"', r.text)
            if sig and ts:
                return sig.group(1), ts.group(1)
        except Exception:
            pass
    return None


def decode_google_news_url(url: str) -> str | None:
    gid = _article_id(url)
    if not gid:
        return url  # already a normal URL
    legacy = _decode_legacy(gid)
    if legacy:
        return legacy
    params = _decoding_params(gid)
    if not params:
        return None
    sig, ts = params
    inner = json.dumps(
        [
            "garturlreq",
            [["X", "X", ["X", "X"], None, None, 1, 1, "US:en", None, 1, None, None, None, None, None, 0, 1],
             "X", "X", 1, [1, 1, 1], 1, 1, None, 0, 0, None, 0],
            gid,
            int(ts),
            sig,
        ]
    )
    payload = "f.req=" + quote(json.dumps([[["Fbv4je", inner, None, "generic"]]]))
    try:
        r = SESSION.post(
            "https://news.google.com/_/DotsSplashUi/data/batchexecute",
            data=payload,
            headers={"content-type": "application/x-www-form-urlencoded;charset=UTF-8"},
            timeout=20,
        )
        chunks = r.text.split("\n\n")
        body = json.loads(chunks[1] if len(chunks) > 1 else chunks[0])
        for entry in body:
            if isinstance(entry, list) and entry and entry[0] == "wrb.fr" and isinstance(entry[2], str):
                real = json.loads(entry[2])[1]
                if isinstance(real, str) and real.startswith("http"):
                    return real
    except Exception:
        return None
    return None


# --------------------------------------------------------------------------- #
# 3) Extract article text + all images
# --------------------------------------------------------------------------- #
def _abs(src: str | None, base: str) -> str | None:
    if not src:
        return None
    src = src.strip()
    if not src or src.startswith("data:"):
        return None
    return urljoin(base, src)


def _best_srcset(srcset: str) -> str | None:
    best, best_w = None, -1.0
    for cand in srcset.split(","):
        parts = cand.strip().split()
        if not parts:
            continue
        w = 0.0
        if len(parts) > 1:
            try:
                w = float(re.sub(r"[^\d.]", "", parts[1]) or 0)
            except ValueError:
                w = 0.0
        if w > best_w:
            best, best_w = parts[0], w
    return best


def collect_images(soup: BeautifulSoup, base: str, content_soup: BeautifulSoup | None) -> tuple[str | None, list[str]]:
    seen: dict[str, None] = {}
    top = None
    for sel, attr in (
        ('meta[property="og:image"]', "content"),
        ('meta[property="og:image:secure_url"]', "content"),
        ('meta[name="twitter:image"]', "content"),
        ('meta[name="twitter:image:src"]', "content"),
        ('link[rel="image_src"]', "href"),
    ):
        el = soup.select_one(sel)
        u = _abs(el.get(attr) if el else None, base)
        if u:
            top = top or u
            seen.setdefault(u)

    roots = []
    if content_soup is not None:
        roots.append(content_soup)
    art = soup.find("article")
    if art:
        roots.append(art)
    roots.append(soup.body or soup)

    for root in roots:
        for el in root.select("img, picture source"):
            cands = []
            ss = el.get("srcset") or el.get("data-srcset")
            if ss:
                b = _best_srcset(ss)
                if b:
                    cands.append(b)
            for a in ("src", "data-src", "data-lazy-src", "data-original", "data-url"):
                if el.get(a):
                    cands.append(el[a])
            for c in cands:
                u = _abs(c, base)
                if not u or IMG_BLOCK.search(u):
                    continue
                try:
                    w = int(re.sub(r"\D", "", str(el.get("width") or "0")) or 0)
                    h = int(re.sub(r"\D", "", str(el.get("height") or "0")) or 0)
                except ValueError:
                    w = h = 0
                if (w and w < 80) or (h and h < 80):
                    continue
                seen.setdefault(u)
                break
        if len(seen) >= 3 and root is not (soup.body or soup):
            break

    imgs = list(seen)[:40]
    if not top and imgs:
        top = imgs[0]
    return top, imgs


def extract_article(url: str) -> dict[str, Any]:
    r = SESSION.get(url, timeout=25, allow_redirects=True)
    r.raise_for_status()
    final_url = r.url
    html = r.text
    soup = BeautifulSoup(html, "lxml")

    text, excerpt, content_soup, title = "", None, None, None
    try:
        import trafilatura  # best-in-class boilerplate removal

        text = trafilatura.extract(html, url=final_url, include_comments=False, include_tables=False, favor_recall=True) or ""
        meta = trafilatura.extract_metadata(html, default_url=final_url)
        if meta:
            title = meta.title
            excerpt = meta.description
        body_html = trafilatura.extract(html, url=final_url, output_format="html", include_images=True, include_comments=False)
        if body_html:
            content_soup = BeautifulSoup(body_html, "lxml")
    except Exception:
        pass

    if not text.strip():
        paras = [p.get_text(" ", strip=True) for p in soup.select("article p, main p, p")]
        text = "\n\n".join(p for p in paras if len(p) > 40)
    if not excerpt:
        m = soup.select_one('meta[name="description"], meta[property="og:description"]')
        excerpt = m.get("content") if m else None
    if not title:
        title = soup.title.get_text(strip=True) if soup.title else None

    top, imgs = collect_images(soup, final_url, content_soup)
    site = soup.select_one('meta[property="og:site_name"]')
    return {
        "url": final_url,
        "title": title,
        "content": text.strip(),
        "excerpt": excerpt,
        "top_image": top,
        "images": imgs,
        "site_name": site.get("content") if site else None,
    }


# --------------------------------------------------------------------------- #
# 4) Translation (free)
# --------------------------------------------------------------------------- #
def translate(text: str | None, target: str = "fa", source: str = "en", max_chars: int = 12000) -> str | None:
    if not text or not text.strip():
        return None
    try:
        from deep_translator import GoogleTranslator

        tr = GoogleTranslator(source=source, target=target)
        text = text.strip()[:max_chars]
        chunks, cur = [], ""
        for para in re.split(r"\n{2,}", text):
            if len(cur) + len(para) + 2 > 4000 and cur:
                chunks.append(cur)
                cur = para
            else:
                cur = f"{cur}\n\n{para}" if cur else para
        if cur:
            chunks.append(cur)
        out = []
        for c in chunks:
            out.append(tr.translate(c[:4900]) or "")
            time.sleep(0.3)
        return "\n\n".join(out)
    except Exception as exc:  # never fail the whole run because of translation
        print(f"    ! translate failed: {exc}", file=sys.stderr)
        return None


# --------------------------------------------------------------------------- #
# 5) Pipeline
# --------------------------------------------------------------------------- #
def process(article: Article, do_translate: bool) -> Article:
    try:
        real = decode_google_news_url(article.google_link)
        if not real:
            article.extract_error = "Could not resolve Google News link"
            return article
        article.source_url = real
        data = extract_article(real)
        article.source_url = data["url"]
        article.content = data["content"] or None
        article.excerpt = data["excerpt"]
        article.top_image = data["top_image"]
        article.images = data["images"]
        article.source = article.source or data["site_name"]
        if do_translate:
            article.title_fa = translate(article.title)
            article.excerpt_fa = translate(article.excerpt)
            article.content_fa = translate(article.content)
    except Exception as exc:
        article.extract_error = str(exc)[:300]
    return article


def load_previous(path: Path) -> dict[str, dict]:
    if path.exists():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            return {i["guid"]: i for i in data.get("items", [])}
        except Exception:
            return {}
    return {}


def run(feed_url: str, limit: int, do_translate: bool, out_dir: Path, workers: int, keep: int) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / "news.json"
    previous = load_previous(json_path)

    print(f"→ fetching feed: {feed_url}")
    items = fetch_feed(feed_url)
    print(f"  {len(items)} items in feed")

    todo = [a for a in items if a.guid not in previous or not previous[a.guid].get("content")][:limit]
    print(f"→ extracting {len(todo)} article(s) (limit={limit}, translate={do_translate})")

    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = {ex.submit(process, a, do_translate): a for a in todo}
        for f in as_completed(futs):
            a = f.result()
            status = "ok" if a.content else f"ERR {a.extract_error}"
            print(f"  [{status}] {a.title[:70]}  ({len(a.images)} img)")

    # merge: new/updated + previously scraped, ordered by date desc, keep last N
    merged: dict[str, dict] = dict(previous)
    for a in items:
        d = asdict(a)
        if a.guid in merged and not a.content:
            # keep old extraction, refresh feed-level fields
            old = merged[a.guid]
            old.update({k: d[k] for k in ("title", "pub_date", "source", "description_html", "related_links", "google_link")})
        else:
            merged[a.guid] = d
    ordered = sorted(merged.values(), key=lambda x: x.get("pub_date") or "", reverse=True)[:keep]

    result = {
        "feed_url": feed_url,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "count": len(ordered),
        "items": ordered,
    }
    json_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    (out_dir / "index.html").write_text(render_html(result), encoding="utf-8")
    print(f"✓ wrote {json_path} and {out_dir / 'index.html'}")
    return result


def push_to_api(result: dict) -> None:
    api = os.environ.get("API_URL", "").rstrip("/")
    if not api:
        return
    token = os.environ.get("INGEST_TOKEN", "")
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    payload = {"feed_url": result["feed_url"], "items": result["items"]}
    r = requests.post(f"{api}/api/ingest", json=payload, headers=headers, timeout=120)
    print(f"→ pushed to {api}/api/ingest: {r.status_code} {r.text[:200]}")


# --------------------------------------------------------------------------- #
# 6) Static bilingual HTML
# --------------------------------------------------------------------------- #
def render_html(result: dict) -> str:
    def paras(txt: str | None) -> str:
        if not txt:
            return '<p class="muted">—</p>'
        return "".join(f"<p>{escape(p)}</p>" for p in re.split(r"\n+", txt) if p.strip())

    cards = []
    for i, a in enumerate(result["items"]):
        imgs = "".join(
            f'<a href="{escape(u)}" target="_blank"><img loading="lazy" referrerpolicy="no-referrer" src="{escape(u)}"></a>'
            for u in a.get("images", [])
        )
        rel = "".join(
            f'<li><a href="{escape(r["url"])}" target="_blank">{escape(r["title"])}</a>'
            f'{" <small>· " + escape(r["source"]) + "</small>" if r.get("source") else ""}</li>'
            for r in a.get("related_links", [])
        )
        title_fa = a.get("title_fa") or a["title"]
        cards.append(
            f"""
<article id="a{i}">
  <div class="meta"><b>{escape(a.get('source') or '')}</b> · {escape(a.get('pub_date') or '')}</div>
  <h2 class="en">{escape(a['title'])}</h2>
  <h2 class="fa" dir="rtl">{escape(title_fa)}</h2>
  <div class="links">
    {f'<a class="btn" href="{escape(a["source_url"])}" target="_blank">Original ↗</a>' if a.get('source_url') else ''}
    <a class="btn ghost" href="{escape(a['google_link'])}" target="_blank">Google News ↗</a>
  </div>
  {f'<img class="hero" referrerpolicy="no-referrer" src="{escape(a["top_image"])}">' if a.get('top_image') else ''}
  <div class="cols">
    <section class="en"><h3>English</h3>{paras(a.get('content'))}</section>
    <section class="fa" dir="rtl"><h3>فارسی</h3>{paras(a.get('content_fa'))}</section>
  </div>
  <h4 class="en">Images ({len(a.get('images', []))})</h4><h4 class="fa" dir="rtl">تصاویر ({len(a.get('images', []))})</h4>
  <div class="gallery">{imgs}</div>
  {f'<h4 class="en">Links in description</h4><h4 class="fa" dir="rtl">لینک‌های داخل توضیحات</h4><ul class="rel">{rel}</ul>' if rel else ''}
  {f'<p class="err">Error: {escape(a["extract_error"])}</p>' if a.get('extract_error') else ''}
</article>"""
        )

    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Google News Scraper — خبرخوان گوگل‌نیوز</title>
<link href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css" rel="stylesheet">
<style>
:root{{--bg:#f6f7fb;--card:#fff;--text:#0f172a;--muted:#64748b;--accent:#2563eb}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--text);font-family:system-ui,Segoe UI,Roboto,sans-serif}}
.fa,[dir=rtl]{{font-family:Vazirmatn,Tahoma,sans-serif}}
header{{position:sticky;top:0;background:#fff;border-bottom:1px solid #e2e8f0;padding:12px 20px;display:flex;justify-content:space-between;align-items:center;z-index:9}}
main{{max-width:900px;margin:0 auto;padding:20px}}
article{{background:var(--card);border:1px solid #e2e8f0;border-radius:16px;padding:20px;margin-bottom:24px}}
h2{{margin:6px 0;font-size:1.3rem;line-height:1.4}}.meta{{font-size:.8rem;color:var(--muted)}}
.btn{{display:inline-block;background:#0f172a;color:#fff;border-radius:8px;padding:6px 12px;font-size:.85rem;text-decoration:none;margin:6px 6px 6px 0}}
.btn.ghost{{background:#fff;color:#0f172a;border:1px solid #cbd5e1}}
.hero{{width:100%;max-height:420px;object-fit:cover;border-radius:12px;margin:10px 0}}
.cols{{display:grid;gap:16px}}@media(min-width:800px){{.mode-both .cols{{grid-template-columns:1fr 1fr}}}}
section{{background:#f8fafc;border-radius:12px;padding:14px}}section p{{line-height:1.9;margin:0 0 10px}}
.gallery{{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px}}.gallery img{{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:8px;background:#e2e8f0}}
.rel{{padding-inline-start:18px;font-size:.9rem}}.rel a{{color:var(--accent)}}.muted{{color:var(--muted)}}.err{{color:#b91c1c;font-size:.8rem}}
.toggle button{{border:1px solid #cbd5e1;background:#fff;padding:6px 12px;cursor:pointer}}.toggle button.on{{background:#0f172a;color:#fff}}
body.mode-en .fa{{display:none}}body.mode-fa .en{{display:none}}
body.mode-fa{{direction:rtl}}
</style></head>
<body class="mode-both">
<header>
  <div><b>📰 Google News Scraper · خبرخوان گوگل‌نیوز</b><div class="meta">{result['count']} items · generated {escape(result['generated_at'])}</div></div>
  <div class="toggle">
    <button onclick="setMode('en')" id="b-en">EN</button><button onclick="setMode('fa')" id="b-fa">فا</button><button onclick="setMode('both')" id="b-both" class="on">EN+FA</button>
  </div>
</header>
<main>{''.join(cards)}</main>
<script>
function setMode(m){{document.body.className='mode-'+m;document.documentElement.lang=m==='fa'?'fa':'en';
['en','fa','both'].forEach(x=>document.getElementById('b-'+x).classList.toggle('on',x===m));localStorage.setItem('mode',m)}}
setMode(localStorage.getItem('mode')||'both');
</script>
</body></html>"""


# --------------------------------------------------------------------------- #
def main() -> None:
    ap = argparse.ArgumentParser(description="Scrape a Google News RSS feed: titles, dates, links, full text, images, EN+FA")
    ap.add_argument("--feed", default=os.environ.get("FEED_URL") or DEFAULT_FEED)
    ap.add_argument("--limit", type=int, default=int(os.environ.get("LIMIT", "10")), help="max articles to open per run")
    ap.add_argument("--no-translate", action="store_true", help="skip Persian translation")
    ap.add_argument("--out", default="output", help="output directory")
    ap.add_argument("--workers", type=int, default=3)
    ap.add_argument("--keep", type=int, default=300, help="max items kept in news.json")
    ap.add_argument("--push", action="store_true", help="POST results to $API_URL/api/ingest")
    args = ap.parse_args()

    result = run(args.feed, args.limit, not args.no_translate, Path(args.out), args.workers, args.keep)
    if args.push or os.environ.get("API_URL"):
        try:
            push_to_api(result)
        except Exception as exc:
            print(f"! push failed: {exc}", file=sys.stderr)


if __name__ == "__main__":
    main()
