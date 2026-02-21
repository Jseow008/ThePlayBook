import { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.netflux.blog";

export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: "*",
                allow: "/",
                disallow: ["/admin", "/admin-login", "/api/", "/auth/"],
            },
        ],
        sitemap: `${siteUrl}/sitemap.xml`,
    };
}
