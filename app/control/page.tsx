import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_SESION, verificarSesion } from "@/lib/session";
import { readControl } from "@/lib/control-store";
import { ControlCenter } from "@/components/ControlCenter";

export const dynamic = "force-dynamic";
export default async function ControlPage() {
  const token = cookies().get(COOKIE_SESION)?.value;
  const session = token ? await verificarSesion(token) : null;
  if (!session) redirect("/login?next=/control");
  try {
    return <main className="control-main"><ControlCenter initial={await readControl(session)} /></main>;
  } catch {
    return <main><h1>Centro de control</h1><p>No se pudieron leer las fuentes. Volvé a intentar en unos minutos.</p></main>;
  }
}
