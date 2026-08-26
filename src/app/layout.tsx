import type { Metadata } from "next";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Gestion Peluqueria",
  description: "Control de gestion para peluqueria.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
