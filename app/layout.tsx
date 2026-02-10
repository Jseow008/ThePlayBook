import type { Metadata } from "next";
import { Inter, Merriweather } from "next/font/google";
import "./globals.css";
import { AmbientBackground } from "@/components/ui/AmbientBackground";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const merriweather = Merriweather({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-merriweather",
  display: "swap",
});

export const metadata: Metadata = {
  title: "NETFLUX | Curated Knowledge Stream",
  description:
    "Curated summaries of podcasts, books, and articles. Read distilled wisdom for free.",
  keywords: ["knowledge", "summaries", "podcasts", "books", "learning", "netflux"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} ${merriweather.variable} font-sans antialiased isolate`}
      >
        <AmbientBackground />
        {children}
      </body>
    </html>
  );
}
