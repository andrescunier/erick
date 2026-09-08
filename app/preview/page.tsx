import { readFile } from "node:fs/promises";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { AutoDashboard } from "@/components/AutoDashboard";
import { puedeVer } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Preview({ searchParams }: { searchParams: { source?: string } }) {
  // Vista local, detrás de la misma sesión del dashboard. Nunca existe en producción.
  if (process.env.NODE_ENV !== "development") notFound();
  const emission = searchParams.source === "emision";
  const user = emission ? "leandro" : "opentransit";
  const project = emission ? "emision" : "resumen";
  const h = headers();
  if (!puedeVer({ u: h.get("x-erick-user") ?? "", a: JSON.parse(h.get("x-erick-allowed") ?? "[]"),
    admin: h.get("x-erick-admin") === "true", t: 0, s: "" }, user, project)) notFound();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(await readFile(`${process.cwd()}/.preview/${project}.json`, "utf8"));
  } catch {
    return <main><h1>Vista previa local</h1><p>Generá el archivo con: py scripts/sincronizar_{project}.py --output .preview/{project}.json</p></main>;
  }
  return <main><p className="miga">Vista previa local · datos sin publicar</p><h1>{emission ? "Emisión · Leandro" : "Recaudación y operación"}</h1><AutoDashboard data={data} /></main>;
}
