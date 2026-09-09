"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ControlData, ControlProject } from "@/lib/control-store";
import { expandRows, metricValue, type Dataset, type Metric } from "@/lib/analytics";
import { ageLabel, delta, indexed, modeOf, previousPeriod, selectPeriod, series, sourceAge, sourceLabel, DAY, type Period } from "@/lib/control-math";
import { formatearValor } from "@/lib/format";
import { LineChart } from "@/components/LineChart";
import { BusinessDashboard } from "@/components/BusinessDashboard";
import { TripBaselineDashboard } from "@/components/TripBaselineDashboard";

const COLORS = ["#ee883b", "#617df3", "#16a593", "#bf73d5"];
function defaultDataset(project: ControlProject) {
  return project.analytics?.datasets.find(d => modeOf(d) === "events") ?? project.analytics?.datasets.find(d => modeOf(d) === "history") ?? project.analytics?.datasets[0];
}
function day(date: string) { return new Date(date).toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }); }
function formatDate(date: string | null) {
  if (!date) return "Sin registro";
  const value = new Date(/(?:Z|[+-]\d{2}:\d{2})$/.test(date) ? date : `${date}-03:00`);
  if (!Number.isFinite(value.getTime())) return "Fecha desconocida";
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(value).map(p => [p.type, p.value]));
  return `${parts.day}/${parts.month} ${parts.hour}:${parts.minute}`;
}

