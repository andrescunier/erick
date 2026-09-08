import Link from "next/link";
import { listDashboards } from "@/lib/github-store";

export const dynamic = "force-dynamic";

export default async function Pagina() {
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

  const porUsuario = new Map<string, string[]>();
  for (const { user, project } of dashboards) {
    porUsuario.set(user, [...(porUsuario.get(user) ?? []), project]);
  }

  return (
    <main>
      <h1>Dashboards</h1>
      <p className="generado">
        {dashboards.length === 0
          ? "Todavía no hay ningún dashboard cargado."
          : `${dashboards.length} dashboard(s) en ${porUsuario.size} proyecto(s)/usuario(s)`}
      </p>

      {porUsuario.size === 0 ? (
        <p className="vacio">
          Mandá un POST a <code>/api/dashboards/&#123;user&#125;/&#123;project&#125;</code> con tu
          API key para crear el primero.
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
