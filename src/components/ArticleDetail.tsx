"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLang } from "./LangProvider";
import { formatDate } from "@/lib/i18n";
import type { ArticleDTO } from "@/lib/types";

type View = "en" | "fa" | "both";

export function ArticleDetail({ article: a }: { article: ArticleDTO }) {
  const { lang, t } = useLang();
  const router = useRouter();
  const [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const activeView: View = view ?? lang;

  async function reextract() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/news/${a.id}`, { method: "POST" });
      const data = await res.json();
      if (!data.ok) setErr(data.error ?? "error");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const title = a[lang].title;

  const renderContent = (text: string | null | undefined, dir: "rtl" | "ltr") =>
    text && text.trim() ? (
      <div dir={dir} className={`prose-news text-[15px] text-slate-800 ${dir === "rtl" ? "text-right" : "text-left"}`}>
        {text.split(/\n{2,}|\n/).filter(Boolean).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    ) : (
      <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{t("noContent")}</p>
    );

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <Link href="/" className="text-sm text-blue-600 hover:underline">
        ← {t("back")}
      </Link>

      <header className="mt-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          {a.source && <span className="rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-700">{a.source}</span>}
          <span>
            {t("published")}: {formatDate(a.pub_date, lang)}
          </span>
          <span>·</span>
          <span>
            {t("updated")}: {formatDate(a.updated_at, lang)}
          </span>
        </div>
        <h1 className="mt-2 text-2xl font-bold leading-snug text-slate-900 sm:text-3xl">{title}</h1>
        {lang === "en" && a.fa.title !== a.en.title && (
          <p dir="rtl" className="mt-2 text-right text-lg text-slate-600" style={{ fontFamily: "Vazirmatn, Tahoma, sans-serif" }}>
            {a.fa.title}
          </p>
        )}
        {lang === "fa" && a.fa.title !== a.en.title && (
          <p dir="ltr" className="mt-2 text-left text-lg text-slate-600">
            {a.en.title}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          {a.source_url && (
            <a
              href={a.source_url}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-slate-900 px-3 py-1.5 font-medium text-white hover:bg-slate-700"
            >
              {t("original")} ↗
            </a>
          )}
          <a
            href={a.google_link}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-100"
          >
            {t("googleLink")} ↗
          </a>
          <a
            href={`/api/news/${a.id}?lang=both`}
            target="_blank"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-100"
          >
            {t("apiJson")} ↗
          </a>
          <button
            onClick={reextract}
            disabled={busy}
            className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-blue-700 hover:bg-blue-100 disabled:opacity-50"
          >
            {busy ? "…" : `↻ ${t("reextract")}`}
          </button>
        </div>
        {(err || a.extract_error) && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
            {t("error")}: {err ?? a.extract_error}
          </p>
        )}
      </header>

      {a.top_image && (
        <figure className="mt-6 overflow-hidden rounded-2xl bg-slate-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={a.top_image} alt={title} className="max-h-[480px] w-full object-cover" referrerPolicy="no-referrer" />
        </figure>
      )}

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">{t("content")}</h2>
          <div className="flex overflow-hidden rounded-lg border border-slate-300 text-xs font-semibold">
            {(["en", "fa", "both"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 ${activeView === v ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-100"}`}
              >
                {v === "en" ? t("english") : v === "fa" ? t("persian") : t("bothLangs")}
              </button>
            ))}
          </div>
        </div>
        <div className={`grid gap-6 ${activeView === "both" ? "md:grid-cols-2" : ""}`}>
          {(activeView === "en" || activeView === "both") && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">English</div>
              {renderContent(a.en.content, "ltr")}
            </div>
          )}
          {(activeView === "fa" || activeView === "both") && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5" style={{ fontFamily: "Vazirmatn, Tahoma, sans-serif" }}>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">فارسی</div>
              {renderContent(a.fa.content, "rtl")}
            </div>
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold">
          {t("images")} ({a.images.length})
        </h2>
        {a.images.length === 0 ? (
          <p className="text-sm text-slate-500">{t("noImages")}</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {a.images.map((src, i) => (
              <a key={i} href={src} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-xl bg-slate-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="aspect-[4/3] w-full object-cover transition group-hover:scale-105"
                />
              </a>
            ))}
          </div>
        )}
      </section>

      {a.related_links.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold">{t("relatedLinks")}</h2>
          <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
            {a.related_links.map((r, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <a href={r.url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">
                  {r.title}
                </a>
                {r.source && <span className="shrink-0 text-xs text-slate-400">{r.source}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
