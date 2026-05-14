import type { Metadata, Viewport } from "next";
import { Inter, Outfit, Playfair_Display } from "next/font/google";
import "./globals.css";
import { AmbientBackground } from "@/components/ui/AmbientBackground";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { QueryProvider } from "@/components/providers/query-provider";
import { AppToaster } from "@/components/providers/AppToaster";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

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

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.netflux.blog";
const description =
  "Netflux turns books, podcasts, articles, and videos into structured knowledge you can search, revisit, and remember.";
const showVercelTelemetry = process.env.NODE_ENV === "production";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: `${APP_NAME} | ${APP_TAGLINE}`,
  description,
  keywords: [
    "knowledge",
    "books",
    "podcasts",
    "articles",
    "videos",
    "non-fiction",
    "structured summaries",
    "remember what you learn",
    "learning",
    "highlights",
    "knowledge management",
    APP_NAME.toLowerCase(),
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
  other: {
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} ${outfit.variable} ${playfair.variable} font-sans antialiased isolate`}
      >
        <AmbientBackground />
        <QueryProvider>{children}</QueryProvider>
        <AppToaster />
        {showVercelTelemetry ? <Analytics /> : null}
        {showVercelTelemetry ? <SpeedInsights /> : null}
      </body>
    </html>
  );
}
