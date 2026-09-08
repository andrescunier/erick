/**
 * Sesiones multi-usuario con token firmado. El cookie guarda un JSON
 * codificado en base64url con username, permisos y una firma HMAC-SHA256.
 * El middleware valida la firma sin necesidad de leer el store de usuarios
 * (no hay call a GitHub en cada request).
 *
 * SESSION_SECRET se deriva de INGEST_API_KEY si no está seteada explícitamente.
 */

export const COOKIE_SESION = "erick_session";

export type Sesion = {
  u: string; // username
  a: string[]; // allowed patterns (e.g. ["*"], ["opentransit/*"])
  admin: boolean;
  t: number; // issued at (unix seconds)
  s: string; // signature
};

async function sha256Hex(data: string): Promise<string> {
  const buf = new TextEncoder().encode(data);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256Hex(key: string, data: string): Promise<string> {
  const keyBuf = new TextEncoder().encode(key);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBuf,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const dataBuf = new TextEncoder().encode(data);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, dataBuf);
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function sessionSecret(): string {
  return process.env.SESSION_SECRET || process.env.INGEST_API_KEY || "";
}

function toBase64Url(obj: object): string {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url<T>(str: string): T | null {
  try {
    let b64 = str.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return null;
  }
}

async function firmarSesion(sesion: Omit<Sesion, "s">): Promise<string> {
  const payload = `${sesion.u}:${JSON.stringify(sesion.a)}:${sesion.admin}:${sesion.t}`;
  return hmacSha256Hex(sessionSecret(), payload);
}

export async function crearTokenSesion(
  username: string,
  allowed: string[],
  isAdmin: boolean
): Promise<string> {
  const parcial: Omit<Sesion, "s"> = {
    u: username,
    a: allowed,
    admin: isAdmin,
    t: Math.floor(Date.now() / 1000),
  };
  const firma = await firmarSesion(parcial);
  return toBase64Url({ ...parcial, s: firma });
}

export async function verificarSesion(token: string): Promise<Sesion | null> {
  const sesion = fromBase64Url<Sesion>(token);
  if (!sesion) return null;

  const edad = Math.floor(Date.now() / 1000) - sesion.t;
  if (edad < 0 || edad > 30 * 24 * 3600) return null;

  const firmaEsperada = await firmarSesion({
    u: sesion.u,
    a: sesion.a,
    admin: sesion.admin,
    t: sesion.t,
  });
  if (firmaEsperada !== sesion.s) return null;

  return sesion;
}

export function puedeVer(sesion: Sesion, user: string, project: string): boolean {
  if (sesion.admin) return true;
  const target = `${user}/${project}`;
  for (const pattern of sesion.a) {
    if (pattern === "*") return true;
    if (pattern === target) return true;
    const [pUser, pProject] = pattern.split("/");
    if (pUser === user && pProject === "*") return true;
  }
  return false;
}

export async function hashPassword(password: string): Promise<string> {
  return sha256Hex(`${password}:erick-pw`);
}