export function ControlCenter({ initial }: { initial: ControlData }) {
  const [data, setData] = useState(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [auto, setAuto] = useState(true);
  const [tab, setTab] = useState("business");
  const [now, setNow] = useState(Date.parse(initial.fetchedAt));
  const [period, setPeriod] = useState<Period>({ from: new Date(Date.parse(`${day(initial.fetchedAt)}T00:00:00Z`) - 6 * DAY).toISOString().slice(0,10), to: day(initial.fetchedAt) });
  const [preset, setPreset] = useState(7);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const inFlight = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true; setRefreshing(true);
    const controller = new AbortController(); abort.current = controller;
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch("/api/control", { cache: "no-store", signal: controller.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudo actualizar");
      setData(result); setError(""); setNow(Date.now());
    } catch (e) {
      setError(e instanceof Error && e.name !== "AbortError" ? e.message : "La consulta tardó demasiado. Se conserva la última lectura.");
    } finally { clearTimeout(timer); inFlight.current = false; setRefreshing(false); }
  }, []);
  useEffect(() => {
    const timer = setInterval(() => { setNow(Date.now()); if (auto && document.visibilityState === "visible") void refresh(); }, 60000);
    return () => { clearInterval(timer); abort.current?.abort(); };
  }, [auto, refresh]);
  useEffect(() => {
    if (preset) setPeriod({ from: new Date(Date.parse(`${day(data.fetchedAt)}T00:00:00Z`) - (preset - 1) * DAY).toISOString().slice(0,10), to: day(data.fetchedAt) });
  }, [data.fetchedAt, preset]);
  const projects = data.projects;
  const sources = projects.flatMap(p => p.analytics?.datasets ?? []);
  const overdue = projects.filter(p => !p.checkedAt || !p.cadenceSeconds || (sourceAge(p.checkedAt, now) ?? Infinity) > p.cadenceSeconds / 60 * 2).length;
  const eligible = projects.filter(p => p.analytics?.datasets.length);
  const prior = previousPeriod(period);
  function choosePeriod(n: number) { setPreset(n); setPeriod({ from: new Date(Date.parse(`${day(data.fetchedAt)}T00:00:00Z`) - (n - 1) * DAY).toISOString().slice(0,10), to: day(data.fetchedAt) }); }

  return <div className="command-center">
    <section className="control-hero">
      <div className="control-hero-top"><span className="control-eyebrow">OPENPASS / INTELIGENCIA OPERATIVA</span>
        <span className="console-clock">{formatDate(data.fetchedAt)} · Argentina</span></div>
      <div className="control-hero-title"><div><h1>Todo el negocio.<br /><em>Una sola mirada.</em></h1><p>Transporte y emisión: actividad, evolución y calidad de los datos.</p></div>
        <div className="control-refresh"><button onClick={() => void refresh()} disabled={refreshing}>{refreshing ? "Consultando…" : "↻ Actualizar tablero"}</button>
          <label><input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} />Consulta automática cada minuto</label>
          <small>Lee lo publicado; no ejecuta consultas en las bases.</small></div></div>
      <div className="hero-metrics"><div><strong>{projects.length.toString().padStart(2,"0")}</strong><span>proyectos autorizados</span></div>
        <div><strong>{sources.length.toString().padStart(2,"0")}</strong><span>fuentes de información</span></div>
        <div><strong>{sources.filter(d => modeOf(d) === "history").length.toString().padStart(2,"0")}</strong><span>series históricas</span></div>
        <div className={overdue ? "attention" : ""}><strong>{overdue ? `${overdue} por revisar` : "Sincronizado"}</strong><span>{overdue ? "sin sincronización reciente confirmada" : "colectores con lectura reciente"}</span></div></div>
    </section>

    {error && <div className="control-alert" role="alert"><strong>No se pudo refrescar.</strong> {error} Última consulta correcta: {formatDate(data.fetchedAt)}.</div>}
    <div className="control-navigation"><nav aria-label="Vistas del tablero">{[["business","Tránsito de hoy"],["finance","Cobros e histórico"],["overview","Otros indicadores"],["compare","Proyectos"],["sources","Fuentes"]].map(([key, text]) =>
      <button key={key} className={tab === key ? "active" : ""} aria-pressed={tab === key} onClick={() => setTab(key)}>{text}</button>)}</nav>
      <span className="consulted-at"><i />Consulta {ageLabel(sourceAge(data.fetchedAt, now))}</span></div>

    {tab !== "sources" && tab !== "business" && tab !== "finance" && <section className="control-period"><div><span className="control-eyebrow">PERÍODO COMPARTIDO</span><p>Los dos proyectos usan las mismas fechas.</p></div>
      <div className="period-presets">{[[1,"Hoy"],[7,"7 días"],[30,"30 días"]].map(([n, label]) => <button key={n} className={preset === n ? "active" : ""} onClick={() => choosePeriod(Number(n))}>{label}</button>)}</div>
      <label>Desde<input type="date" value={period.from} onChange={e => { setPreset(0); setPeriod({ ...period, from: e.target.value }); }} /></label>
      <label>Hasta<input type="date" value={period.to} onChange={e => { setPreset(0); setPeriod({ ...period, to: e.target.value }); }} /></label>
      <span className="prior-label">vs. {prior.from} → {prior.to}<small>Período anterior de igual duración</small></span>
    </section>}

    {!projects.length && <div className="control-empty">No tenés dashboards autorizados para mostrar aquí.</div>}
    {tab === "business" && <TripBaselineDashboard projects={projects} now={now} />}
    {tab === "finance" && <BusinessDashboard projects={projects} now={now} />}
    {tab === "overview" && <>
      <div className="project-grid">{projects.map((p, i) => <ProjectPanel key={p.id} project={p} color={COLORS[i % COLORS.length]} period={period} prior={prior} now={now}
        datasetId={selections[p.id]} onDataset={id => setSelections({ ...selections, [p.id]: id })} />)}</div>
      <div className="control-callout"><div><span className="control-eyebrow">PONÉ LOS CAMBIOS EN CONTEXTO</span><h2>Dos curvas, el mismo período.</h2><p>Superponé las tendencias con base 100 o contrastá valores sin sumarlos.</p></div><button onClick={() => setTab("compare")}>Abrir comparación →</button></div>
    </>}
    {tab === "compare" && <ProjectComparison projects={eligible} period={period} />}
    {tab === "sources" && <section className="source-directory"><div className="section-heading"><div><span className="control-eyebrow">TRAZABILIDAD</span><h2>Qué estás mirando, y de cuándo es.</h2></div><span>Ninguna fuente se presenta como tiempo real directo.</span></div>
      <div className="update-explainer"><div><b>01</b><strong>Consulta del navegador</strong><p>Trae la última copia publicada cada minuto. No genera nuevos datos.</p></div>
        <div><b>02</b><strong>Sincronización</strong><p>La máquina de origen lee archivos y publica agregados. Si deja de hacerlo, aumenta la antigüedad.</p></div>
        <div><b>03</b><strong>Producción del dato</strong><p>Históricos diarios, fotos de Alarmbot y notificaciones de Leandro tienen tiempos diferentes.</p></div></div>
      {projects.map(p => <div key={p.id} className="source-project"><h3>{p.title}</h3><SyncStatus project={p} now={now} />
        <div className="source-list">{p.analytics?.datasets.map(d => <div className="source-row" key={d.id}><strong>{d.title}</strong><span className={`source-mode ${modeOf(d)}`}>{sourceLabel(d)}</span>
          <span>{formatDate(d.updatedAt)}<small>Último dato / exportación · {ageLabel(sourceAge(d.updatedAt, now))}</small></span>
          <span>{modeOf(d) === "history" ? "Actualización del proceso diario" : modeOf(d) === "events" ? "Se actualiza cuando llegan eventos" : "Foto; no historial de estados"}</span>
        </div>)}</div>{p.error && <p role="alert">{p.error}</p>}</div>)}
    </section>}
  </div>;
}

