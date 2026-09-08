"use client";

import { useMemo, useState } from "react";
import { expandRows, filterRows, groupRows, metricValue, timeValue, type Analytics, type Dataset, type Metric } from "@/lib/analytics";
import { formatearValor } from "@/lib/format";
import { LineChart } from "@/components/LineChart";
import { defaultPeriod, previousPeriod, selectPeriod, series, delta, modeOf, sourceLabel, DAY, HOUR } from "@/lib/control-math";

const label = (s: string) => s.replace(/_/g, " ").replace(/^./, c => c.toUpperCase());

export function AnalyticsDashboard({ analytics }: { analytics: Analytics }) {
  const [selected, setSelected] = useState(analytics.datasets.find(d => modeOf(d) === "events")?.id ?? analytics.datasets[0]?.id ?? "");
  const dataset = analytics.datasets.find(d => d.id === selected) ?? analytics.datasets[0];
  return <section className="analytics" aria-label="Explorador de indicadores">
    <div className="analytics-heading"><div><p className="analytics-eyebrow">{analytics.title ?? "ANÁLISIS DE DATOS"}</p>
      <h2>Explorar los datos</h2><p>Filtrá una fuente y compará su evolución y distribución.</p></div>
      <label>Indicador / fuente<select value={dataset?.id ?? ""} onChange={e => setSelected(e.target.value)}>
        {analytics.datasets.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
      </select></label></div>
    {analytics.notice && <p className="analytics-warning" role="status">{analytics.notice}</p>}
    {analytics.warnings.length > 0 && <details className="analytics-warning"><summary>Calidad y cobertura de las fuentes ({analytics.warnings.length})</summary>
      {analytics.warnings.map((w, i) => <p key={i}>{w}</p>)}</details>}
    {dataset ? <DatasetView key={dataset.id} dataset={dataset} /> : <p className="vacio">No hay fuentes analíticas disponibles.</p>}
  </section>;
}

function DatasetView({ dataset: d }: { dataset: Dataset }) {
  const rows = useMemo(() => expandRows(d), [d]);
  const dates = useMemo(() => [...new Set(rows.map(r => String(r.fecha).slice(0, 10)))].sort(), [rows]);
  const initial = defaultPeriod(d);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [comparison, setComparison] = useState("previous");
  const [customFrom, setCustomFrom] = useState(previousPeriod(initial).from);
  const [customTo, setCustomTo] = useState(previousPeriod(initial).to);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [metricIndex, setMetricIndex] = useState(0);
  const [dimension, setDimension] = useState(d.dimensions.find(k => k !== "tenant" && k !== "tipo_estado") ?? d.dimensions[0] ?? "fecha");
  const [page, setPage] = useState(0);
  const m = d.metrics[metricIndex];
  const filtered = useMemo(() => selectPeriod(rows, { from, to }, filters), [rows, from, to, filters]);
  const isSnapshot = modeOf(d) === "snapshot";
  const comparing = !isSnapshot && comparison !== "none";
  const prior = comparison === "custom" ? { from: customFrom, to: customTo } : previousPeriod({ from, to }, comparison === "week" ? 7 : undefined);
  const previous = useMemo(() => comparing ? selectPeriod(rows, prior, filters) : [], [rows, prior.from, prior.to, filters, comparing]);
  const hourly = rows.some(r => String(r.fecha).includes("T")) && timeValue(to) - timeValue(from) < 7 * DAY;
  const currentPoints = useMemo(() => series(filtered, { from, to }, m, hourly), [filtered, from, to, m, hourly]);
  const previousPoints = useMemo(() => comparing ? series(previous, prior, m, hourly) : [], [previous, prior.from, prior.to, m, hourly, comparing]);
  const ranking = useMemo(() => groupRows(filtered, dimension, m).sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity)), [filtered, dimension, m]);
  const last = dates[dates.length - 1];
  const pageCount = Math.ceil(filtered.length / 50);
  const currentPage = Math.min(page, Math.max(0, pageCount - 1));

  function reset() { setFrom(dates[0] ?? ""); setTo(last ?? ""); setFilters({}); setPage(0); }
  function lastHour() {
    const latest = [...rows].map(r => timeValue(String(r.fecha))).sort((a,b) => a-b).at(-1);
    if (latest === undefined) return;
    // Comparar la ?ltima hora cerrada; la hora m?s reciente puede estar incompleta.
    const end = Math.floor(latest / HOUR) * HOUR - 60000;
    setFrom(new Date(end - HOUR + 60000).toISOString().slice(0,16));
    setTo(new Date(end).toISOString().slice(0,16)); setPage(0);
  }
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
    <div className="source-strip"><span className={`source-mode ${modeOf(d)}`}>{sourceLabel(d)}</span>
      <span>Fuente: {d.updatedAt.replace("T", " ")}</span>
      <span>{isSnapshot ? "Estado observado; no historial de estados" : "Comparación sobre fechas con datos"}</span></div>
    <details className="analytics-coverage"><summary>Qué mide esta fuente</summary><p>{d.description}</p></details>
    <div className="analytics-filters">
      <label>Desde<input type={from.length > 10 ? "datetime-local" : "date"} value={from} onChange={e => { setFrom(e.target.value); setPage(0); }} /></label>
      <label>Hasta<input type={to.length > 10 ? "datetime-local" : "date"} value={to} onChange={e => { setTo(e.target.value); setPage(0); }} /></label>
      {d.dimensions.filter(k => k !== "tipo_estado").map(k => <label key={k}>{label(k)}
        <select value={filters[k] ?? ""} onChange={e => { setFilters({ ...filters, [k]: e.target.value }); setPage(0); }}>
          <option value="">Todos</option>{[...new Set(rows.map(r => String(r[k])))].sort().map(v => <option key={v}>{v}</option>)}
        </select></label>)}
      <button onClick={reset}>Restablecer</button>
    </div>
    <div className="comparison-toolbar"><label>Comparar con<select value={isSnapshot ? "none" : comparison} disabled={isSnapshot} onChange={e => setComparison(e.target.value)}><option value="previous">Período anterior</option><option value="week">Una semana antes</option><option value="custom">Fechas personalizadas</option><option value="none">Sin comparación</option></select></label>
      {comparing && comparison === "custom" && <><label>Desde (comparación)<input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} /></label><label>Hasta (comparación)<input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} /></label></>}
      {comparing && <span>{prior.from} → {prior.to}</span>}</div>
    <div className="analytics-actions"><span>Hasta el último dato:</span>{[1, 7, 14, 30].map(n => <button key={n} onClick={() => recent(n)}>{n} días</button>)}{modeOf(d) === "events" && <button onClick={lastHour}>Última hora cerrada</button>}
      <span>{filtered.length.toLocaleString("es-AR")} filas · {new Set(filtered.map(r => String(r.fecha).slice(0, 10))).size} días con datos</span>
    </div>
    {from && to && from > to && <p role="alert">La fecha inicial debe ser anterior o igual a la final.</p>}
    <p className="analytics-coverage">Rango disponible: {dates[0] ?? "—"} → {last ?? "—"}. Fuente actualizada: {d.updatedAt.replace("T", " ")}. Los días ausentes no se consideran cero.</p>
    <div className="tarjetas">{d.metrics.map((metric, i) => <button className={`tarjeta analytics-metric ${i === metricIndex ? "selected" : ""}`} key={i} onClick={() => setMetricIndex(i)} aria-pressed={i === metricIndex}>
      <span className="rotulo">{metric.label}</span><span className="valor">{formatearValor(metricValue(filtered, metric), metric.format)}</span>
      {comparing && <span className="metric-comparison">{(() => {
        const change = delta(metricValue(filtered, metric), metricValue(previous, metric), metric.format === "percent");
        return change.value === null ? change.label : `${change.value > 0 ? "+" : ""}${change.value.toFixed(1)}${change.label} · anterior ${formatearValor(metricValue(previous, metric), metric.format)}`;
      })()}</span>}
      <span className="muted">{metric.denominator ? "Razón calculada sobre el período" : "Total del filtro"}
        {filtered.some(r => typeof r[metric.key] !== "number" || (metric.denominator && typeof r[metric.denominator] !== "number")) ? " · datos parciales" : ""}</span>
    </button>)}</div>
    {!filtered.length ? <p className="vacio">Sin datos para estos filtros. Probá ampliar el período o restablecerlos.</p> : <>
      <div className="analytics-charts">
        <section className="analytics-panel"><h3>{m.label} · {isSnapshot ? "distribución por fecha" : "evolución"}</h3><p>{isSnapshot ? "Último estado disponible; no representa un historial de cambios." : "Línea continua: período elegido. Línea punteada: comparación, alineada por posición en el período. Los huecos indican ausencia de datos."}</p>
          <LineChart format={m.format} lines={[{ name: "Período elegido", points: currentPoints, color: "#008d83" }, ...(comparing ? [{ name: "Comparación", points: previousPoints, color: "#6979c7", dashed: true }] : [])]} />
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

