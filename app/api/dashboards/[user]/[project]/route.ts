import { checkApiKey } from "@/lib/auth";
import { respuestaError } from "@/lib/api-helpers";
import {
  deleteDashboard,
  getDashboard,
  mergeDashboard,
  replaceDashboard,
} from "@/lib/github-store";

export const dynamic = "force-dynamic";

type Params = { params: { user: string; project: string } };

export async function GET(req: Request, { params }: Params) {
  const denegado = checkApiKey(req);
  if (denegado) return denegado;

  try {
    const datos = await getDashboard(params.user, params.project);
    if (!datos) return Response.json({ error: "No existe ese dashboard." }, { status: 404 });
    return Response.json(datos);
  } catch (error) {
    return respuestaError(error);
  }
}

export async function POST(req: Request, { params }: Params) {
  const denegado = checkApiKey(req);
  if (denegado) return denegado;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json(
      { error: "El body debe ser un objeto JSON." },
      { status: 400 }
    );
  }

  try {
    await replaceDashboard(params.user, params.project, body);
    return Response.json({ ok: true, user: params.user, project: params.project });
  } catch (error) {
    return respuestaError(error);
  }
}

export async function PATCH(req: Request, { params }: Params) {
  const denegado = checkApiKey(req);
  if (denegado) return denegado;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json(
      { error: "El body debe ser un objeto JSON." },
      { status: 400 }
    );
  }

  try {
    const resultado = await mergeDashboard(params.user, params.project, body);
    return Response.json(resultado);
  } catch (error) {
    return respuestaError(error);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const denegado = checkApiKey(req);
  if (denegado) return denegado;

  try {
    const existia = await deleteDashboard(params.user, params.project);
    if (!existia) return Response.json({ error: "No existe ese dashboard." }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    return respuestaError(error);
  }
}
