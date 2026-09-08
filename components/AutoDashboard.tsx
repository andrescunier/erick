import { detectarForma } from "@/lib/dashboard-shape";
import { StatCard } from "@/components/StatCard";
import { DashboardTable } from "@/components/DashboardTable";

export function AutoDashboard({ data }: { data: Record<string, unknown> }) {
  const forma = detectarForma(data);
  const sinNada =
    forma.meta.length === 0 &&
    !forma.registros &&
    Object.keys(forma.resto).length === 0;

  return (
    <div>
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
            <StatCard stat={s} key={s.label} />
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
