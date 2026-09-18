import { aplicarPreferencia, detectarForma, type FormaDetectada } from "@/lib/dashboard-shape";
import { StatCard } from "@/components/StatCard";
import { DashboardTable } from "@/components/DashboardTable";
import { AnalyticsDashboard } from "@/components/AnalyticsDashboard";
import { WidgetPicker } from "@/components/WidgetPicker";
import { etiquetaDeCampo } from "@/lib/etiquetas";
import { isAnalytics } from "@/lib/analytics";

type Props = {
  data: Record<string, unknown>;
  // Ambos opcionales: AnalyticsDashboard y otros llamadores que no manejan
  // preferencias siguen viendo todo, sin tener que pasar nada nuevo.
  dashboardKey?: string;
  habilitadas?: string[] | null;
};

/**
 * Renderizador genérico: arma el tablero a partir de la forma del JSON.
 *
 * Cuando el JSON trae `_analytics` hay DOS lecturas posibles del mismo dato: el
 * panel analítico (series, comparaciones, distribución) y la foto cruda del
 * archivo (una fila por registro, con los campos tal como llegan). Antes se
 * dibujaban las dos, una debajo de la otra, sin decir cuál era cuál: la pantalla
 * parecía dos tableros distintos pegados y no se entendía qué estaba mirando
 * uno. Ahora la foto cruda queda plegada abajo, rotulada como lo que es: la
 * ficha del informe, para auditar un número o exportarlo.
 */
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

  const selector = hayQuePersonalizar ? (
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
  ) : null;

  if (!analytics) {
    return (
      <div>
        {selector}
        <FichaFuente forma={forma} />
        {sinNada && <p className="vacio">Este dashboard todavía no recibió datos.</p>}
        <Cuerpo forma={forma} />
      </div>
    );
  }

  return (
    <div>
      <AnalyticsDashboard analytics={analytics} />
      <details className="bloque-secundario">
        <summary>
          Ficha del informe y filas originales
          {forma.registros ? ` (${forma.registros.length} registros)` : ""}
        </summary>
        <p className="analytics-coverage">
          Es el archivo publicado tal como llega, con los nombres de campo del sistema de origen.
          Sirve para auditar un número del panel o exportarlo; los indicadores de arriba salen de
          estos mismos datos.
        </p>
        {selector}
        <FichaFuente forma={forma} />
        <Cuerpo forma={forma} />
      </details>
    </div>
  );
}

/** De dónde salió el dato: sistema, archivo, corrida. No es una métrica. */
function FichaFuente({ forma }: { forma: FormaDetectada }) {
  const entradas: [string, string][] = [
    ...(forma.procedencia ?? []),
    ...forma.meta.map(([k, v]) => [k, String(v)] as [string, string]),
  ];
  if (entradas.length === 0) return null;
  return (
    <dl className="ficha-fuente">
      {entradas.map(([key, value]) => (
        <div key={key}>
          <dt>{etiquetaDeCampo(key)}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Cuerpo({ forma }: { forma: FormaDetectada }) {
  return (
    <>
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
    </>
  );
}
