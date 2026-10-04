import { USER_AGENT } from "./rss";

/**
 * Free translation via Google's public `gtx` endpoint (no API key).
 * Long texts are translated in chunks. If translation fails, we return null
 * and callers fall back to the original text.
 */
const MAX_CHUNK = 4000;

function splitChunks(text: string): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const para of text.split(/\n{2,}/)) {
    if ((current + "\n\n" + para).length > MAX_CHUNK && current) {
      chunks.push(current);
      current = para;
    } else {
      current = current ? current + "\n\n" + para : para;
    }
  }
  if (current) chunks.push(current);
  // Split any single oversized chunk by sentences
  return chunks.flatMap((c) => {
    if (c.length <= MAX_CHUNK) return [c];
    const out: string[] = [];
    let buf = "";
    for (const s of c.split(/(?<=[.!?])\s+/)) {
      if ((buf + " " + s).length > MAX_CHUNK && buf) {
        out.push(buf);
        buf = s;
      } else buf = buf ? buf + " " + s : s;
    }
    if (buf) out.push(buf);
    return out;
  });
}

async function translateChunk(text: string, target: string, source = "auto"): Promise<string> {
  const url =
    "https://translate.googleapis.com/translate_a/single?client=gtx&dt=t" +
    `&sl=${encodeURIComponent(source)}&tl=${encodeURIComponent(target)}&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, cache: "no-store" });
  if (!res.ok) throw new Error(`translate HTTP ${res.status}`);
  const data = (await res.json()) as unknown;
  const segments = Array.isArray(data) && Array.isArray(data[0]) ? (data[0] as unknown[]) : [];
  return segments
    .map((seg) => (Array.isArray(seg) && typeof seg[0] === "string" ? seg[0] : ""))
    .join("");
}

export async function translateText(
  text: string | null | undefined,
  target: "fa" | "en",
  source: "auto" | "en" | "fa" = "auto",
): Promise<string | null> {
  if (!text || !text.trim()) return null;
  try {
    const chunks = splitChunks(text.trim());
    const out: string[] = [];
    for (const c of chunks) {
      out.push(await translateChunk(c, target, source));
    }
    return out.join("\n\n");
  } catch {
    return null;
  }
}
