import { NextRequest } from "next/server";
import { COOKIE_SESION, verificarSesion } from "@/lib/session";
import { readOTMonitor } from "@/lib/otmonitor-store";

// Mismo patrón que /api/control: autenticado por cookie de sesión (no por
// API key), porque lo consume el navegador de una persona logueada, no una
// máquina. El polling de OTMonitorCenter pega acá cada 60s.
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const token = request.cookies.get(COOKIE_SESION)?.value;
  const session = token ? await verificarSesion(token) : null;
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
  if (!session) return Response.json({ error: "La sesión venció. Volvé a ingresar." }, { status: 401, headers });
  try {
    return Response.json(await readOTMonitor(session), { headers });
  } catch {
    return Response.json({ error: "No se pudo consultar la fuente. Se conserva la última lectura en pantalla." }, { status: 503, headers });
  }
}
