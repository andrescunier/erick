import { respuestaError } from "@/lib/api-helpers";
import { checkAdminOrApiKey } from "@/lib/admin-auth";
import { listarUsuarios, crearUsuario } from "@/lib/user-store";
import { hashPassword } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denegado = await checkAdminOrApiKey(req);
  if (denegado) return denegado;

  try {
    const users = await listarUsuarios();
    const safe = users.map(({ username, allowed, admin }) => ({ username, allowed, admin }));
    return Response.json({ users: safe });
  } catch (error) {
    return respuestaError(error);
  }
}

export async function POST(req: Request) {
  const denegado = await checkAdminOrApiKey(req);
  if (denegado) return denegado;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Body inválido." }, { status: 400 });
  }

  const { username, password, allowed, admin } = body as Record<string, unknown>;
  if (typeof username !== "string" || !username.trim()) {
    return Response.json({ error: "username es obligatorio." }, { status: 400 });
  }
  if (typeof password !== "string" || password.length < 4) {
    return Response.json({ error: "password debe tener al menos 4 caracteres." }, { status: 400 });
  }
  if (!Array.isArray(allowed) || !allowed.every((p) => typeof p === "string")) {
    return Response.json({ error: "allowed debe ser un array de strings." }, { status: 400 });
  }

  try {
    const password_hash = await hashPassword(password);
    const usuario = await crearUsuario({
      username: username.trim(),
      password_hash,
      allowed,
      admin: Boolean(admin),
    });
    return Response.json(
      { ok: true, username: usuario.username, allowed: usuario.allowed, admin: usuario.admin },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("Ya existe")) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    return respuestaError(error);
  }
}
