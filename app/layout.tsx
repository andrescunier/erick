import type { Metadata } from "next";
import { Open_Sans } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { COOKIE_SESION } from "@/lib/session";
import { LogoutButton } from "@/components/LogoutButton";
import "./globals.css";

// Los 4 pesos que carga openpass.la. El 300 es el de las cifras grandes de KPI.
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
  const conSesion = cookies().has(COOKIE_SESION);

  return (
    <html lang="es" className={openSans.variable}>
      <body>
        {conSesion && (
          <header className="app-header">
            {/* El logo con el texto en blanco es la variante para fondo oscuro,
                que es justo lo que es el header. */}
            <Link href="/" className="app-logo">
              <Image
                src="/logo-openpass.webp"
                alt="OpenPass"
                width={236}
                height={71}
                priority
              />
            </Link>
            <LogoutButton />
          </header>
        )}
        {children}
      </body>
    </html>
  );
}
