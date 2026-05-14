import { MetadataRoute } from "next";
import { APP_NAME } from "@/lib/brand";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.netflux.blog";

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: `${APP_NAME} — Readable Knowledge`,
        short_name: APP_NAME,
        description: "A summary-first knowledge system for books, podcasts, articles, and videos.",
        start_url: "/",
        display: "standalone",
        background_color: "#09090b",
        theme_color: "#09090b",
        orientation: "portrait-primary",
        scope: "/",
        prefer_related_applications: false,
        icons: [
            {
                src: "/icon.png",
                sizes: "32x32",
                type: "image/png",
                purpose: "any",
            },
            {
                src: "/apple-icon.png",
                sizes: "180x180",
                type: "image/png",
                purpose: "any",
            },
            {
                src: "/icons/icon-192x192.png",
                sizes: "192x192",
                type: "image/png",
                purpose: "any",
            },
            {
                src: "/icons/icon-512x512.png",
                sizes: "512x512",
                type: "image/png",
                purpose: "any",
            },
            {
                src: "/icons/icon-512x512.png",
                sizes: "512x512",
                type: "image/png",
                purpose: "maskable",
            },
        ],
        categories: ["education", "books", "productivity"],
        lang: "en",
        dir: "ltr",
        id: siteUrl,
    };
}
