import { detectarForma, encontrarPctEnVentana } from "@/lib/dashboard-shape";
import { formatearValor } from "@/lib/format";

function PctBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="muted">—</span>;
  const clase = pct >= 0 ? "pct-pos" : "pct-neg";
  return <span className={clase}>{formatearValor(pct, "percent")}</span>;
}

export function AutoDashboard({ data }: { data: Record<string, unknown> }) {
  const forma = detectarForma(data);
  const sinNada =
    forma.meta.length === 0 &&
    !forma.registros &&
    Object.keys(forma.resto).length === 0;

  return (
    <div>
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
            <div className="tarjeta" key={s.label}>
              <div className="rotulo">{s.label}</div>
              <div className="valor">{formatearValor(s.valor, s.formato)}</div>
            </div>
          ))}
        </div>
      )}

      {forma.registros && forma.registros.length > 0 && (
        <div className="tabla-envoltorio">
          <table>
            <thead>
              <tr>
                <th>Registro</th>
                {forma.columnas.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
                {forma.columnasVentana.map((v) => (
                  <th key={v.label}>{v.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {forma.registros.map((r, i) => (
                <tr key={String(r._key ?? r._label ?? i)}>
                  <td>{String(r._label)}</td>
                  {forma.columnas.map((c) => (
                    <td key={c.key}>{formatearValor(r[c.key], c.formato)}</td>
                  ))}
                  {forma.columnasVentana.map((v) => {
                    const mapa = r[v.campoOrigen] as Record<string, unknown> | undefined;
                    const ventana = mapa?.[v.ventanaKey] as Record<string, unknown> | undefined;
                    const pct = ventana ? encontrarPctEnVentana(ventana) : null;
                    return (
                      <td key={v.label}>
                        <PctBadge pct={pct} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
