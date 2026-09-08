import { NextRequest, NextResponse } from "next/server";

/**
 * Basic Auth para ver el dashboard en el navegador. No protege /api/*, que
 * ya tiene su propia autenticación (INGEST_API_KEY, ver lib/auth.ts) pensada
 * para llamadas de máquina a máquina, no para un humano en un browser.
 */
export function middleware(req: NextRequest) {
  const usuario = process.env.VIEWER_USER;
  const clave = process.env.VIEWER_PASSWORD;

  if (!usuario || !clave) {
    return new NextResponse("VIEWER_USER / VIEWER_PASSWORD no están configurados en el servidor.", {
      status: 500,
    });
  }

  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Basic ")) {
    const decoded = atob(auth.slice(6));
    const separador = decoded.indexOf(":");
    const u = decoded.slice(0, separador);
    const p = decoded.slice(separador + 1);
    if (u === usuario && p === clave) {
      return NextResponse.next();
    }
  }

  return new NextResponse("Acceso restringido.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Erick"' },
  });
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
