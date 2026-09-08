import { NextRequest, NextResponse } from "next/server";
import { COOKIE_SESION, tokenSesionEsperado } from "@/lib/session";

/**
 * Puerta de acceso a las páginas del dashboard: si no hay cookie de sesión
 * válida, redirige a /login (conservando a dónde quería ir). No protege
 * /api/dashboards/*, que tiene su propia autenticación por API key
 * (lib/auth.ts) para llamadas de máquina a máquina.
 */
export async function middleware(req: NextRequest) {
  const esperado = await tokenSesionEsperado();

  if (!esperado) {
    return new NextResponse("VIEWER_USER / VIEWER_PASSWORD no están configurados en el servidor.", {
      status: 500,
    });
  }

  if (req.cookies.get(COOKIE_SESION)?.value === esperado) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!api|login|_next/static|_next/image|favicon.ico).*)"],
};
