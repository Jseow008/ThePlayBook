import { MetadataRoute } from "next";
import { APP_NAME } from "@/lib/brand";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.netflux.blog";

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: `${APP_NAME} — Read Smarter`,
        short_name: APP_NAME,
        description: "Curated summaries of podcasts, books, and articles. Read distilled wisdom for free.",
        start_url: "/",
        display: "standalone",
        background_color: "#09090b",
        theme_color: "#09090b",
        orientation: "portrait-primary",
        scope: "/",
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
                src: "/apple-icon.png",
                sizes: "180x180",
                type: "image/png",
                purpose: "maskable",
            },
        ],
        categories: ["education", "books", "lifestyle"],
        lang: "en",
        dir: "ltr",
        id: siteUrl,
    };
}
