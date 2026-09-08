import { respuestaError } from "@/lib/api-helpers";
import { checkAdminOrApiKey } from "@/lib/admin-auth";
import { obtenerUsuario, actualizarUsuario, borrarUsuario } from "@/lib/user-store";
import { hashPassword } from "@/lib/session";

export const dynamic = "force-dynamic";

type Params = { params: { username: string } };

export async function GET(req: Request, { params }: Params) {
  const denegado = await checkAdminOrApiKey(req);
  if (denegado) return denegado;

  try {
    const usuario = await obtenerUsuario(params.username);
    if (!usuario) return Response.json({ error: "Usuario no encontrado." }, { status: 404 });
    return Response.json({ username: usuario.username, allowed: usuario.allowed, admin: usuario.admin });
  } catch (error) {
    return respuestaError(error);
  }
}

export async function PATCH(req: Request, { params }: Params) {
  const denegado = await checkAdminOrApiKey(req);
  if (denegado) return denegado;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Body inválido." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  const { password, allowed, admin } = body as Record<string, unknown>;

  if (password !== undefined) {
    if (typeof password !== "string" || password.length < 4) {
      return Response.json({ error: "password debe tener al menos 4 caracteres." }, { status: 400 });
    }
    patch.password_hash = await hashPassword(password);
  }
  if (allowed !== undefined) {
    if (!Array.isArray(allowed) || !allowed.every((p) => typeof p === "string")) {
      return Response.json({ error: "allowed debe ser un array de strings." }, { status: 400 });
    }
    patch.allowed = allowed;
  }
  if (admin !== undefined) {
    patch.admin = Boolean(admin);
  }

  try {
    const resultado = await actualizarUsuario(params.username, patch);
    if (!resultado) return Response.json({ error: "Usuario no encontrado." }, { status: 404 });
    return Response.json({ ok: true, username: resultado.username, allowed: resultado.allowed, admin: resultado.admin });
  } catch (error) {
    return respuestaError(error);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const denegado = await checkAdminOrApiKey(req);
  if (denegado) return denegado;

  try {
    const existia = await borrarUsuario(params.username);
    if (!existia) return Response.json({ error: "Usuario no encontrado." }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    return respuestaError(error);
  }
}
