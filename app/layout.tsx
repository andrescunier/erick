import type { Metadata } from "next";
import { Open_Sans } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { COOKIE_SESION } from "@/lib/session";
import { LogoutButton } from "@/components/LogoutButton";
import "./globals.css";

const openSans = Open_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "600", "700"],
  variable: "--font-open-sans",
});

export const metadata: Metadata = {
  title: "Erick — Dashboards",
  description: "Dashboards que se arman solos a partir de lo que llega por API.",
  icons: { icon: "/icono-openpass.webp" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const reqHeaders = headers();
  const conSesion = reqHeaders.get("x-erick-user");
  const isAdmin = reqHeaders.get("x-erick-admin") === "true";

  return (
    <html lang="es" className={openSans.variable}>
      <body>
        {conSesion && (
          <header className="app-header">
            <Link href="/" className="app-logo">
              <Image
                src="/logo-openpass.webp"
                alt="OpenPass"
                width={236}
                height={71}
                priority
              />
            </Link>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {isAdmin && (
                <Link href="/admin" className="salir" style={{ textDecoration: "none" }}>
                  Usuarios
                </Link>
              )}
              <LogoutButton />
            </div>
          </header>
        )}
        {children}
      </body>
    </html>
  );
}
