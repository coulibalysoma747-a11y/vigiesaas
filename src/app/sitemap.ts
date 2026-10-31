import type { MetadataRoute } from "next";

const BASE = (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "https://vigiesaas.onrender.com").replace(/\/$/, "");
const PAGES = ["/", "/brocante", "/comment-ca-marche", "/connexion", "/mentions", "/confidentialite", "/conditions"];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map((path) => ({ url: `${BASE}${path}`, changeFrequency: path === "/" || path === "/brocante" ? "daily" : "monthly", priority: path === "/" ? 1 : 0.6 }));
}
