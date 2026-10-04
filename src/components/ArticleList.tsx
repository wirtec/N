"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLang } from "./LangProvider";
import { formatDate } from "@/lib/i18n";
import type { ArticleDTO } from "@/lib/types";

type ScrapeResult = { ok: boolean; itemsFound?: number; itemsNew?: number; itemsExtracted?: number; error?: string };

export function ArticleList({
  items,
  total,
  page,
  pages,
  q,
}: {
  items: ArticleDTO[];
  total: number;
  page: number;
  pages: number;
  q: string;
}) {
  const { lang, t } = useLang();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ScrapeResult | null>(null);

  async function refresh() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/scrape?limit=8", { method: "POST" });
      const data = (await res.json()) as ScrapeResult;
      setResult(data);
      router.refresh();
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("appName")}</h1>
          <p className="text-sm text-slate-500">
            {total} {t("total")} ·{" "}
            <a className="text-blue-600 hover:underline" href="/api/news?lang=both" target="_blank">
              {t("apiJson")}
            </a>{" "}
            ·{" "}
            <a className="text-blue-600 hover:underline" href="/api/feed" target="_blank">
              {t("feedLive")}
            </a>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <form action="/" className="flex">
            <input
              name="q"
              defaultValue={q}
              placeholder={t("search")}
              className="w-44 rounded-s-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
            <button className="rounded-e-lg border border-s-0 border-slate-300 bg-white px-3 text-sm hover:bg-slate-100">🔍</button>
          </form>
          <button
            onClick={refresh}
            disabled={busy}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-60"
          >
            {busy ? t("refreshing") : t("refresh")}
          </button>
        </div>
      </div>

      {result && (
        <div
          className={`mb-6 rounded-lg border px-4 py-3 text-sm ${result.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}
        >
          {result.ok
            ? `${t("refreshDone")}: ${result.itemsFound ?? 0} items · ${result.itemsNew ?? 0} new · ${result.itemsExtracted ?? 0} ${t("extracted")}`
            : `${t("error")}: ${result.error}`}
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
          {t("noArticles")}
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((a) => {
            const loc = a[lang];
            return (
              <article
                key={a.id}
                className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
              >
                <Link href={`/news/${a.id}`} className="block aspect-[16/9] w-full overflow-hidden bg-slate-100">
                  {a.top_image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.top_image} alt="" className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-4xl text-slate-300">📰</div>
                  )}
                </Link>
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="truncate font-medium text-blue-700">{a.source ?? "—"}</span>
                    <span>{formatDate(a.pub_date, lang)}</span>
                  </div>
                  <Link href={`/news/${a.id}`} className="text-base font-bold leading-snug text-slate-900 hover:text-blue-700">
                    {loc.title}
                  </Link>
                  {loc.excerpt && <p className="line-clamp-3 text-sm text-slate-600">{loc.excerpt}</p>}
                  {a.related_links.length > 0 && (
                    <details className="mt-1 text-xs">
                      <summary className="cursor-pointer text-slate-500">
                        {t("relatedLinks")} ({a.related_links.length})
                      </summary>
                      <ul className="mt-2 space-y-1">
                        {a.related_links.slice(0, 6).map((r, i) => (
                          <li key={i} className="truncate">
                            <a href={r.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                              {r.title}
                            </a>
                            {r.source && <span className="text-slate-400"> · {r.source}</span>}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <div className="mt-auto flex items-center justify-between pt-2 text-xs">
                    <span
                      className={`rounded-full px-2 py-0.5 ${a.extracted ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
                    >
                      {a.extracted ? t("extracted") : t("pending")} · {a.images.length} 🖼
                    </span>
                    <Link href={`/news/${a.id}`} className="font-semibold text-blue-600 hover:underline">
                      {t("readMore")} →
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {pages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-3 text-sm">
          <Link
            aria-disabled={page <= 1}
            className={`rounded-lg border px-3 py-1.5 ${page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-white"}`}
            href={`/?page=${page - 1}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
          >
            {t("prev")}
          </Link>
          <span className="text-slate-600">
            {t("page")} {page} / {pages}
          </span>
          <Link
            aria-disabled={page >= pages}
            className={`rounded-lg border px-3 py-1.5 ${page >= pages ? "pointer-events-none opacity-40" : "hover:bg-white"}`}
            href={`/?page=${page + 1}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
          >
            {t("next")}
          </Link>
        </div>
      )}
    </main>
  );
}
