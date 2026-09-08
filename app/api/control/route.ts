import { NextRequest } from "next/server";
import { COOKIE_SESION, verificarSesion } from "@/lib/session";
import { readControl } from "@/lib/control-store";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const token = request.cookies.get(COOKIE_SESION)?.value;
  const session = token ? await verificarSesion(token) : null;
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
  if (!session) return Response.json({ error: "La sesión venció. Volvé a ingresar." }, { status: 401, headers });
  try {
    return Response.json(await readControl(session), { headers });
  } catch {
    return Response.json({ error: "No se pudieron consultar las fuentes. Se conserva la última lectura en pantalla." }, { status: 503, headers });
  }
}
