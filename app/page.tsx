import Link from "next/link";
import { headers } from "next/headers";
import { listDashboards } from "@/lib/github-store";
import { puedeVer } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Pagina() {
  const reqHeaders = headers();
  const username = reqHeaders.get("x-erick-user") ?? "";
  const isAdmin = reqHeaders.get("x-erick-admin") === "true";
  const allowed: string[] = JSON.parse(reqHeaders.get("x-erick-allowed") ?? "[]");

  let dashboards: Awaited<ReturnType<typeof listDashboards>>;
  try {
    dashboards = await listDashboards();
  } catch (error) {
    return (
      <main>
        <h1>Dashboards</h1>
        <p className="vacio">
          No se pudo conectar con el storage: {error instanceof Error ? error.message : String(error)}
          <br />
          Revisá que <code>GITHUB_TOKEN</code> y <code>GITHUB_REPO</code> estén configurados.
        </p>
      </main>
    );
  }

  const visibles = dashboards.filter((d) => puedeVer({ u: username, a: allowed, admin: isAdmin, t: 0, s: "" }, d.user, d.project));

  const porUsuario = new Map<string, string[]>();
  for (const { user, project } of visibles) {
    porUsuario.set(user, [...(porUsuario.get(user) ?? []), project]);
  }

  return (
    <main>
      <h1>Dashboards</h1>
      <p className="generado">
        {visibles.length === 0
          ? "No tenés permiso para ver ningún dashboard."
          : `${visibles.length} dashboard(s) en ${porUsuario.size} proyecto(s)/usuario(s)`}
      </p>

      {porUsuario.size === 0 ? (
        <p className="vacio">
          {dashboards.length > 0
            ? "Tu perfil no incluye ningún dashboard. Contactá al administrador."
            : <>
                Mandá un POST a <code>/api/dashboards/&#123;user&#125;/&#123;project&#125;</code> con tu
                API key para crear el primero.
              </>}
        </p>
      ) : (
        <div className="grupos">
          {[...porUsuario.entries()].map(([user, proyectos]) => (
            <div className="grupo" key={user}>
              <h2>{user}</h2>
              <div className="tarjetas">
                {proyectos.map((project) => (
                  <Link className="tarjeta tarjeta-link" href={`/${user}/${project}`} key={project}>
                    <div className="rotulo">Proyecto</div>
                    <div className="valor">{project}</div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
