import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { LangProvider } from "@/components/LangProvider";
import { Header } from "@/components/Header";

export const metadata: Metadata = {
  title: "Google News Scraper — خبرخوان گوگل‌نیوز",
  description:
    "Scrapes a Google News RSS topic feed: titles, dates, links, description links, full article text and images — in English and Persian.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <LangProvider>
          <Header />
          {children}
          <footer className="mx-auto max-w-6xl px-4 py-10 text-center text-xs text-slate-400">
            Google News RSS → Python / Next.js scraper · EN / FA
          </footer>
        </LangProvider>
      </body>
    </html>
  );
}
