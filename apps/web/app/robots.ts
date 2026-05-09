import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://honebooks.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/u/", "/books/"],
        disallow: [
          "/settings",
          "/account",
          "/onboarding",
          "/draft",
          "/search",
        ],
      },
      {
        userAgent: "*",
        allow: ["/u/*/followers", "/u/*/following"],
        crawlDelay: 10,
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
