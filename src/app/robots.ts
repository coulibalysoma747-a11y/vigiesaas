import type { MetadataRoute } from "next";

const BASE = (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "https://vigiesaas.onrender.com").replace(/\/$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/tableau-de-bord", "/incidents", "/parametres"] },
    sitemap: `${BASE}/sitemap.xml`,
  };
}
