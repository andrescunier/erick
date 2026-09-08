"use client";

import { useMemo, useState } from "react";
import { expandRows, filterRows, groupRows, metricValue, timeValue, type Analytics, type Dataset, type Metric } from "@/lib/analytics";
import { formatearValor } from "@/lib/format";

const label = (s: string) => s.replace(/_/g, " ").replace(/^./, c => c.toUpperCase());

export function AnalyticsDashboard({ analytics }: { analytics: Analytics }) {
  const [selected, setSelected] = useState(analytics.datasets[0]?.id ?? "");
  const dataset = analytics.datasets.find(d => d.id === selected) ?? analytics.datasets[0];
  return <section className="analytics" aria-label="Explorador de indicadores">
    <div className="analytics-heading"><div><p className="analytics-eyebrow">RECAUDACIÓN Y OPERACIÓN</p>
      <h2>Explorar los datos</h2><p>Filtrá una fuente y compará su evolución y distribución.</p></div>
      <label>Indicador / fuente<select value={dataset?.id ?? ""} onChange={e => setSelected(e.target.value)}>
        {analytics.datasets.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
      </select></label></div>
    {analytics.warnings.length > 0 && <details className="analytics-warning"><summary>Fuentes incompletas ({analytics.warnings.length})</summary>
      {analytics.warnings.map((w, i) => <p key={i}>{w}</p>)}</details>}
    {dataset ? <DatasetView key={dataset.id} dataset={dataset} /> : <p className="vacio">No hay fuentes analíticas disponibles.</p>}
  </section>;
}

function DatasetView({ dataset: d }: { dataset: Dataset }) {
  const rows = useMemo(() => expandRows(d), [d]);
  const dates = useMemo(() => [...new Set(rows.map(r => String(r.fecha).slice(0, 10)))].sort(), [rows]);
  const [from, setFrom] = useState(dates[0] ?? "");
  const [to, setTo] = useState(dates[dates.length - 1] ?? "");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [metricIndex, setMetricIndex] = useState(0);
  const [dimension, setDimension] = useState(d.dimensions.find(k => k !== "tenant" && k !== "tipo_estado") ?? d.dimensions[0] ?? "fecha");
  const [page, setPage] = useState(0);
  const m = d.metrics[metricIndex];
  const filtered = useMemo(() => filterRows(rows, from, to, filters), [rows, from, to, filters]);
  const series = useMemo(() => groupRows(filtered, "fecha", m).sort((a, b) => a.label.localeCompare(b.label)), [filtered, m]);
  const ranking = useMemo(() => groupRows(filtered, dimension, m).sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity)), [filtered, dimension, m]);
  const last = dates[dates.length - 1];
  const pageCount = Math.ceil(filtered.length / 50);
  const currentPage = Math.min(page, Math.max(0, pageCount - 1));

  function reset() { setFrom(dates[0] ?? ""); setTo(last ?? ""); setFilters({}); setPage(0); }
  function recent(days: number) {
    if (!last) return;
    const date = new Date(`${last}T12:00:00Z`); date.setUTCDate(date.getUTCDate() - days + 1);
    setFrom(date.toISOString().slice(0, 10)); setTo(last); setPage(0);
  }
  function download() {
    const cell = (v: unknown) => '"' + String(v ?? "").replace(/^[=+@-]/, "'$&").replace(/"/g, '""') + '"';
    const csv = [d.columns, ...filtered.map(r => d.columns.map(c => r[c]))].map(r => r.map(cell).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `${d.id}-filtrado.csv`; a.click(); URL.revokeObjectURL(url);
  }

  return <div>
    <p className="analytics-description">{d.description}</p>
    <div className="analytics-filters">
      <label>Desde<input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(0); }} /></label>
      <label>Hasta<input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(0); }} /></label>
      {d.dimensions.filter(k => k !== "tipo_estado").map(k => <label key={k}>{label(k)}
        <select value={filters[k] ?? ""} onChange={e => { setFilters({ ...filters, [k]: e.target.value }); setPage(0); }}>
          <option value="">Todos</option>{[...new Set(rows.map(r => String(r[k])))].sort().map(v => <option key={v}>{v}</option>)}
        </select></label>)}
      <button onClick={reset}>Restablecer</button>
    </div>
    <div className="analytics-actions"><span>Hasta el último dato:</span>{[7, 14, 30].map(n => <button key={n} onClick={() => recent(n)}>{n} días</button>)}
      <span>{filtered.length.toLocaleString("es-AR")} filas · {new Set(filtered.map(r => String(r.fecha).slice(0, 10))).size} días con datos</span>
    </div>
    {from && to && from > to && <p role="alert">La fecha inicial debe ser anterior o igual a la final.</p>}
    <p className="analytics-coverage">Rango disponible: {dates[0] ?? "—"} → {last ?? "—"}. Fuente actualizada: {d.updatedAt.replace("T", " ")}. Los días ausentes no se consideran cero.</p>
    <div className="tarjetas">{d.metrics.map((metric, i) => <button className={`tarjeta analytics-metric ${i === metricIndex ? "selected" : ""}`} key={i} onClick={() => setMetricIndex(i)} aria-pressed={i === metricIndex}>
      <span className="rotulo">{metric.label}</span><span className="valor">{formatearValor(metricValue(filtered, metric), metric.format)}</span>
      <span className="muted">{metric.denominator ? "Razón calculada sobre el período" : "Total del filtro"}
        {filtered.some(r => typeof r[metric.key] !== "number" || (metric.denominator && typeof r[metric.denominator] !== "number")) ? " · datos parciales" : ""}</span>
    </button>)}</div>
    {!filtered.length ? <p className="vacio">Sin datos para estos filtros. Probá ampliar el período o restablecerlos.</p> : <>
      <div className="analytics-charts">
        <section className="analytics-panel"><h3>{m.label} · evolución</h3><p>Una barra por fecha u hora observada. Seleccioná una métrica arriba.</p>
          <TimeChart points={series} metric={m} />
        </section>
        <section className="analytics-panel"><div className="analytics-heading"><h3>Distribución</h3><label>Agrupar por<select value={dimension} onChange={e => setDimension(e.target.value)}>
          {d.dimensions.filter(k => k !== "tipo_estado").map(k => <option value={k} key={k}>{label(k)}</option>)}
        </select></label></div><p>Top 12 por {m.label.toLowerCase()}. Tocá una barra para filtrar.</p>
          <div className="analytics-ranking">{ranking.slice(0, 12).map(p => <button key={p.label} onClick={() => { setFilters({ ...filters, [dimension]: p.label }); setPage(0); }}>
            <span>{p.label}</span><strong>{formatearValor(p.value, m.format)}</strong>
            <span className="analytics-bar" style={{ width: `${Math.max(0, (p.value ?? 0) / Math.max(1, ...ranking.map(r => Math.abs(r.value ?? 0))) * 100)}%` }} />
          </button>)}</div>
        </section>
      </div>
      <details className="analytics-panel"><summary>Ver datos filtrados y exportar CSV ({filtered.length} filas)</summary>
        <div className="analytics-actions"><button onClick={download}>Descargar CSV filtrado</button><span>Los campos *_cents se exportan en centavos.</span></div>
        <div className="tabla-envoltorio"><table><thead><tr>{d.columns.map(c => <th key={c}>{label(c)}</th>)}</tr></thead>
          <tbody>{filtered.slice(currentPage * 50, currentPage * 50 + 50).map((r, i) => <tr key={i}>{d.columns.map(c => <td key={c}>{formatearValor(r[c], c.endsWith("_cents") ? "money_cents" : "count")}</td>)}</tr>)}</tbody>
        </table></div><div className="analytics-actions"><button disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>Anterior</button>
          <span>Página {currentPage + 1} de {pageCount}</span><button disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Siguiente</button></div>
      </details>
    </>}
    <details className="analytics-source"><summary>Procedencia y alcance</summary><p>{d.description}</p><p className="analytics-path">{d.source}</p>
      <p>La pantalla usa una copia publicada de los archivos. No consulta las bases en vivo ni dispara alertas.</p></details>
  </div>;
}