function SyncStatus({ project: p, now }: { project: ControlProject; now: number }) {
  const age = sourceAge(p.checkedAt ?? p.generatedAt ?? "", now);
  const fresh = Boolean(p.cadenceSeconds && p.checkedAt && age !== null && age <= p.cadenceSeconds / 60 * 2);
  return <div className={`sync-status ${fresh ? "fresh" : "stale"}`}><i /><strong>{fresh ? "Sincronización reciente" : p.cadenceSeconds ? "Sincronización atrasada" : "Copia manual"}</strong>
    <span>{ageLabel(age)}{p.cadenceSeconds ? ` · frecuencia ${p.cadenceSeconds / 60} min` : " · sin frecuencia confirmada"}</span></div>;
}

function ProjectPanel({ project: p, color, period, prior, now, datasetId, onDataset }: { project: ControlProject; color: string; period: Period; prior: Period; now: number; datasetId?: string; onDataset: (id: string) => void }) {
  const d = p.analytics?.datasets.find(d => d.id === datasetId) ?? defaultDataset(p);
  const [metricIndex, setMetricIndex] = useState(0);
  const metric = d?.metrics[Math.min(metricIndex, d.metrics.length - 1)];
  const rows = useMemo(() => d ? expandRows(d) : [], [d]);
  const current = selectPeriod(rows, period), previous = selectPeriod(rows, prior);
  const comparable = d && modeOf(d) !== "snapshot";
  const points = metric ? series(current, period, metric) : [];
  const before = metric && comparable ? series(previous, prior, metric) : [];
  return <section className="project-panel" style={{ borderTopColor: color }}>
    <div className="project-heading"><div><span className="control-eyebrow">{p.id.split("/")[0]}</span><h2>{p.title}</h2></div><Link href={p.href} aria-label={`Abrir ${p.title}`}>↗</Link></div>
    <SyncStatus project={p} now={now} />
    {d && metric ? <>
      <div className="project-source"><label>Indicador de seguimiento<select value={d.id} onChange={e => { onDataset(e.target.value); setMetricIndex(0); }}>{p.analytics?.datasets.map(s => <option key={s.id} value={s.id}>{s.title} · {sourceLabel(s)}</option>)}</select></label>
        <span className={`source-mode ${modeOf(d)}`}>{sourceLabel(d)}</span></div>
      <div className="project-kpis">{d.metrics.slice(0, 4).map((m, i) => {
        const value = metricValue(current, m), old = comparable ? metricValue(previous, m) : null;
        const change = delta(value, old, m.format === "percent");
        return <button key={`${m.key}-${i}`} onClick={() => setMetricIndex(i)} className={i === metricIndex ? "selected" : ""}><span>{m.label}</span><strong>{formatearValor(value, m.format)}</strong>
          <small>{!comparable ? "Último estado observado" : change.value === null ? change.label : `${change.value > 0 ? "+" : ""}${change.value.toFixed(1)}${change.label} vs. anterior`}</small></button>;
      })}</div>
      <LineChart lines={[{ name: metric.label, points, color }, ...(comparable ? [{ name: "Período anterior", points: before, color: "#a0aabc", dashed: true }] : [])]} format={metric.format} />
      <div className="project-footer"><span>{new Set(current.map(r => String(r.fecha).slice(0,10))).size} días con datos · {comparable && !previous.length ? "sin historia anterior para comparar" : `${current.length} registros agregados`}</span><Link href={p.href}>Filtros y detalle →</Link></div>
    </> : <div className="control-empty">{p.error ?? "Esta fuente todavía no ofrece series analíticas."}<Link href={p.href}>Abrir dashboard</Link></div>}
  </section>;
}

