import type { Metadata } from "next";
import { Open_Sans } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { COOKIE_SESION } from "@/lib/session";
import { LogoutButton } from "@/components/LogoutButton";
import "./globals.css";
import "./control.css";
import "./business.css";
import "./otmonitor.css";

const openSans = Open_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "600", "700"],
  variable: "--font-open-sans",
});

export const metadata: Metadata = {
  title: "Erick · Tableros OpenPass",
  description: "Recaudación, emisión y monitoreo de flota: los tableros que se arman con lo que publica cada sistema.",
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
            {/* "Tableros" explícito: antes al índice sólo se volvía haciendo
                click en el logo, que nadie tiene por qué adivinar que es un
                link. Y el nombre de quien está conectado, porque los permisos
                cambian qué tableros se ven y hay usuarios compartidos. */}
            <nav className="app-nav">
              <Link href="/" className="salir">Tableros</Link>
              <Link href="/control" className="salir">Centro de control</Link>
              {isAdmin && (
                <Link href="/admin" className="salir">
                  Usuarios
                </Link>
              )}
              <span className="app-usuario" title="Usuario conectado">{conSesion}</span>
              <LogoutButton />
            </nav>
          </header>
        )}
        {children}
      </body>
    </html>
  );
}