function TimeChart({ points, metric }: { points: { label: string; value: number | null; count: number }[]; metric: Metric }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const times = points.map(p => timeValue(p.label));
  const minTime = Math.min(...times);
  const step = points.some(p => p.label.includes("T")) ? 3600000 : 86400000;
  const range = Math.max(step, Math.max(...times) - minTime + step);
  const min = Math.min(0, ...points.map(p => p.value ?? 0));
  const max = Math.max(1, ...points.map(p => p.value ?? 0));
  const y = (n: number) => 190 - (n - min) / (max - min) * 160;
  const selected = hovered === null ? null : points[hovered];
  return <div>
    <svg viewBox="0 0 640 235" className="analytics-plot" role="img" aria-label={`Evolución de ${metric.label}; detalle disponible en la tabla inferior`}>
      {[min, (max + min) / 2, max].map((n, i) => <g key={i}><line x1="90" x2="630" y1={y(n)} y2={y(n)} stroke="#ddd" /><text x="84" y={y(n) + 4} textAnchor="end">{formatearValor(n, metric.format)}</text></g>)}
      {points.map((p, i) => p.value === null ? null : <rect key={p.label} x={90 + (times[i] - minTime) / range * 540} y={Math.min(y(p.value), y(0))}
        width={Math.max(1, Math.min(32, step / range * 540 - 2))} height={Math.max(1, Math.abs(y(p.value) - y(0)))} fill={hovered === i ? "#a75100" : "#ec7803"}
        tabIndex={0} aria-label={`${p.label}: ${formatearValor(p.value, metric.format)}`} onMouseEnter={() => setHovered(i)} onFocus={() => setHovered(i)}>
        <title>{`${p.label}: ${formatearValor(p.value, metric.format)}`}</title></rect>)}
      <text x="90" y="222">{points[0]?.label.replace("T", " ")}</text><text x="630" y="222" textAnchor="end">{points[points.length - 1]?.label.replace("T", " ")}</text>
    </svg><p className="analytics-tooltip" aria-live="polite">{selected ? `${selected.label.replace("T", " ")} · ${formatearValor(selected.value, metric.format)} · ${selected.count} filas` : "Pasá el cursor o enfocá una barra para ver su valor."}</p>
  </div>;
}