function ProjectComparison({ projects, period }: { projects: ControlProject[]; period: Period }) {
  const [leftId, setLeftId] = useState(projects[0]?.id ?? "");
  const [rightId, setRightId] = useState(projects[1]?.id ?? "");
  const [sources, setSources] = useState<Record<string,string>>({});
  const [metrics, setMetrics] = useState<Record<string,number>>({});
  const [indexMode, setIndexMode] = useState(true);
  if (projects.length < 2) return <div className="control-empty">Necesitás acceso a dos proyectos con datos para compararlos. No se consultan proyectos fuera de tus permisos.</div>;
  const selected = [projects.find(p => p.id === leftId) ?? projects[0], projects.find(p => p.id === rightId) ?? projects[1]];
  const datasets = selected.map((p,i) => p.analytics!.datasets.find(d => d.id === sources[String(i)]) ?? defaultDataset(p)!);
  const metricList = datasets.map((d,i) => d.metrics[Math.min(metrics[String(i)] ?? 0, d.metrics.length - 1)]);
  const compatible = metricList[0].format === metricList[1].format;
  const normalized = indexMode || !compatible;
  const comparable = datasets.every(d => modeOf(d) !== "snapshot");
  const lines = datasets.map((d,i) => {
    const points = series(expandRows(d), period, metricList[i]);
    return { name: `${selected[i].title} · ${metricList[i].label}`, points: normalized ? indexed(points) : points, color: COLORS[i] };
  });
  return <section className="comparison-studio"><div className="section-heading"><div><span className="control-eyebrow">COMPARACIÓN ENTRE PROYECTOS</span><h2>Cómo evoluciona cada negocio.</h2></div>
    <div className="period-presets"><button className={normalized ? "active" : ""} onClick={() => setIndexMode(true)}>Índice 100</button><button className={!normalized ? "active" : ""} disabled={!compatible} onClick={() => setIndexMode(false)}>Valores originales</button></div></div>
    <div className="compare-selectors">{selected.map((p,i) => <div key={i} style={{ borderLeftColor: COLORS[i] }}><label>Proyecto {i+1}<select value={p.id} onChange={e => { (i ? setRightId : setLeftId)(e.target.value); setSources({ ...sources, [i]: "" }); setMetrics({ ...metrics, [i]: 0 }); }}>{projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
      <label>Fuente<select value={datasets[i].id} onChange={e => { setSources({ ...sources, [i]: e.target.value }); setMetrics({ ...metrics, [i]: 0 }); }}>{p.analytics!.datasets.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}</select></label>
      <label>Métrica<select value={metrics[i] ?? 0} onChange={e => setMetrics({ ...metrics, [i]: Number(e.target.value) })}>{datasets[i].metrics.map((m,j) => <option key={j} value={j}>{m.label}</option>)}</select></label></div>)}</div>
    <p className="comparison-explanation">{normalized ? "Cada serie parte de 100 en su primer día con valor distinto de cero. Compara evolución relativa, no tamaño del negocio." : "Mismos ejes y formato, sin sumar valores. Las métricas conservan sus definiciones: monto procesado no es lo mismo que importe aprobado."}</p>
    {!comparable ? <div className="control-empty">Una fuente seleccionada sólo tiene la última foto. Elegí un histórico o actividad de eventos para comparar evolución.</div> : <>
      <LineChart lines={lines} format={normalized ? "count" : metricList[0].format} />
      {lines.some(l => l.points.filter(p => p.value !== null).length < 2) && <p className="control-alert">Una serie tiene menos de dos días con datos. Se muestra su punto disponible; todavía no alcanza para trazar una tendencia.</p>}
    </>}
    <div className="comparison-totals">{selected.map((p,i) => <div key={i}><span>{p.title}</span><strong>{formatearValor(metricValue(selectPeriod(expandRows(datasets[i]), period), metricList[i]), metricList[i].format)}</strong><small>{metricList[i].label} · período seleccionado</small></div>)}</div>
  </section>;
}
