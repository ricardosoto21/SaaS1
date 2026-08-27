import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3001";
  return ["", "/terminos", "/privacidad"].map((path) => ({ url: `${base}${path}`, lastModified: new Date() }));
}
