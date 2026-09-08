import { NextRequest, NextResponse } from "next/server";
import { COOKIE_SESION, verificarSesion, puedeVer } from "@/lib/session";

/**
 * Puerta de acceso a las páginas del dashboard: si no hay cookie de sesión
 * válida, redirige a /login. Verifica permisos según el perfil del usuario.
 * No protege /api/* (usan INGEST_API_KEY) ni /login.
 */
export async function middleware(req: NextRequest) {
  const token = req.cookies.get(COOKIE_SESION)?.value;
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
    return NextResponse.redirect(url);
  }

  const sesion = await verificarSesion(token);
  if (!sesion) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
    const res = NextResponse.redirect(url);
    res.cookies.set(COOKIE_SESION, "", { path: "/", maxAge: 0 });
    return res;
  }

  // /admin solo para admins
  if (req.nextUrl.pathname === "/admin" && !sesion.admin) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // /{user}/{project} — verificar permiso
  const match = req.nextUrl.pathname.match(/^\/([^/]+)\/([^/]+)$/);
  if (match) {
    const [, dashUser, dashProject] = match;
    if (!puedeVer(sesion, dashUser, dashProject)) {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  // Inyectar info de sesión en headers para que los server components la lean
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-erick-user", sesion.u);
  requestHeaders.set("x-erick-admin", String(sesion.admin));
  requestHeaders.set("x-erick-allowed", JSON.stringify(sesion.a));
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  // Excluir sólo los assets públicos conocidos, nunca extensiones arbitrarias
  // que también pueden formar parte del nombre de un dashboard.
  matcher: [
    "/((?!api(?:/|$)|login$|_next/static(?:/|$)|_next/image$|favicon\\.ico$|(?:logo|icono)-openpass\\.webp$).*)",
  ],
};
