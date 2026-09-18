"use client";

/**
 * Tablero de un informe con varias fuentes.
 *
 * Arriba, TODAS las fuentes a la vez: una tarjeta por fuente con su titular,
 * su variación y su curva. Antes esta pantalla tenía un `<select>` y mostraba
 * una fuente sola: con doce fuentes eso obliga a abrirlas de a una y recordar
 * los números, que es justamente lo que hacía que el tablero no se entendiera.
 * De ahí se va quitando información en dos pasos: elegir una empresa recorta
 * las doce fuentes juntas, y elegir una fuente abre su detalle (períodos,
 * comparación, distribución, filas y CSV).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { expandRows, groupRows, metricValue, timeValue, type Analytics, type Dataset } from "@/lib/analytics";
import { fechaHoraCorta, formatearValor } from "@/lib/format";
import { etiquetaDeCampo } from "@/lib/etiquetas";
import { LineChart } from "@/components/LineChart";
import { dimensionAmbito, listarAmbitos, normalizarAmbito, recortarPorAmbito, resumenFuente } from "@/lib/analytics-panel";
import { defaultPeriod, previousPeriod, selectPeriod, series, delta, modeOf, sourceLabel, DAY, HOUR } from "@/lib/control-math";

const COLOR_SERIE = "#008d83";
const COLOR_COMPARACION = "#6979c7";
// Tres tonos del mismo verde para la barra de composición: la categoría que
// más pesa es la más oscura. No son colores de estado (nada acá es "malo").
const COLORES_PARTE = ["#008d83", "#4caaa2", "#9bcdc8"];

/** Lo que se mira, leído del hash: `#empresa=EMOVA&fuente=detalle_marcas`. */
function leerHash(): { empresa: string; fuente: string } {
  if (typeof window === "undefined") return { empresa: "", fuente: "" };
  const partes = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return { empresa: (partes.get("empresa") ?? "").toUpperCase(), fuente: partes.get("fuente") ?? "" };
}

