import Link from "next/link";
import { notFound } from "next/navigation";
import { getDashboard } from "@/lib/github-store";
import { AutoDashboard } from "@/components/AutoDashboard";

export const dynamic = "force-dynamic";

type Props = { params: { user: string; project: string } };

export default async function PaginaDashboard({ params }: Props) {
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
