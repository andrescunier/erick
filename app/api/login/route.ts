import { COOKIE_SESION, crearTokenSesion, verificarSesion } from "@/lib/session";
import { obtenerUsuario } from "@/lib/user-store";
import { hashPassword } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const usuario = typeof body?.usuario === "string" ? body.usuario : "";
  const clave = typeof body?.clave === "string" ? body.clave : "";

  if (!usuario || !clave) {
    return Response.json({ error: "Usuario y contraseña son obligatorios." }, { status: 400 });
  }

  const userRecord = await obtenerUsuario(usuario);
  if (!userRecord) {
    return Response.json({ error: "Usuario o contraseña incorrectos." }, { status: 401 });
  }

  const hashProvisto = await hashPassword(clave);
  if (hashProvisto !== userRecord.password_hash) {
    return Response.json({ error: "Usuario o contraseña incorrectos." }, { status: 401 });
  }

  const token = await crearTokenSesion(userRecord.username, userRecord.allowed, userRecord.admin);

  const seguro = process.env.NODE_ENV === "production" ? " Secure;" : "";
  return Response.json(
    { ok: true },
    {
      headers: {
        "Set-Cookie": `${COOKIE_SESION}=${token}; Path=/; HttpOnly;${seguro} SameSite=Lax; Max-Age=2592000`,
      },
    }
  );
}

export async function GET(req: Request) {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const match = cookieHeader.split(";").find((c) => c.trim().startsWith(`${COOKIE_SESION}=`));
  const token = match ? match.trim().slice(COOKIE_SESION.length + 1) : null;

  if (!token) {
    return Response.json({ authenticated: false });
  }

  const sesion = await verificarSesion(token);
  if (!sesion) {
    return Response.json({ authenticated: false });
  }

  return Response.json({
    authenticated: true,
    username: sesion.u,
    admin: sesion.admin,
    allowed: sesion.a,
  });
}
