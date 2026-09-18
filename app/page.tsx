import Link from "next/link";
import { headers } from "next/headers";
import { listDashboards } from "@/lib/github-store";
import { puedeVer } from "@/lib/session";
import { ListaTableros } from "@/components/ListaTableros";

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

  return (
    <main>
      <h1>Tableros</h1>
      <p className="generado">
        {visibles.length === 0
          ? "Tu usuario todavía no tiene ningún tablero habilitado."
          : `${visibles.length} ${visibles.length === 1 ? "tablero disponible" : "tableros disponibles"} para ${username || "tu usuario"}.`}
      </p>

      {visibles.length === 0 ? (
        <p className="vacio">
          {dashboards.length > 0
            ? "Tu perfil no incluye ningún tablero. Pedile acceso al administrador."
            : <>
                Mandá un POST a <code>/api/dashboards/&#123;user&#125;/&#123;project&#125;</code> con tu
                API key para crear el primero.
              </>}
        </p>
      ) : (
        <ListaTableros tableros={visibles} />
      )}

      <Link href="/control" className="control-entry">
        <span>Centro de control</span>
        <strong>Compará los tableros entre sí, revisá tendencias y verificá cuándo se actualizó cada fuente →</strong>
      </Link>
    </main>
  );
}
