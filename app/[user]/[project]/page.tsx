import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getDashboard } from "@/lib/github-store";
import { leerPreferencias } from "@/lib/preferences-store";
import { AutoDashboard } from "@/components/AutoDashboard";
import { OTMonitorCenter } from "@/components/OTMonitorCenter";
import { aResultadoOTMonitor } from "@/lib/otmonitor-store";
import { puedeVer } from "@/lib/session";

export const dynamic = "force-dynamic";

type Props = { params: { user: string; project: string } };

export default async function PaginaDashboard({ params }: Props) {
  const reqHeaders = headers();
  const username = reqHeaders.get("x-erick-user") ?? "";
  const isAdmin = reqHeaders.get("x-erick-admin") === "true";
  const allowed: string[] = JSON.parse(reqHeaders.get("x-erick-allowed") ?? "[]");

  if (!puedeVer({ u: username, a: allowed, admin: isAdmin, t: 0, s: "" }, params.user, params.project)) {
    notFound();
  }

  const miga = (
    <p className="miga">
      <Link href="/">Dashboards</Link> / {params.user} / {params.project}
    </p>
  );

  let datos: Awaited<ReturnType<typeof getDashboard>>;
  try {
    datos = await getDashboard(params.user, params.project);
  } catch (error) {
    return (
      <main>
        {miga}
        <h1>
          {params.user} / {params.project}
        </h1>
        <p className="vacio">
          No se pudo conectar con el storage: {error instanceof Error ? error.message : String(error)}
        </p>
      </main>
    );
  }
  if (!datos) notFound();

  const dashboardKey = `${params.user}/${params.project}`;

  // Dashboards con pantalla propia: el renderizador generico (AutoDashboard)
  // detecta forma automaticamente y sirve para casi todo, pero hay datos que
  // no son "una tabla con metricas" -el estado de una flota de 1300
  // validadores, con mapa y semaforos, es uno-. Antes esa pantalla vivia en
  // /otmonitor y la navegacion normal (Dashboards -> leandro/otmonitor) caia
  // igual en el generico: se veia una tabla cruda de 1326 filas con columnas
  // como "badge color: success". Se resuelve aca, en la ruta canonica a la
  // que ya apuntan todos los links, en vez de pedirle a la gente que se
  // acuerde de una URL aparte.
  if (dashboardKey === "leandro/otmonitor") {
    return (
      <main className="otmonitor-main">
        {miga}
        <OTMonitorCenter initial={aResultadoOTMonitor(datos)} />
      </main>
    );
  }
  // Si no se puede leer la preferencia (p.ej. GITHUB_TOKEN mal configurado en
  // un entorno de prueba) se muestra todo, igual que sin preferencia guardada
  // — el error de storage ya se ve arriba si getDashboard también fallo.
  const habilitadas = await leerPreferencias(username)
    .then((p) => p[dashboardKey]?.columnas ?? null)
    .catch(() => null);

  return (
    <main>
      {miga}
      <h1>
        {typeof datos.title === "string" ? datos.title : `${params.user} / ${params.project}`}
      </h1>
      <AutoDashboard data={datos} dashboardKey={dashboardKey} habilitadas={habilitadas} />
    </main>
  );
}
