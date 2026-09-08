import { checkApiKey } from "@/lib/auth";
import { respuestaError } from "@/lib/api-helpers";
import { listDashboards } from "@/lib/github-store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denegado = checkApiKey(req);
  if (denegado) return denegado;

  try {
    const dashboards = await listDashboards();
    return Response.json({ dashboards });
  } catch (error) {
    return respuestaError(error);
  }
}
