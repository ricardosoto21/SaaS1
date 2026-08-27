import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  return { rules: { userAgent: "*", allow: "/", disallow: ["/dashboard", "/agenda", "/clientes", "/ventas", "/inventario", "/compras", "/gastos", "/configuracion", "/super-admin", "/api/"] }, sitemap: base ? `${base}/sitemap.xml` : undefined };
}
