import { isAnalytics, type Analytics } from "./analytics";
import { getDashboard, listDashboards } from "./github-store";
import { puedeVer, type Sesion } from "./session";

export type ControlProject = {
  id: string; title: string; href: string; generatedAt: string | null;
  checkedAt: string | null; cadenceSeconds: number | null;
  analytics: Analytics | null; error: string | null;
};
export type ControlData = { fetchedAt: string; projects: ControlProject[] };

export async function readControl(session: Sesion): Promise<ControlData> {
  const refs = (await listDashboards()).filter(d => puedeVer(session, d.user, d.project));
  const projects = await Promise.all(refs.map(async ref => {
    const base = { id: `${ref.user}/${ref.project}`, title: `${ref.user} / ${ref.project}`, href: `/${ref.user}/${ref.project}`,
      generatedAt: null, checkedAt: null, cadenceSeconds: null, analytics: null, error: null };
    try {
      const data = await getDashboard(ref.user, ref.project);
      if (!data) return { ...base, error: "Dashboard sin datos publicados" };
      const sync = data._sync && typeof data._sync === "object" ? data._sync as Record<string, unknown> : {};
      return { ...base, title: typeof data.title === "string" ? data.title : base.title,
        generatedAt: typeof data.generado_en === "string" ? data.generado_en : null,
        checkedAt: typeof sync.checked_at === "string" ? sync.checked_at : null,
        cadenceSeconds: typeof sync.cadence_seconds === "number" && sync.cadence_seconds > 0 ? sync.cadence_seconds : null,
        analytics: isAnalytics(data._analytics) ? data._analytics : null };
    } catch {
      return { ...base, error: "No se pudo leer esta fuente. Se puede reintentar sin afectar las demás." };
    }
  }));
  return { fetchedAt: new Date().toISOString(), projects };
}
