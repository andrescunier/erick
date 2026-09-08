import { checkApiKey } from "@/lib/auth";
import { COOKIE_SESION, verificarSesion } from "@/lib/session";

/**
 * Autorización para /api/users: acepta INGEST_API_KEY (máquina a máquina)
 * o cookie de sesión de un usuario admin (desde la página de admin).
 */
export async function checkAdminOrApiKey(req: Request): Promise<Response | null> {
  const apiKeyDenegado = checkApiKey(req);
  if (!apiKeyDenegado) return null;

  const cookieHeader = req.headers.get("cookie") ?? "";
  const match = cookieHeader.split(";").find((c) => c.trim().startsWith(`${COOKIE_SESION}=`));
  if (!match) {
    return Response.json({ error: "API key inválida o sesión ausente." }, { status: 401 });
  }

  const token = match.trim().slice(COOKIE_SESION.length + 1);
  const sesion = await verificarSesion(token);
  if (!sesion || !sesion.admin) {
    return Response.json({ error: "Se requiere ser administrador." }, { status: 403 });
  }

  return null;
}
