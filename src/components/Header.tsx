"use client";

import Link from "next/link";
import { useLang } from "./LangProvider";

export function Header() {
  const { lang, setLang, t } = useLang();
  const font = lang === "fa" ? "font-[Vazirmatn,Tahoma,sans-serif]" : "";
  return (
    <header className={`sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur ${font}`}>
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow">
            📰
          </span>
          <div className="leading-tight">
            <div className="text-base font-bold text-slate-900">{t("appName")}</div>
            <div className="hidden text-xs text-slate-500 sm:block">{t("tagline")}</div>
          </div>
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          <Link href="/" className="rounded-lg px-3 py-1.5 text-slate-700 hover:bg-slate-100">
            {t("home")}
          </Link>
          <Link href="/docs" className="rounded-lg px-3 py-1.5 text-slate-700 hover:bg-slate-100">
            {t("docs")}
          </Link>
          <div className="ms-2 flex overflow-hidden rounded-lg border border-slate-300 text-xs font-semibold">
            <button
              onClick={() => setLang("en")}
              className={`px-3 py-1.5 ${lang === "en" ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-100"}`}
            >
              EN
            </button>
            <button
              onClick={() => setLang("fa")}
              className={`px-3 py-1.5 ${lang === "fa" ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-100"}`}
            >
              فا
            </button>
          </div>
        </nav>
      </div>
    </header>
  );
}
