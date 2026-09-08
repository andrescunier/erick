/**
 * Sesión mínima para la pantalla de login: no hay tabla de usuarios ni
 * store de sesiones (seguimos con un solo viewer compartido, ver
 * AGENTS.md). El cookie no guarda ni usuario ni contraseña: guarda un hash
 * determinístico derivado de VIEWER_USER/VIEWER_PASSWORD, así el middleware
 * (que corre en el runtime Edge, sin Node "crypto"/Buffer) puede recalcular
 * el mismo valor y compararlo sin necesitar leer ninguna base de datos.
 */

export const COOKIE_SESION = "erick_session";

async function sha256Hex(texto: string): Promise<string> {
  const datos = new TextEncoder().encode(texto);
  const hash = await crypto.subtle.digest("SHA-256", datos);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function tokenSesionEsperado(): Promise<string | null> {
  const usuario = process.env.VIEWER_USER;
  const clave = process.env.VIEWER_PASSWORD;
  if (!usuario || !clave) return null;
  return sha256Hex(`${usuario}:${clave}:erick-session`);
}

export async function credencialesValidas(usuario: string, clave: string): Promise<boolean> {
  return usuario === process.env.VIEWER_USER && clave === process.env.VIEWER_PASSWORD;
}
