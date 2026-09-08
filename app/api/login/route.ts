import { COOKIE_SESION, credencialesValidas, tokenSesionEsperado } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const usuario = typeof body?.usuario === "string" ? body.usuario : "";
  const clave = typeof body?.clave === "string" ? body.clave : "";

  const token = await tokenSesionEsperado();
  if (!token) {
    return Response.json(
      { error: "VIEWER_USER / VIEWER_PASSWORD no están configurados en el servidor." },
      { status: 500 }
    );
  }

  if (!(await credencialesValidas(usuario, clave))) {
    return Response.json({ error: "Usuario o contraseña incorrectos." }, { status: 401 });
  }

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
