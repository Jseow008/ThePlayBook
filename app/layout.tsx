import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";
import { AmbientBackground } from "@/components/ui/AmbientBackground";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { QueryProvider } from "@/components/providers/query-provider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

const siteUrl = "https://www.netflux.blog";
const description =
  "Curated summaries of podcasts, books, and articles. Read distilled wisdom for free.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: `${APP_NAME} | ${APP_TAGLINE}`,
  description,
  keywords: [
    "knowledge",
    "summaries",
    "podcasts",
    "books",
    "learning",
    "netflux",
  ],
  openGraph: {
    title: `${APP_NAME} | ${APP_TAGLINE}`,
    description,
    url: siteUrl,
    siteName: APP_NAME,
    images: [
      {
        url: "/images/og-image.png",
        width: 1200,
        height: 630,
        alt: `${APP_NAME} — ${APP_TAGLINE}`,
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${APP_NAME} | ${APP_TAGLINE}`,
    description,
    images: ["/images/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} ${outfit.variable} font-sans antialiased isolate`}
      >
        <AmbientBackground />
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
