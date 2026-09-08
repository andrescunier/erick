import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Erick — Dashboards",
  description: "Dashboards que se arman solos a partir de lo que llega por API.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
