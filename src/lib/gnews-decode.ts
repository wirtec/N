import { USER_AGENT } from "./rss";

/**
 * Google News RSS links look like
 *   https://news.google.com/rss/articles/CBMi...?oc=5
 * They are not real publisher URLs. Google changed the encoding in 2024, so we:
 *  1. Try the legacy base64 decoding (works for old-style links).
 *  2. Otherwise fetch the article page to obtain a signature + timestamp and ask
 *     Google's internal `batchexecute` endpoint for the real URL.
 */

export function extractArticleId(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith("news.google.com")) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    const idx = parts.findIndex((p) => p === "articles" || p === "read");
    if (idx === -1) return null;
    return parts[idx + 1] ?? null;
  } catch {
    return null;
  }
}

function base64UrlDecode(s: string): Uint8Array {
  let b = s.replace(/-/g, "+").replace(/_/g, "/");
  while (b.length % 4) b += "=";
  return new Uint8Array(Buffer.from(b, "base64"));
}

/** Legacy decoder: the ID contains the URL as a length-prefixed string. */
export function decodeLegacy(id: string): string | null {
  try {
    const bytes = base64UrlDecode(id);
    const text = Buffer.from(bytes).toString("latin1");
    // Strip protobuf-ish prefix "\x08\x13\x22"
    let body = text;
    const prefix = "\x08\x13\x22";
    if (body.startsWith(prefix)) body = body.slice(prefix.length);
    const suffix = "\xd2\x01\x00";
    if (body.endsWith(suffix)) body = body.slice(0, -suffix.length);
    // Length prefix (1 or 2 bytes varint)
    let len = body.charCodeAt(0);
    let start = 1;
    if (len >= 0x80) {
      len = (len & 0x7f) | (body.charCodeAt(1) << 7);
      start = 2;
    }
    const candidate = body.slice(start, start + len);
    if (candidate.startsWith("AU_yqL")) return null; // new format, needs batchexecute
    const utf8 = Buffer.from(candidate, "latin1").toString("utf8");
    if (/^https?:\/\//.test(utf8)) return utf8;
    return null;
  } catch {
    return null;
  }
}

async function getDecodingParams(id: string): Promise<{ signature: string; timestamp: string } | null> {
  const urls = [
    `https://news.google.com/articles/${id}`,
    `https://news.google.com/rss/articles/${id}`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        cache: "no-store",
        redirect: "follow",
      });
      if (!res.ok) continue;
      const html = await res.text();
      const sig = /data-n-a-sg="([^"]+)"/.exec(html)?.[1];
      const ts = /data-n-a-ts="([^"]+)"/.exec(html)?.[1];
      if (sig && ts) return { signature: sig, timestamp: ts };
    } catch {
      // try next
    }
  }
  return null;
}

export async function decodeGoogleNewsUrl(url: string): Promise<string | null> {
  const id = extractArticleId(url);
  if (!id) return null;

  const legacy = decodeLegacy(id);
  if (legacy) return legacy;

  const params = await getDecodingParams(id);
  if (!params) return null;

  const inner = JSON.stringify([
    "garturlreq",
    [
      ["X", "X", ["X", "X"], null, null, 1, 1, "US:en", null, 1, null, null, null, null, null, 0, 1],
      "X",
      "X",
      1,
      [1, 1, 1],
      1,
      1,
      null,
      0,
      0,
      null,
      0,
    ],
    id,
    Number(params.timestamp),
    params.signature,
  ]);
  const req = [[["Fbv4je", inner, null, "generic"]]];
  const body = `f.req=${encodeURIComponent(JSON.stringify(req))}`;

  try {
    const res = await fetch("https://news.google.com/_/DotsSplashUi/data/batchexecute", {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const text = await res.text();
    const chunks = text.split("\n\n");
    const payload = chunks[1] ?? chunks[0];
    const parsed = JSON.parse(payload) as unknown[];
    for (const entry of parsed) {
      if (Array.isArray(entry) && entry[0] === "wrb.fr" && typeof entry[2] === "string") {
        const innerParsed = JSON.parse(entry[2]) as unknown[];
        const real = innerParsed?.[1];
        if (typeof real === "string" && /^https?:\/\//.test(real)) return real;
      }
    }
  } catch {
    return null;
  }
  return null;
}

/** Resolve a URL if it's a Google News link; otherwise return it untouched. */
export async function resolveUrl(url: string): Promise<string | null> {
  if (!extractArticleId(url)) return url;
  return decodeGoogleNewsUrl(url);
}
