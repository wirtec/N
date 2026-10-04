"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { dict, type UiLang, type DictKey } from "@/lib/i18n";

type Ctx = {
  lang: UiLang;
  setLang: (l: UiLang) => void;
  t: (k: DictKey) => string;
  dir: "rtl" | "ltr";
};

const LangContext = createContext<Ctx>({
  lang: "en",
  setLang: () => {},
  t: (k) => dict.en[k],
  dir: "ltr",
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<UiLang>("en");

  useEffect(() => {
    const saved = (typeof window !== "undefined" && window.localStorage.getItem("lang")) as UiLang | null;
    if (saved === "fa" || saved === "en") setLangState(saved);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "fa" ? "rtl" : "ltr";
  }, [lang]);

  const setLang = (l: UiLang) => {
    setLangState(l);
    try {
      window.localStorage.setItem("lang", l);
    } catch {}
  };

  const value: Ctx = {
    lang,
    setLang,
    t: (k) => dict[lang][k],
    dir: lang === "fa" ? "rtl" : "ltr",
  };
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang() {
  return useContext(LangContext);
}
