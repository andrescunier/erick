import { respuestaError } from "@/lib/api-helpers";
import { puedeVer, sesionDesdeRequest } from "@/lib/session";
import {
  borrarPreferenciaDashboard,
  guardarPreferenciaDashboard,
  leerPreferencias,
} from "@/lib/preferences-store";

/**
 * Preferencias de widgets de la persona que hace el request (nunca de un
 * script: usa la cookie de sesión, no INGEST_API_KEY). Cada quien lee y
 * escribe únicamente sus propias preferencias, para el dashboard que ya
 * puede ver — no hace falta ser admin.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const sesion = await sesionDesdeRequest(req);
  if (!sesion) return Response.json({ error: "Sesión inválida o ausente." }, { status: 401 });

  try {
    const preferencias = await leerPreferencias(sesion.u);
    return Response.json(preferencias);
  } catch (error) {
    return respuestaError(error);
  }
}

export async function PUT(req: Request) {
  const sesion = await sesionDesdeRequest(req);
  if (!sesion) return Response.json({ error: "Sesión inválida o ausente." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const dashboard = typeof body?.dashboard === "string" ? body.dashboard : "";
  const columnas = Array.isArray(body?.columnas) ? body.columnas : null;
  const [dashUser, dashProject] = dashboard.split("/");

  if (!dashUser || !dashProject || !columnas || !columnas.every((c: unknown) => typeof c === "string")) {
    return Response.json(
      { error: "Body esperado: { dashboard: 'user/project', columnas: string[] }." },
      { status: 400 }
    );
  }
  if (!puedeVer(sesion, dashUser, dashProject)) {
    return Response.json({ error: "No tenés acceso a ese dashboard." }, { status: 403 });
  }

  try {
    const preferencias = await guardarPreferenciaDashboard(sesion.u, dashboard, columnas);
    return Response.json(preferencias);
  } catch (error) {
    return respuestaError(error);
  }
}

export async function DELETE(req: Request) {
  const sesion = await sesionDesdeRequest(req);
  if (!sesion) return Response.json({ error: "Sesión inválida o ausente." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const dashboard = searchParams.get("dashboard") ?? "";
  if (!dashboard.includes("/")) {
    return Response.json({ error: "Falta ?dashboard=user/project." }, { status: 400 });
  }

  try {
    const preferencias = await borrarPreferenciaDashboard(sesion.u, dashboard);
    return Response.json(preferencias);
  } catch (error) {
    return respuestaError(error);
  }
}