export function AnalyticsDashboard({ analytics }: { analytics: Analytics }) {
  const [ambito, setAmbitoEstado] = useState("");
  // Arranca con una fuente abierta para que la pantalla no termine en un panel
  // sin nada debajo: se ve de entrada que cada tarjeta lleva a un detalle. La
  // de eventos primero, si hay, porque es la que se mira en vivo.
  const [abierta, setAbierta] = useState(
    analytics.datasets.find((d) => modeOf(d) === "events")?.id ?? analytics.datasets[0]?.id ?? ""
  );
  const ambitos = useMemo(() => listarAmbitos(analytics.datasets), [analytics]);
  const fuentes = useMemo(
    () => analytics.datasets.map((d) => recortarPorAmbito(d, ambito)),
    [analytics, ambito]
  );
  const dataset = fuentes.find((d) => d.id === abierta) ?? null;
  const detalleRef = useRef<HTMLDivElement | null>(null);

  // Empresa y fuente viven en el hash: así "mirá esto" es un link y no cuatro
  // instrucciones, y el botón de atrás del navegador deshace el recorte. Se lee
  // en un efecto (no en el useState inicial) porque en el servidor no hay hash
  // y el primer render tiene que coincidir con el del cliente.
  useEffect(() => {
    function aplicar() {
      const { empresa, fuente } = leerHash();
      setAmbitoEstado(ambitos.includes(empresa) ? empresa : "");
      if (fuente && analytics.datasets.some((d) => d.id === fuente)) setAbierta(fuente);
    }
    aplicar();
    window.addEventListener("hashchange", aplicar);
    return () => window.removeEventListener("hashchange", aplicar);
  }, [ambitos, analytics]);

  function escribirHash(empresa: string, fuente: string) {
    const partes = new URLSearchParams();
    if (empresa) partes.set("empresa", empresa);
    if (fuente) partes.set("fuente", fuente);
    const hash = partes.toString();
    history.replaceState(null, "", hash ? `#${hash}` : window.location.pathname + window.location.search);
  }
  function setAmbito(valor: string) {
    setAmbitoEstado(valor);
    escribirHash(valor, abierta);
  }

  // Al abrir una fuente el detalle queda debajo del panel: sin esto hay que
  // buscarlo a mano y parece que el click no hizo nada. Se scrollea sólo si el
  // cambio lo pidió alguien: la fuente inicial no la eligió nadie, y arrancar
  // la página scrolleada esconde justamente el panel. El pedido va en un ref y
  // se consume en el efecto porque en desarrollo React monta dos veces y un
  // simple "salteá el primer render" scrollea igual en el segundo.
  const pedido = useRef(false);
  useEffect(() => {
    if (!pedido.current) return;
    pedido.current = false;
    if (abierta) detalleRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [abierta]);
  function abrir(id: string) {
    pedido.current = id !== "";
    setAbierta(id);
    escribirHash(ambito, id);
  }

  return <section className="analytics" aria-label="Panel de indicadores">
    <div className="analytics-heading">
      <div>
        <p className="analytics-eyebrow">{analytics.title ?? "PANORAMA DEL INFORME"}</p>
        <h2>Todas las fuentes, juntas</h2>
        <p>{fuentes.length} fuentes de este informe. Elegí una empresa para recortarlas todas a la vez, y después una fuente para abrir su detalle.</p>
      </div>
      {ambitos.length > 1 && <label>Empresa
        <select value={ambito} onChange={(e) => setAmbito(e.target.value)}>
          <option value="">Todas las empresas ({ambitos.length})</option>
          {ambitos.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </label>}
    </div>
    {ambito && <p className="analytics-ambito" role="status">
      Todo el panel está recortado a <strong>{ambito}</strong>.
      <button type="button" className="enlace" onClick={() => setAmbito("")}>Quitar el recorte</button>
    </p>}
    {analytics.notice && <p className="analytics-warning" role="status">{analytics.notice}</p>}
    {analytics.warnings.length > 0 && <details className="analytics-warning"><summary>Calidad y cobertura de las fuentes ({analytics.warnings.length})</summary>
      {analytics.warnings.map((w, i) => <p key={i}>{w}</p>)}</details>}

    {fuentes.length === 0
      ? <p className="vacio">No hay fuentes analíticas disponibles.</p>
      : <div className="panel-fuentes">
          {fuentes.map((d) => <TarjetaFuente key={d.id} dataset={d} activa={d.id === abierta}
            recortado={Boolean(ambito)} onAbrir={() => abrir(d.id === abierta ? "" : d.id)} />)}
        </div>}

    {dataset ? <div className="analytics-detalle" ref={detalleRef}>
      <div className="analytics-heading">
        <div>
          <p className="analytics-eyebrow">DETALLE DE LA FUENTE</p>
          <h3>{dataset.title}{ambito ? ` · ${ambito}` : ""}</h3>
          <p>{dataset.description}</p>
        </div>
        <div className="detalle-controles">
          <label>Ver otra fuente<select value={dataset.id} onChange={(e) => abrir(e.target.value)}>
            {fuentes.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
          </select></label>
          <button type="button" onClick={() => abrir("")}>Cerrar detalle</button>
        </div>
      </div>
      <DatasetView key={dataset.id} dataset={dataset} dimensionOculta={ambito ? dimensionAmbito(dataset) : null} onAmbito={setAmbito} />
    </div> : <p className="analytics-coverage">Tocá una fuente para abrir su evolución, su distribución y sus filas.</p>}
  </section>;
}

function TarjetaFuente({ dataset: d, activa, recortado, onAbrir }: {
  dataset: Dataset; activa: boolean; recortado: boolean; onAbrir: () => void;
}) {
  const r = useMemo(() => resumenFuente(d), [d]);
  const sinDatos = !r.conDatos || r.total === null;
  const cambio = r.cambio && r.cambio.value !== null ? r.cambio : null;
  return <article className={`fuente-tarjeta${activa ? " selected" : ""}${sinDatos ? " sin-datos" : ""}`}>
    <button type="button" className="fuente-boton" aria-pressed={activa} onClick={onAbrir}>
      <span className="fuente-cabecera">
        <span className={`source-mode ${modeOf(d)}`}>{sourceLabel(d)}</span>
        {recortado && !dimensionAmbito(d) && <span className="fuente-nota">total, sin desglose por empresa</span>}
      </span>
      <span className="fuente-titulo">{d.title}</span>
      <span className="fuente-valor">{sinDatos ? "—" : formatearValor(r.total, r.metric.format)}</span>
      <span className="fuente-rotulo">{r.metric.label}
        {r.desglose && <> · desglosado por {etiquetaDeCampo(r.desglose).toLowerCase()}</>}</span>
      {cambio
        ? <span className={`fuente-cambio ${cambio.value! >= 0 ? "pos" : "neg"}`}>
            {cambio.value! >= 0 ? "▲" : "▼"} {Math.abs(cambio.value!).toFixed(1)}{cambio.label} vs. período anterior
          </span>
        : <span className="fuente-cambio neutra">{r.cambio?.label ?? "Foto del momento: no se compara"}</span>}
    </button>
    {r.reparto && <div className="fuente-composicion">
      <div className="fuente-barra">{r.reparto.partes.map((parte, i) => <span key={parte.label}
        style={{ width: `${parte.share}%`, background: COLORES_PARTE[i] ?? COLORES_PARTE[COLORES_PARTE.length - 1] }} />)}</div>
      <p className="fuente-leyenda">
        {/* Si el reparto se calculó con otra métrica que el titular, se aclara:
            si no, el 43% parecería ser del número grande de arriba. */}
        {r.reparto.metric.key !== r.metric.key && <>{r.reparto.metric.label}: </>}
        {r.reparto.partes.map((parte) => `${parte.label} ${Math.round(parte.share)}%`).join(" · ")}
      </p>
    </div>}
    <div className="fuente-spark" aria-hidden={r.puntos.length < 2}>
      {r.puntos.length > 1 && <LineChart compact format={r.metric.format}
        lines={[{ name: d.title, points: r.puntos, color: COLOR_SERIE }]} />}
    </div>
    <p className="fuente-pie">{sinDatos
      ? recortado ? "Sin datos para esta empresa" : "Sin datos publicados"
      : `${r.rotuloPeriodo} · ${r.filas.toLocaleString("es-AR")} filas`}</p>
  </article>;
}

function DatasetView({ dataset: d, dimensionOculta, onAmbito }: {
  dataset: Dataset;
  dimensionOculta: string | null;
  /** Elegir una empresa en la distribución recorta TODO el panel, no sólo esta fuente. */
  onAmbito: (valor: string) => void;
}) {
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
  // Dimensiones que sirven para desglosar acá adentro. Se sacan las que no
  // pueden filtrar nada: la del recorte global (ya fijada arriba) y las que
  // traen un solo valor en toda la fuente —un filtro con una sola opción, o un
  // "agrupar por" que dibuja una sola barra, es un control muerto que hay que
  // leer para descubrir que no hace nada.
  const dimensiones = useMemo(
    () => d.dimensions.filter(k =>
      k !== dimensionOculta && new Set(rows.map(r => String(r[k]))).size > 1),
    [d.dimensions, dimensionOculta, rows]
  );
  const [dimension, setDimension] = useState(dimensiones.find(k => k !== "tenant") ?? dimensiones[0] ?? "fecha");
  // Si cambió el recorte, la dimensión elegida puede haber dejado de existir.
  const dimActiva = dimensiones.includes(dimension) ? dimension : dimensiones[0] ?? "fecha";
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
  const ranking = useMemo(() => groupRows(filtered, dimActiva, m).sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity)), [filtered, dimActiva, m]);
  const last = dates[dates.length - 1];
  const pageCount = Math.ceil(filtered.length / 50);
  const currentPage = Math.min(page, Math.max(0, pageCount - 1));
  const filtrosActivos = Object.entries(filters).filter(([, v]) => v);

  function reset() { setFrom(dates[0] ?? ""); setTo(last ?? ""); setFilters({}); setPage(0); }
  function lastHour() {
    const latest = [...rows].map(r => timeValue(String(r.fecha))).sort((a,b) => a-b).at(-1);
    if (latest === undefined) return;
    // Comparar la última hora cerrada; la hora más reciente puede estar incompleta.
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
    const url = URL.createObjectURL(new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `${d.id}-filtrado.csv`; a.click(); URL.revokeObjectURL(url);
  }

  return <div>
    <div className="source-strip"><span className={`source-mode ${modeOf(d)}`}>{sourceLabel(d)}</span>
      <span>Dato publicado: {fechaHoraCorta(d.updatedAt)}</span>
      <span>{isSnapshot ? "Estado observado; no historial de estados" : "Comparación sobre fechas con datos"}</span></div>
    <div className="analytics-filters">
      <label>Desde<input type={from.length > 10 ? "datetime-local" : "date"} value={from} onChange={e => { setFrom(e.target.value); setPage(0); }} /></label>
      <label>Hasta<input type={to.length > 10 ? "datetime-local" : "date"} value={to} onChange={e => { setTo(e.target.value); setPage(0); }} /></label>
      {dimensiones.map(k => <label key={k}>{etiquetaDeCampo(k)}
        <select value={filters[k] ?? ""} onChange={e => { setFilters({ ...filters, [k]: e.target.value }); setPage(0); }}>
          <option value="">Todos</option>{[...new Set(rows.map(r => String(r[k])))].sort().map(v => <option key={v}>{v}</option>)}
        </select></label>)}
      <button onClick={reset}>Restablecer</button>
    </div>
    {filtrosActivos.length > 0 && <p className="analytics-chips">Filtros aplicados:
      {filtrosActivos.map(([k, v]) => <button key={k} type="button" className="chip"
        onClick={() => { setFilters({ ...filters, [k]: "" }); setPage(0); }}>
        {etiquetaDeCampo(k)}: {v} <span aria-hidden="true">✕</span><span className="sr-only"> (quitar)</span>
      </button>)}</p>}
    <div className="comparison-toolbar"><label>Comparar con<select value={isSnapshot ? "none" : comparison} disabled={isSnapshot} onChange={e => setComparison(e.target.value)}><option value="previous">Período anterior</option><option value="week">Una semana antes</option><option value="custom">Fechas personalizadas</option><option value="none">Sin comparación</option></select></label>
      {comparing && comparison === "custom" && <><label>Desde (comparación)<input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} /></label><label>Hasta (comparación)<input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} /></label></>}
      {comparing && <span>{prior.from} → {prior.to}</span>}</div>
    <div className="analytics-actions"><span>Hasta el último dato:</span>{[1, 7, 14, 30].map(n => <button key={n} onClick={() => recent(n)}>{n} días</button>)}{modeOf(d) === "events" && <button onClick={lastHour}>Última hora cerrada</button>}
      <span>{filtered.length.toLocaleString("es-AR")} filas · {new Set(filtered.map(r => String(r.fecha).slice(0, 10))).size} días con datos</span>
    </div>
    {from && to && from > to && <p role="alert">La fecha inicial debe ser anterior o igual a la final.</p>}
    <p className="analytics-coverage">Rango disponible: {dates[0] ?? "—"} → {last ?? "—"}. Los días ausentes no se consideran cero.</p>
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
          <LineChart format={m.format} lines={[{ name: "Período elegido", points: currentPoints, color: COLOR_SERIE }, ...(comparing ? [{ name: "Comparación", points: previousPoints, color: COLOR_COMPARACION, dashed: true }] : [])]} />
        </section>
        {dimensiones.length > 0 && <section className="analytics-panel"><div className="analytics-heading"><h3>Distribución</h3><label>Agrupar por<select value={dimActiva} onChange={e => setDimension(e.target.value)}>
          {dimensiones.map(k => <option value={k} key={k}>{etiquetaDeCampo(k)}</option>)}
        </select></label></div><p>Top 12 por {m.label.toLowerCase()}. Tocá una barra para filtrar{dimActiva === dimensionAmbito(d) ? " todo el panel por esa empresa" : ""}.</p>
          <div className="analytics-ranking">{ranking.slice(0, 12).map(p => <button key={p.label} onClick={() => {
            // Una empresa vale para las doce fuentes: se sube al recorte global
            // en vez de filtrar sólo esta grilla, que es lo que hacía antes y
            // dejaba el resto del panel mostrando otra cosa.
            if (dimActiva === dimensionAmbito(d)) { onAmbito(normalizarAmbito(p.label)); return; }
            setFilters({ ...filters, [dimActiva]: p.label }); setPage(0);
          }}>
            <span>{p.label}</span><strong>{formatearValor(p.value, m.format)}</strong>
            <span className="analytics-bar" style={{ width: `${Math.max(0, (p.value ?? 0) / Math.max(1, ...ranking.map(r => Math.abs(r.value ?? 0))) * 100)}%` }} />
          </button>)}</div>
        </section>}
      </div>
      <details className="analytics-panel"><summary>Ver filas y exportar CSV ({filtered.length} filas)</summary>
        <div className="analytics-actions"><button onClick={download}>Descargar CSV filtrado</button><span>Los campos *_cents se exportan en centavos.</span></div>
        <div className="tabla-envoltorio"><table><thead><tr>{d.columns.map(c => <th key={c}>{etiquetaDeCampo(c)}</th>)}</tr></thead>
          <tbody>{filtered.slice(currentPage * 50, currentPage * 50 + 50).map((r, i) => <tr key={i}>{d.columns.map(c => <td key={c}>{formatearValor(r[c], c.endsWith("_cents") ? "money_cents" : "count")}</td>)}</tr>)}</tbody>
        </table></div><div className="analytics-actions"><button disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>Anterior</button>
          <span>Página {currentPage + 1} de {pageCount}</span><button disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Siguiente</button></div>
      </details>
    </>}
    <details className="analytics-source"><summary>Procedencia y alcance de esta fuente</summary><p>{d.description}</p><p className="analytics-path">{d.source}</p>
      <p>La pantalla usa una copia publicada de los archivos. No consulta las bases en vivo ni dispara alertas.</p></details>
  </div>;
}
