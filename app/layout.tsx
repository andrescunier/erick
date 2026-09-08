import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Erick — Panel de Tránsito",
  description: "Datos diarios de opentransit, por tenant.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
