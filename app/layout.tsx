import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Instrument_Serif, Inter, Outfit, Playfair_Display } from "next/font/google";
import "./globals.css";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { QueryProvider } from "@/components/providers/query-provider";
import { AppToaster } from "@/components/providers/AppToaster";
import { PostHogPageviewTracker } from "@/components/providers/PostHogPageviewTracker";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import {
  buildOrganizationJsonLd,
  buildWebsiteJsonLd,
  ROOT_OG_IMAGE,
  ROOT_OG_IMAGE_ALT,
  serializeJsonLdGraph,
  SITE_DESCRIPTION,
} from "@/lib/seo";

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
  variable: "--font-playfair",
  display: "swap",
});

const landingHeroSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-landing-hero-serif",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.netflux.blog";
const description = SITE_DESCRIPTION;
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
        url: ROOT_OG_IMAGE,
        width: 1200,
        height: 630,
        alt: ROOT_OG_IMAGE_ALT,
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${APP_NAME} | ${APP_TAGLINE}`,
    description,
    images: [ROOT_OG_IMAGE],
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
  const siteJsonLd = [buildOrganizationJsonLd(), buildWebsiteJsonLd()];

  return (
    <html
      lang="en"
      className={`dark ${inter.variable} ${outfit.variable} ${playfair.variable} ${landingHeroSerif.variable}`}
    >
      <body className="font-sans antialiased isolate">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLdGraph(siteJsonLd) }}
        />
        <QueryProvider>{children}</QueryProvider>
        <Suspense fallback={null}>
          <PostHogPageviewTracker />
        </Suspense>
        <AppToaster />
        {showVercelTelemetry ? <Analytics /> : null}
        {showVercelTelemetry ? <SpeedInsights /> : null}
      </body>
    </html>
  );
}
