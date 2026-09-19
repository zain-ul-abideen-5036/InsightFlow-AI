import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import { Providers } from "@/app/providers";
import { SITE_URL } from "@/lib/site";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "InsightFlow AI — Understand your business. Act on the data.",
    template: "%s · InsightFlow AI",
  },
  description:
    "InsightFlow AI turns your business data into clear trends, anomalies, explanations, " +
    "and actionable insights — with the evidence behind every figure.",
  keywords: [
    "business analytics",
    "AI business analyst",
    "anomaly detection",
    "sales analysis",
    "small business intelligence",
  ],
  authors: [{ name: "InsightFlow AI" }],
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "InsightFlow AI",
    title: "InsightFlow AI — Understand your business. Act on the data.",
    description:
      "Upload your business data and see what changed, why it may have changed, " +
      "and what to investigate next.",
  },
  twitter: {
    card: "summary_large_image",
    title: "InsightFlow AI",
    description: "Understand your business. Act on the data.",
  },
  robots: { index: true, follow: true },
  // Icons and the social preview card are produced by app/icon.svg,
  // app/apple-icon.tsx, and app/opengraph-image.tsx, which Next.js wires up by
  // file convention. Declaring them again here would override those with paths
  // that do not exist.
  applicationName: "InsightFlow AI",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0B0F19" },
  ],
};

/**
 * Applies the stored theme before first paint.
 *
 * Without this the page renders in the default theme and then switches once
 * React hydrates, which is visible as a flash. It must be inline and
 * synchronous for that reason.
 */
const themeScript = `
(function () {
  try {
    var stored = localStorage.getItem('theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (stored === 'dark' || (stored !== 'light' && prefersDark)) {
      document.documentElement.classList.add('dark');
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${mono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh bg-background font-sans">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
