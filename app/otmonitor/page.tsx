import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { COOKIE_SESION, verificarSesion, puedeVer } from "@/lib/session";
import { readOTMonitor } from "@/lib/otmonitor-store";
import { OTMonitorCenter } from "@/components/OTMonitorCenter";

export const dynamic = "force-dynamic";

export default async function OTMonitorPage() {
  const token = cookies().get(COOKIE_SESION)?.value;
  const session = token ? await verificarSesion(token) : null;
  if (!session) redirect("/login?next=/otmonitor");

  // Pantalla dedicada a un único dashboard puntual (leandro/otmonitor), no un
  // agregado como /control: se gatea con puedeVer + notFound, igual que
  // cualquier /{user}/{project} individual.
  if (!puedeVer(session, "leandro", "otmonitor")) notFound();

  const initial = await readOTMonitor(session);
  return (
    <main className="otmonitor-main">
      <OTMonitorCenter initial={initial} />
    </main>
  );
}
