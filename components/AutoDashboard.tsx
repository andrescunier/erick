import { aplicarPreferencia, detectarForma } from "@/lib/dashboard-shape";
import { StatCard } from "@/components/StatCard";
import { DashboardTable } from "@/components/DashboardTable";
import { AnalyticsDashboard } from "@/components/AnalyticsDashboard";
import { WidgetPicker } from "@/components/WidgetPicker";
import { isAnalytics } from "@/lib/analytics";

type Props = {
  data: Record<string, unknown>;
  // Ambos opcionales: AnalyticsDashboard y otros llamadores que no manejan
  // preferencias siguen viendo todo, sin tener que pasar nada nuevo.
  dashboardKey?: string;
  habilitadas?: string[] | null;
};

export function AutoDashboard({ data, dashboardKey, habilitadas = null }: Props) {
  const analytics = isAnalytics(data._analytics) ? data._analytics : null;
  const summary = Object.fromEntries(Object.entries(data).filter(([k]) => k !== "_sync" && (!analytics || k !== "_analytics")));
  const formaCompleta = detectarForma(summary);
  const forma = aplicarPreferencia(formaCompleta, habilitadas);
  const sinNada =
    forma.meta.length === 0 &&
    !forma.registros &&
    !forma.procedencia?.length &&
    Object.keys(forma.resto).length === 0;
  const hayQuePersonalizar = dashboardKey && (formaCompleta.columnas.length > 0 || formaCompleta.stats.length > 1);

  return (
    <div>
      {hayQuePersonalizar && (
        <WidgetPicker
          dashboardKey={dashboardKey!}
          habilitadas={habilitadas}
          disponibles={[
            ...formaCompleta.columnas.map((c) => ({ key: c.key, label: c.label })),
            ...formaCompleta.stats
              .filter((s) => s.key !== "_registros")
              .map((s) => ({ key: s.key, label: s.label })),
          ].filter((item, i, arr) => arr.findIndex((x) => x.key === item.key) === i)}
        />
      )}
      {analytics && <AnalyticsDashboard analytics={analytics} />}
      {analytics && forma.registros && <h2>Resumen de registros</h2>}
      {forma.procedencia && forma.procedencia.length > 0 && (
        <div className="meta-tira">
          {forma.procedencia.map(([key, value]) => (
            <span key={key}>
              <strong>{key}:</strong> {value}
            </span>
          ))}
        </div>
      )}

      {forma.meta.length > 0 && (
        <div className="meta-tira">
          {forma.meta.map(([key, value]) => (
            <span key={key}>
              <strong>{key}:</strong> {String(value)}
            </span>
          ))}
        </div>
      )}

      {sinNada && <p className="vacio">Este dashboard todavía no recibió datos.</p>}

      {forma.stats.length > 0 && (
        <div className="tarjetas">
          {forma.stats.map((s) => (
            <StatCard stat={s} key={s.key} />
          ))}
        </div>
      )}

      {forma.registros && forma.registros.length > 0 && (
        <DashboardTable
          registros={forma.registros}
          columnas={forma.columnas}
          columnasVentana={forma.columnasVentana}
          campoDestacado={forma.campoDestacado}
        />
      )}

      {Object.keys(forma.resto).length > 0 && (
        <details className="resto">
          <summary>Otros campos ({Object.keys(forma.resto).length})</summary>
          <pre>{JSON.stringify(forma.resto, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}
