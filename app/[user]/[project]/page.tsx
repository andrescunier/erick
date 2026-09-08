import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getDashboard } from "@/lib/github-store";
import { AutoDashboard } from "@/components/AutoDashboard";
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

  return (
    <main>
      {miga}
      <h1>
        {params.user} / {params.project}
      </h1>
      <AutoDashboard data={datos} />
    </main>
  );
}
