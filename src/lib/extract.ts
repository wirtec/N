import { JSDOM, VirtualConsole } from "jsdom";
import { Readability } from "@mozilla/readability";
import { USER_AGENT } from "./rss";

export type ExtractedArticle = {
  url: string;
  title: string | null;
  content: string;
  excerpt: string | null;
  topImage: string | null;
  images: string[];
  siteName: string | null;
};

const IMG_BLOCKLIST = /(pixel|tracking|1x1|spacer|blank\.gif|logo|icon|avatar|sprite|badge|\.svg(\?|$))/i;

function absolutize(src: string, base: string): string | null {
  try {
    const s = src.trim();
    if (!s || s.startsWith("data:")) return null;
    return new URL(s, base).toString();
  } catch {
    return null;
  }
}

function pickFromSrcset(srcset: string): string | null {
  // choose the largest candidate
  const candidates = srcset
    .split(",")
    .map((c) => c.trim().split(/\s+/))
    .map(([u, d]) => ({ u, w: d ? parseFloat(d) : 0 }))
    .filter((c) => c.u);
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.w - a.w);
  return candidates[0].u;
}

export function collectImages(doc: Document, baseUrl: string, contentRoot?: Element | null): { top: string | null; all: string[] } {
  const set = new Set<string>();
  let top: string | null = null;

  const metaSelectors = [
    'meta[property="og:image"]',
    'meta[property="og:image:secure_url"]',
    'meta[name="twitter:image"]',
    'meta[name="twitter:image:src"]',
    'link[rel="image_src"]',
  ];
  for (const sel of metaSelectors) {
    const el = doc.querySelector(sel);
    const v = el?.getAttribute("content") ?? el?.getAttribute("href");
    const abs = v ? absolutize(v, baseUrl) : null;
    if (abs) {
      if (!top) top = abs;
      set.add(abs);
    }
  }

  const roots: ParentNode[] = [];
  if (contentRoot) roots.push(contentRoot);
  const article = doc.querySelector("article");
  if (article) roots.push(article);
  roots.push(doc.body ?? doc);

  for (const root of roots) {
    const imgs = Array.from(root.querySelectorAll("img, picture source, figure img"));
    for (const el of imgs) {
      const candidates: string[] = [];
      const srcset = el.getAttribute("srcset") || el.getAttribute("data-srcset");
      if (srcset) {
        const best = pickFromSrcset(srcset);
        if (best) candidates.push(best);
      }
      for (const attr of ["src", "data-src", "data-lazy-src", "data-original", "data-url"]) {
        const v = el.getAttribute(attr);
        if (v) candidates.push(v);
      }
      for (const c of candidates) {
        const abs = absolutize(c, baseUrl);
        if (!abs) continue;
        if (IMG_BLOCKLIST.test(abs)) continue;
        const w = parseInt(el.getAttribute("width") || "0", 10);
        const h = parseInt(el.getAttribute("height") || "0", 10);
        if ((w && w < 80) || (h && h < 80)) continue;
        set.add(abs);
        break;
      }
    }
    // Don't dump the entire page if we already have article images
    if (set.size >= 3 && root !== doc.body) break;
  }

  const all = Array.from(set).slice(0, 40);
  if (!top && all.length) top = all[0];
  return { top, all };
}

export async function fetchHtml(url: string, timeoutMs = 20000): Promise<{ html: string; finalUrl: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    return { html, finalUrl: res.url || url };
  } finally {
    clearTimeout(t);
  }
}

export async function extractArticle(url: string): Promise<ExtractedArticle> {
  const { html, finalUrl } = await fetchHtml(url);
  const virtualConsole = new VirtualConsole(); // silence CSS parse errors
  const dom = new JSDOM(html, { url: finalUrl, virtualConsole });
  const doc = dom.window.document;

  // Clone so Readability doesn't mutate the DOM we use for image collection
  const reader = new Readability(doc.cloneNode(true) as Document, { keepClasses: false });
  const parsed = reader.parse();

  let contentRoot: Element | null = null;
  let text = "";
  if (parsed?.content) {
    const contentDom = new JSDOM(parsed.content, { url: finalUrl, virtualConsole });
    contentRoot = contentDom.window.document.body;
    text = (parsed.textContent ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .join("\n\n");
    // images inside readability content, resolved against finalUrl
    const { top, all } = collectImages(doc, finalUrl, contentRoot);
    return {
      url: finalUrl,
      title: parsed.title || doc.title || null,
      content: text,
      excerpt: parsed.excerpt || null,
      topImage: top,
      images: all,
      siteName: parsed.siteName || null,
    };
  }

  // Fallback: paragraphs from the page
  const paras = Array.from(doc.querySelectorAll("article p, main p, p"))
    .map((p) => p.textContent?.trim() ?? "")
    .filter((p) => p.length > 40);
  text = paras.join("\n\n");
  const { top, all } = collectImages(doc, finalUrl, null);
  const metaDesc = doc.querySelector('meta[name="description"]')?.getAttribute("content") ?? null;
  return {
    url: finalUrl,
    title: doc.title || null,
    content: text,
    excerpt: metaDesc,
    topImage: top,
    images: all,
    siteName: doc.querySelector('meta[property="og:site_name"]')?.getAttribute("content") ?? null,
  };
}
