import { readFile } from "node:fs/promises";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { AutoDashboard } from "@/components/AutoDashboard";
import { puedeVer } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Preview() {
  // Vista local, detrás de la misma sesión del dashboard. Nunca existe en producción.
  if (process.env.NODE_ENV !== "development") notFound();
  const h = headers();
  if (!puedeVer({ u: h.get("x-erick-user") ?? "", a: JSON.parse(h.get("x-erick-allowed") ?? "[]"),
    admin: h.get("x-erick-admin") === "true", t: 0, s: "" }, "opentransit", "resumen")) notFound();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(await readFile(`${process.cwd()}/.preview/resumen.json`, "utf8"));
  } catch {
    return <main><h1>Vista previa local</h1><p>Generá el archivo con: py scripts/sincronizar_resumen.py --output .preview/resumen.json</p></main>;
  }
  return <main><p className="miga">Vista previa local · datos sin publicar</p><h1>Recaudación y operación</h1><AutoDashboard data={data} /></main>;
}
