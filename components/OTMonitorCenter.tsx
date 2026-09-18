"use client";

/**
 * Dashboard NOC de la flota de validadores (leandro/otmonitor). Reemplaza
 * una herramienta vieja en HTML + Bootstrap 5 + DataTables + Chart.js +
 * Leaflet (ver `OT Monitor CABA Buses v1.5/generar_dashboard.py`, función
 * `generar_html_dashboard`, que es la fuente de verdad de cómo se ve y qué
 * hace cada pieza de esta pantalla).
 *
 * Acá todo es React nativo salvo dos piezas que sí replican librerías del
 * original porque hacen falta para verse/comportarse igual:
 *  - Los gráficos usan Chart.js real (ver components/otmonitor/ChartCanvas),
 *    con los mismos tipos y colores que el original (barras apiladas,
 *    dona, torta, combo barra+línea con doble eje).
 *  - El mapa sigue en su propio archivo (OTMonitorMap) con Leaflet +
 *    leaflet.markercluster para agrupar los ~1300 puntos.
 * Las tres tablas grandes (MTT + 4 sub-vistas del Explorador) usan el
 * mismo componente DataTable (buscador, orden por columna, selector de
 * "Show N entries" y paginación numerada, export CSV/Copiar) para no
 * repetir esa lógica cuatro veces.
 */

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChartConfiguration } from "chart.js";
import { BADGE_HEX, type Dispositivo, type OTMonitorData, type OTMonitorResult, type RegistroMTT } from "@/lib/otmonitor-store";
import { formatearValor } from "@/lib/format";
import { ChartCanvas } from "@/components/otmonitor/ChartCanvas";
import { DataTable, type ColumnaTabla } from "@/components/otmonitor/DataTable";

// Leaflet toca `window` al cargarse: nunca puede evaluarse en el servidor.
const OTMonitorMap = dynamic(() => import("@/components/otmonitor/OTMonitorMap").then((m) => m.OTMonitorMap), {
  ssr: false,
  loading: () => <div className="otmonitor-map otmonitor-empty">Cargando mapa…</div>,
});

type FiltrosFlota = { operador: string; linea: string; estadoKal: string; modulo: string };
const FILTROS_VACIOS: FiltrosFlota = { operador: "", linea: "", estadoKal: "", modulo: "" };

// --- Helpers de datos, compartidos entre pestañas ---

function uniqueSorted(valores: string[]): string[] {
  return [...new Set(valores.filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
}

function modulosDeFallas(fallas: string): string[] {
  if (!fallas || fallas === "Ninguna") return [];
  return fallas.split(",").map((s) => s.trim()).filter(Boolean);
}

function coincideFlota(d: Dispositivo, f: FiltrosFlota): boolean {
  if (f.operador && d.operador !== f.operador) return false;
  if (f.linea && d.linea !== f.linea) return false;
  if (f.estadoKal && d.estado_kal !== f.estadoKal) return false;
  if (f.modulo && !modulosDeFallas(d.fallas).includes(f.modulo)) return false;
  return true;
}

function formatFecha(iso: string | null | undefined): string {
  if (!iso || iso === "N/A" || iso === "None") return "Sin dato";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return String(iso);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Argentina/Buenos_Aires",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(t).map((p) => [p.type, p.value])
  );
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}

function modaDe(valores: string[]): string {
  const cuenta = new Map<string, number>();
  for (const v of valores) cuenta.set(v, (cuenta.get(v) ?? 0) + 1);
  let mejor = "—";
  let max = 0;
  for (const [v, n] of cuenta) {
    if (n > max) {
      mejor = v;
      max = n;
    }
  }
  return mejor;
}

// --- Piezas de UI reutilizadas ---

function Badge({ texto, color, titulo }: { texto: string; color: string; titulo?: string }) {
  return (
    <span className="otmonitor-badge" style={{ background: BADGE_HEX[color] ?? "#6e7681" }} title={titulo}>
      {texto}
    </span>
  );
}

function BarraFiltros({
  filtros, onChange, operadores, lineas, estados, modulos, extra, onReset,
}: {
  filtros: FiltrosFlota;
  onChange: (patch: Partial<FiltrosFlota>) => void;
  operadores: string[]; lineas: string[]; estados: string[]; modulos: string[];
  extra?: React.ReactNode;
  onReset?: () => void;
}) {
  return (
    <div className="otmonitor-filtros">
      <label>
        Operador
        <select value={filtros.operador} onChange={(e) => onChange({ operador: e.target.value })}>
          <option value="">Todos</option>
          {operadores.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
      <label>
        Línea
        <select value={filtros.linea} onChange={(e) => onChange({ linea: e.target.value })}>
          <option value="">Todas</option>
          {lineas.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </label>
      <label>
        Estado Keep Alive
        <select value={filtros.estadoKal} onChange={(e) => onChange({ estadoKal: e.target.value })}>
          <option value="">Todos</option>
          {estados.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
      </label>
      <label>
        Módulo con falla
        <select value={filtros.modulo} onChange={(e) => onChange({ modulo: e.target.value })}>
          <option value="">Todos</option>
          {modulos.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </label>
      {extra}
      {onReset && <button type="button" className="otmonitor-reset" onClick={onReset}>Limpiar filtros</button>}
    </div>
  );
}

// --- Pestaña A: Indicadores Globales ---

// Paleta de colores de "Módulos Más Afectados" (dona) — la misma secuencia
// que usa el original para no perder la asociación módulo→color de un
// refresco al otro.
const PALETA_FALLAS = ["#da3633", "#d97706", "#2563eb", "#8b5cf6", "#ec4899", "#06b6d4", "#10b981"];

function TabGlobal({
  dispositivos, kpis, operadores, lineas, estados, modulos,
}: {
  dispositivos: Dispositivo[]; kpis: OTMonitorData["kpis"];
  operadores: string[]; lineas: string[]; estados: string[]; modulos: string[];
}) {
  const [filtros, setFiltros] = useState<FiltrosFlota>(FILTROS_VACIOS);
  const patch = useCallback((p: Partial<FiltrosFlota>) => setFiltros((f) => ({ ...f, ...p })), []);
  const filtrados = useMemo(() => dispositivos.filter((d) => coincideFlota(d, filtros)), [dispositivos, filtros]);

  // Gráfico 1: barras verticales apiladas, salud de módulos por operador
  // (verde = operativo, rojo = con al menos una falla). Igual que
  // `renderizarCharts` → chartOperadores en el original.
  const configModulos = useMemo<ChartConfiguration>(() => {
    const mapa = new Map<string, { ok: number; falla: number }>();
    for (const d of filtrados) {
      const key = d.operador || "Sin operador";
      const g = mapa.get(key) ?? { ok: 0, falla: 0 };
      if (d.num_fallas > 0) g.falla++; else g.ok++;
      mapa.set(key, g);
    }
    const labels = [...mapa.keys()];
    return {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "Módulos OK (Operativo)", data: labels.map((l) => mapa.get(l)!.ok), backgroundColor: "#238636" },
          { label: "Módulos con Falla", data: labels.map((l) => mapa.get(l)!.falla), backgroundColor: "#da3633" },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } },
    };
  }, [filtrados]);

  // Gráfico 2: barras verticales apiladas, estado Keep Alive por operador
  // (verde en línea / naranja leve-medio / rojo grave). "Sin datos KAL" se
  // suma al grave, igual que hace el `else` final del original.
  const configKal = useMemo<ChartConfiguration>(() => {
    const mapa = new Map<string, { online: number; medio: number; grave: number }>();
    for (const d of filtrados) {
      const key = d.operador || "Sin operador";
      const g = mapa.get(key) ?? { online: 0, medio: 0, grave: 0 };
      if (d.estado_kal === "En línea" || d.estado_kal === "Operando sin KAL reciente") g.online++;
      else if (d.estado_kal.includes("Leve") || d.estado_kal.includes("Medio")) g.medio++;
      else g.grave++;
      mapa.set(key, g);
    }
    const labels = [...mapa.keys()];
    return {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "En línea / Operando", data: labels.map((l) => mapa.get(l)!.online), backgroundColor: "#238636" },
          { label: "Offline Leve/Medio", data: labels.map((l) => mapa.get(l)!.medio), backgroundColor: "#d97706" },
          { label: "Offline Grave/Apagado", data: labels.map((l) => mapa.get(l)!.grave), backgroundColor: "#da3633" },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } },
    };
  }, [filtrados]);

  // Gráfico 3: dona, módulos más afectados (uno de cada falla activa).
  const configFallas = useMemo<ChartConfiguration>(() => {
    const mapa = new Map<string, number>();
    for (const d of filtrados) for (const f of modulosDeFallas(d.fallas)) mapa.set(f, (mapa.get(f) ?? 0) + 1);
    const labels = mapa.size ? [...mapa.keys()] : ["Sin fallas"];
    const data = mapa.size ? [...mapa.values()] : [1];
    return {
      type: "doughnut",
      data: { labels, datasets: [{ data, backgroundColor: labels.map((_, i) => PALETA_FALLAS[i % PALETA_FALLAS.length]) }] },
      options: { responsive: true, maintainAspectRatio: false },
    };
  }, [filtrados]);

  // Gráfico 4: torta, nivel de cobertura celular por rango de señal.
  // Mismos cortes que el original: 5★ excelente, 3-4★ buena, 1-2★ débil,
  // 0 sin señal.
  const configSignal = useMemo<ChartConfiguration>(() => {
    let excelente = 0, buena = 0, debil = 0, sinSenal = 0;
    for (const d of filtrados) {
      const lvl = d.signal_level;
      if (lvl >= 5) excelente++;
      else if (lvl >= 3) buena++;
      else if (lvl >= 1) debil++;
      else sinSenal++;
    }
    return {
      type: "pie",
      data: {
        labels: ["Excelente (5★)", "Buena (3-4★)", "Débil (1-2★)", "Sin Señal"],
        datasets: [{ data: [excelente, buena, debil, sinSenal], backgroundColor: ["#238636", "#388bfd", "#d97706", "#da3633"] }],
      },
      options: { responsive: true, maintainAspectRatio: false },
    };
  }, [filtrados]);

  return (
    <>
      <BarraFiltros
        filtros={filtros} onChange={patch} operadores={operadores} lineas={lineas} estados={estados} modulos={modulos}
        onReset={() => setFiltros(FILTROS_VACIOS)}
        extra={<span className="otmonitor-contador">{filtrados.length} de {dispositivos.length} dispositivos</span>}
      />
      <div className="tarjetas">
        <div className="tarjeta otm-accent-blue"><p className="rotulo">Total monitoreados</p><p className="valor">{formatearValor(kpis.total_monitoreados, "count")}</p></div>
        <div className="tarjeta otm-ok"><p className="rotulo">En línea</p><p className="valor">{formatearValor(kpis.en_linea, "count")}</p><p className="otm-sub">{kpis.en_linea_pct.toFixed(1)}% de la flota</p></div>
        <div className="tarjeta otm-warn"><p className="rotulo">Offline leve / medio</p><p className="valor">{formatearValor(kpis.offline_medio, "count")}</p></div>
        <div className="tarjeta otm-bad"><p className="rotulo">Offline grave / apagado</p><p className="valor">{formatearValor(kpis.offline_grave, "count")}</p></div>
        <div className="tarjeta otm-bad"><p className="rotulo">Con fallas de hardware</p><p className="valor">{formatearValor(kpis.con_fallas_hw, "count")}</p><p className="otm-sub">{kpis.con_fallas_hw_pct.toFixed(1)}% de la flota</p></div>
        <div className="tarjeta otm-accent-cyan"><p className="rotulo">Señal promedio</p><p className="valor">{kpis.senal_promedio_dbm.toFixed(1)} dBm</p></div>
      </div>
      <p className="otmonitor-note">Las tarjetas de arriba son totales de toda la flota (no cambian con los filtros); los gráficos de abajo sí reflejan lo filtrado.</p>
      <div className="otmonitor-charts">
        <div className="otmonitor-chart">
          <h3>Distribución de Salud Módulos por Operador</h3>
          <ChartCanvas config={configModulos} alto={270} />
        </div>
        <div className="otmonitor-chart">
          <h3>Estado Keep Alive por Operador</h3>
          <ChartCanvas config={configKal} alto={270} />
        </div>
      </div>
      <div className="otmonitor-charts">
        <div className="otmonitor-chart">
          <h3>Módulos Más Afectados (Fallas)</h3>
          <ChartCanvas config={configFallas} alto={270} />
        </div>
        <div className="otmonitor-chart">
          <h3>Nivel de Cobertura Celular</h3>
          <ChartCanvas config={configSignal} alto={270} />
        </div>
      </div>
    </>
  );
}

// --- Pestaña B: Operaciones MTT (SQL Server) ---

type FiltrosMtt = { base: string; texto: string; company: string; linea: string };
const FILTROS_MTT_VACIOS: FiltrosMtt = { base: "", texto: "", company: "", linea: "" };

function coincideMtt(r: RegistroMTT, f: FiltrosMtt): boolean {
  if (f.base && r.base_datos_mssql !== f.base) return false;
  if (f.company && r.id_company !== f.company) return false;
  if (f.linea && r.linea_mtt !== f.linea) return false;
  if (f.texto) {
    const q = f.texto.trim().toLowerCase();
    if (!`${r.interno} ${r.serial_number}`.toLowerCase().includes(q)) return false;
  }
  return true;
}

function esFechaValida(v: string): boolean {
  return Boolean(v) && v !== "N/A" && v !== "None";
}

function TabMtt({ mtt, generadoEn }: { mtt: RegistroMTT[]; generadoEn: string }) {
  const [filtros, setFiltros] = useState<FiltrosMtt>(FILTROS_MTT_VACIOS);
  const bases = useMemo(() => uniqueSorted(mtt.map((r) => r.base_datos_mssql)), [mtt]);
  const companies = useMemo(() => uniqueSorted(mtt.map((r) => r.id_company)), [mtt]);
  const lineas = useMemo(() => uniqueSorted(mtt.map((r) => r.linea_mtt)), [mtt]);
  const filtrados = useMemo(() => mtt.filter((r) => coincideMtt(r, filtros)), [mtt, filtros]);

  const recientes = useMemo(() => {
    const ahora = Date.parse(generadoEn);
    if (!Number.isFinite(ahora)) return 0;
    return filtrados.filter((r) => {
      const t = Date.parse(r.ultimo_tap);
      return Number.isFinite(t) && ahora - t >= 0 && ahora - t <= 24 * 3600 * 1000;
    }).length;
  }, [filtrados, generadoEn]);

  const versionPredominante = useMemo(() => modaDe(filtrados.map((r) => r.app_version).filter(Boolean)), [filtrados]);

  // Gráfico 1: distribución de AppVersion desplegada (barra simple).
  const configVersiones = useMemo<ChartConfiguration>(() => {
    const mapa = new Map<string, number>();
    for (const r of filtrados) {
      const v = r.app_version;
      if (v && v !== "N/A" && v !== "None") mapa.set(v, (mapa.get(v) ?? 0) + 1);
    }
    const labels = [...mapa.keys()];
    return {
      type: "bar",
      data: { labels, datasets: [{ label: "Unidades Desplegadas", data: labels.map((l) => mapa.get(l)!), backgroundColor: "#388bfd" }] },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } },
    };
  }, [filtrados]);

  // Gráfico 2: combo barra (taps) + línea (buses distintos) por fecha, con
  // doble eje Y — igual que chartMttTimeline en el original. La fecha se
  // recorta a los primeros 10 caracteres ("YYYY-MM-DD...") porque así llega
  // el timestamp de MSSQL en `ultimo_tap`.
  const configTimeline = useMemo<ChartConfiguration>(() => {
    const mapa = new Map<string, { taps: number; buses: Set<string> }>();
    for (const r of filtrados) {
      if (!esFechaValida(r.ultimo_tap)) continue;
      const fecha = r.ultimo_tap.substring(0, 10);
      const g = mapa.get(fecha) ?? { taps: 0, buses: new Set<string>() };
      g.taps++;
      if (r.interno && r.interno !== "N/A") g.buses.add(r.interno);
      mapa.set(fecha, g);
    }
    const fechas = [...mapa.keys()].sort();
    return {
      type: "bar",
      data: {
        labels: fechas,
        datasets: [
          {
            type: "bar",
            label: "Cantidad de Taps",
            data: fechas.map((f) => mapa.get(f)!.taps),
            backgroundColor: "rgba(56, 139, 253, 0.7)",
            borderColor: "#388bfd",
            borderWidth: 1,
            yAxisID: "y",
          },
          {
            type: "line",
            label: "Buses Operativos",
            data: fechas.map((f) => mapa.get(f)!.buses.size),
            borderColor: "#238636",
            backgroundColor: "#238636",
            borderWidth: 2,
            tension: 0.3,
            fill: false,
            yAxisID: "y1",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { type: "linear", position: "left", title: { display: true, text: "Taps" } },
          y1: { type: "linear", position: "right", title: { display: true, text: "Colectivos" }, grid: { drawOnChartArea: false } },
        },
      },
    } as ChartConfiguration;
  }, [filtrados]);

  const columnas = useMemo<ColumnaTabla<RegistroMTT>[]>(() => [
    { key: "base", header: "Base", texto: (r) => r.base_datos_mssql, render: (r) => <span className="otmonitor-mono">{r.base_datos_mssql}</span> },
    { key: "interno", header: "Interno", texto: (r) => r.interno, ordenar: (r) => Number(r.interno) || r.interno, render: (r) => r.interno },
    { key: "tap", header: "Último tap", texto: (r) => formatFecha(r.ultimo_tap), ordenar: (r) => Date.parse(r.ultimo_tap) || 0, render: (r) => formatFecha(r.ultimo_tap) },
    { key: "kal", header: "Último KAL", texto: (r) => formatFecha(r.fecha_kal), ordenar: (r) => Date.parse(r.fecha_kal) || 0, render: (r) => formatFecha(r.fecha_kal) },
    { key: "estado", header: "Estado KAL", texto: (r) => r.estado_kal, render: (r) => <Badge texto={r.estado_kal} color={r.badge_color_kal} titulo={r.diagnostico_kal} /> },
    { key: "serial", header: "Serial", texto: (r) => r.serial_number, render: (r) => <span className="otmonitor-mono">{r.serial_number}</span> },
    { key: "sam", header: "SAM UID", texto: (r) => r.sam_uid, render: (r) => <span className="otmonitor-mono">{r.sam_uid}</span> },
    { key: "company", header: "Company", texto: (r) => r.id_company, render: (r) => r.id_company },
    { key: "linea", header: "Línea", texto: (r) => r.linea_mtt, render: (r) => r.linea_mtt },
    { key: "appver", header: "App version", texto: (r) => r.app_version, render: (r) => r.app_version },
    { key: "dominio", header: "Dominio", texto: (r) => r.dominio, render: (r) => r.dominio },
  ], []);

  return (
    <>
      <div className="otmonitor-filtros">
        <label>
          Base de datos
          <select value={filtros.base} onChange={(e) => setFiltros({ ...filtros, base: e.target.value })}>
            <option value="">Todas</option>
            {bases.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </label>
        <label>
          Interno / Serial
          <input type="text" placeholder="Buscar…" value={filtros.texto} onChange={(e) => setFiltros({ ...filtros, texto: e.target.value })} />
        </label>
        <label>
          Company
          <select value={filtros.company} onChange={(e) => setFiltros({ ...filtros, company: e.target.value })}>
            <option value="">Todas</option>
            {companies.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label>
          Línea
          <select value={filtros.linea} onChange={(e) => setFiltros({ ...filtros, linea: e.target.value })}>
            <option value="">Todas</option>
            {lineas.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
        <span className="otmonitor-contador">{filtrados.length} de {mtt.length} registros</span>
        <button type="button" className="otmonitor-reset" onClick={() => setFiltros(FILTROS_MTT_VACIOS)}>Limpiar filtros</button>
      </div>
      <div className="tarjetas">
        <div className="tarjeta otm-accent-cyan">
          <p className="rotulo">Total registros MSSQL</p>
          <p className="valor">{formatearValor(filtrados.length, "count")}</p>
          {filtrados.length !== mtt.length && <p className="otm-sub">de {mtt.length} totales</p>}
        </div>
        <div className="tarjeta otm-ok"><p className="rotulo">Taps recientes (&lt;24hs)</p><p className="valor">{formatearValor(recientes, "count")}</p></div>
        <div className="tarjeta otm-warn"><p className="rotulo">Versión app predominante</p><p className="valor" style={{ fontSize: 26 }}>{versionPredominante}</p></div>
      </div>
      <div className="otmonitor-charts">
        <div className="otmonitor-chart">
          <h3>Evolución de Taps &amp; Buses por Fecha</h3>
          <ChartCanvas config={configTimeline} alto={260} />
        </div>
        <div className="otmonitor-chart">
          <h3>Distribución de Versiones de Aplicación (AppVersion)</h3>
          <ChartCanvas config={configVersiones} alto={260} />
        </div>
      </div>
      <DataTable columnas={columnas} filas={filtrados} rowKey={(r, i) => `${r.serial_number}-${i}`} nombreArchivo="ot-monitor-mtt" />
    </>
  );
}

// --- Pestaña C: Mapa GIS ---

function TabMapa({
  dispositivos, operadores, lineas, estados, modulos,
}: {
  dispositivos: Dispositivo[]; operadores: string[]; lineas: string[]; estados: string[]; modulos: string[];
}) {
  const [filtros, setFiltros] = useState<FiltrosFlota>(FILTROS_VACIOS);
  const patch = useCallback((p: Partial<FiltrosFlota>) => setFiltros((f) => ({ ...f, ...p })), []);
  const filtrados = useMemo(() => dispositivos.filter((d) => coincideFlota(d, filtros)), [dispositivos, filtros]);
  // gps_ok="Sí" no alcanza solo: un (0,0) es "Null Island", coordenada
  // inválida típica de un GPS que nunca fijó posición.
  const conGps = useMemo(
    () => filtrados.filter((d) => d.gps_ok === "Sí" && Number.isFinite(d.lat) && Number.isFinite(d.lon) && !(d.lat === 0 && d.lon === 0)),
    [filtrados]
  );

  return (
    <>
      <BarraFiltros
        filtros={filtros} onChange={patch} operadores={operadores} lineas={lineas} estados={estados} modulos={modulos}
        onReset={() => setFiltros(FILTROS_VACIOS)}
        extra={<span className="otmonitor-contador">{conGps.length} con GPS válido de {filtrados.length} filtrados</span>}
      />
      <OTMonitorMap dispositivos={conGps} />
    </>
  );
}

// --- Pestaña D: Explorador ---

type FiltrosExplorador = FiltrosFlota & { terminal: string };
const FILTROS_EXPLORADOR_VACIOS: FiltrosExplorador = { ...FILTROS_VACIOS, terminal: "" };

const SUBTABS = [
  { key: "modem", label: "Módem & Keep Alive" },
  { key: "gps", label: "GPS & Ubicación" },
  { key: "emv", label: "Lector EMV/SAM" },
  { key: "sistema", label: "Sistema & Hardware" },
] as const;
type SubTab = (typeof SUBTABS)[number]["key"];

function useColumnasModem(): ColumnaTabla<Dispositivo>[] {
  return useMemo(() => [
    { key: "serial", header: "Serial", texto: (d) => d.serial, render: (d) => d.serial },
    { key: "terminal", header: "Terminal", texto: (d) => d.terminal_id, render: (d) => d.terminal_id },
    { key: "linea", header: "Línea", texto: (d) => d.linea, render: (d) => d.linea },
    { key: "operador", header: "Operador", texto: (d) => d.operador, render: (d) => d.operador },
    { key: "estado", header: "Estado KAL", texto: (d) => d.estado_kal, render: (d) => <Badge texto={d.estado_kal} color={d.badge_color} titulo={d.diagnostico} /> },
    { key: "fallas", header: "Fallas", texto: (d) => d.fallas, render: (d) => d.fallas },
    { key: "dato", header: "Último dato", texto: (d) => formatFecha(d.time_stamp), ordenar: (d) => Date.parse(d.time_stamp) || 0, render: (d) => formatFecha(d.time_stamp) },
    { key: "ip", header: "IP", texto: (d) => d.ip, render: (d) => d.ip },
    { key: "tec", header: "Tecnología", texto: (d) => d.tecnologia, render: (d) => d.tecnologia },
    { key: "dbm", header: "dBm", texto: (d) => String(d.dbm), ordenar: (d) => d.dbm, align: "right", render: (d) => d.dbm },
    { key: "imei", header: "IMEI", texto: (d) => d.imei, render: (d) => d.imei },
  ], []);
}

function useColumnasGps(): ColumnaTabla<Dispositivo>[] {
  return useMemo(() => [
    { key: "serial", header: "Serial", texto: (d) => d.serial, render: (d) => d.serial },
    { key: "terminal", header: "Terminal", texto: (d) => d.terminal_id, render: (d) => d.terminal_id },
    { key: "linea", header: "Línea", texto: (d) => d.linea, render: (d) => d.linea },
    { key: "gps", header: "GPS OK", texto: (d) => d.gps_ok, render: (d) => d.gps_ok },
    { key: "lat", header: "Lat", texto: (d) => d.lat.toFixed(5), ordenar: (d) => d.lat, align: "right", render: (d) => d.lat.toFixed(5) },
    { key: "lon", header: "Lon", texto: (d) => d.lon.toFixed(5), ordenar: (d) => d.lon, align: "right", render: (d) => d.lon.toFixed(5) },
    { key: "vel", header: "Velocidad", texto: (d) => String(d.speed), ordenar: (d) => d.speed, align: "right", render: (d) => d.speed },
    { key: "sat", header: "Satélites", texto: (d) => String(d.satellites), ordenar: (d) => d.satellites, align: "right", render: (d) => d.satellites },
    { key: "fix", header: "Fix", texto: (d) => d.fix_type, render: (d) => d.fix_type },
  ], []);
}

function useColumnasEmv(): ColumnaTabla<Dispositivo>[] {
  return useMemo(() => [
    { key: "serial", header: "Serial", texto: (d) => d.serial, render: (d) => d.serial },
    { key: "terminal", header: "Terminal", texto: (d) => d.terminal_id, render: (d) => d.terminal_id },
    { key: "linea", header: "Línea", texto: (d) => d.linea, render: (d) => d.linea },
    { key: "vlib", header: "vlib", texto: (d) => d.vlib_version, render: (d) => d.vlib_version },
    { key: "sam", header: "SAM", texto: (d) => d.sam_version, render: (d) => d.sam_version },
    { key: "psp", header: "PSP", texto: (d) => d.psp_ok, render: (d) => <span className={d.psp_ok === "OK" ? "pct-pos" : "pct-neg"}>{d.psp_ok}</span> },
    { key: "samsrv", header: "SAM server", texto: (d) => d.sam_server_ok, render: (d) => <span className={d.sam_server_ok === "OK" ? "pct-pos" : "pct-neg"}>{d.sam_server_ok}</span> },
    { key: "estado", header: "Estado KAL", texto: (d) => d.estado_kal, render: (d) => <Badge texto={d.estado_kal} color={d.badge_color} titulo={d.diagnostico} /> },
  ], []);
}

function useColumnasSistema(): ColumnaTabla<Dispositivo>[] {
  return useMemo(() => [
    { key: "serial", header: "Serial", texto: (d) => d.serial, render: (d) => d.serial },
    { key: "terminal", header: "Terminal", texto: (d) => d.terminal_id, render: (d) => d.terminal_id },
    { key: "linea", header: "Línea", texto: (d) => d.linea, render: (d) => d.linea },
    { key: "version", header: "Versión", texto: (d) => d.version, render: (d) => d.version },
    { key: "cpu", header: "CPU", texto: (d) => String(d.cpu), ordenar: (d) => d.cpu, align: "right", render: (d) => `${d.cpu}%` },
    { key: "ram", header: "RAM", texto: (d) => String(d.ram), ordenar: (d) => d.ram, align: "right", render: (d) => `${d.ram}%` },
    { key: "storage", header: "Storage libre", texto: (d) => String(d.storage_free_mb), ordenar: (d) => d.storage_free_mb, align: "right", render: (d) => `${d.storage_free_mb} MB` },
    { key: "uptime", header: "Uptime", texto: (d) => d.uptime_hs.toFixed(1), ordenar: (d) => d.uptime_hs, align: "right", render: (d) => `${d.uptime_hs.toFixed(1)} hs` },
    { key: "estado", header: "Estado KAL", texto: (d) => d.estado_kal, render: (d) => <Badge texto={d.estado_kal} color={d.badge_color} titulo={d.diagnostico} /> },
  ], []);
}

function TabExplorador({
  dispositivos, operadores, lineas, estados, modulos,
}: {
  dispositivos: Dispositivo[]; operadores: string[]; lineas: string[]; estados: string[]; modulos: string[];
}) {
  const [filtros, setFiltros] = useState<FiltrosExplorador>(FILTROS_EXPLORADOR_VACIOS);
  const [sub, setSub] = useState<SubTab>("modem");
  const patch = useCallback((p: Partial<FiltrosFlota>) => setFiltros((f) => ({ ...f, ...p })), []);
  const filtrados = useMemo(() => {
    const q = filtros.terminal.trim().toLowerCase();
    return dispositivos.filter((d) => coincideFlota(d, filtros) && (!q || `${d.terminal_id} ${d.serial}`.toLowerCase().includes(q)));
  }, [dispositivos, filtros]);

  const columnasModem = useColumnasModem();
  const columnasGps = useColumnasGps();
  const columnasEmv = useColumnasEmv();
  const columnasSistema = useColumnasSistema();
  const rowKey = useCallback((d: Dispositivo) => d.serial, []);

  return (
    <>
      <BarraFiltros
        filtros={filtros} onChange={patch} operadores={operadores} lineas={lineas} estados={estados} modulos={modulos}
        onReset={() => setFiltros(FILTROS_EXPLORADOR_VACIOS)}
        extra={<>
          <label>Terminal / Serial<input type="text" placeholder="Buscar…" value={filtros.terminal} onChange={(e) => setFiltros({ ...filtros, terminal: e.target.value })} /></label>
          <span className="otmonitor-contador">{filtrados.length} de {dispositivos.length} dispositivos</span>
        </>}
      />
      <div className="otmonitor-subtabs">
        {SUBTABS.map((t) => (
          <button key={t.key} type="button" className={sub === t.key ? "active" : ""} onClick={() => setSub(t.key)}>{t.label}</button>
        ))}
      </div>
      {sub === "modem" && <DataTable columnas={columnasModem} filas={filtrados} rowKey={rowKey} nombreArchivo="ot-monitor-modem" />}
      {sub === "gps" && <DataTable columnas={columnasGps} filas={filtrados} rowKey={rowKey} nombreArchivo="ot-monitor-gps" />}
      {sub === "emv" && <DataTable columnas={columnasEmv} filas={filtrados} rowKey={rowKey} nombreArchivo="ot-monitor-emv" />}
      {sub === "sistema" && <DataTable columnas={columnasSistema} filas={filtrados} rowKey={rowKey} nombreArchivo="ot-monitor-sistema" />}
    </>
  );
}

// --- Componente principal ---

type Tab = "global" | "mtt" | "mapa" | "explorador";
const TABS: { key: Tab; label: string }[] = [
  { key: "global", label: "Indicadores globales" },
  { key: "mtt", label: "Operaciones MTT" },
  { key: "mapa", label: "Mapa GIS" },
  { key: "explorador", label: "Explorador" },
];
const esTab = (v: string | null): v is Tab => TABS.some((t) => t.key === v);

/** La pestaña abierta vive en el hash de la URL (#mapa) para que un link a
 *  "mirá el mapa" lleve al mapa, y para que recargar no devuelva siempre a la
 *  primera pestaña. Se lee del hash y no de un query param para no pelear con
 *  los parámetros que ya usa la página. */
function useTabEnUrl(): [Tab, (t: Tab) => void] {
  const [tab, setTab] = useState<Tab>("global");
  useEffect(() => {
    const desdeHash = () => {
      const h = window.location.hash.replace("#", "");
      if (esTab(h)) setTab(h);
    };
    desdeHash();
    window.addEventListener("hashchange", desdeHash);
    return () => window.removeEventListener("hashchange", desdeHash);
  }, []);
  const cambiar = useCallback((t: Tab) => {
    setTab(t);
    if (typeof window !== "undefined") window.history.replaceState(null, "", `#${t}`);
  }, []);
  return [tab, cambiar];
}

export function OTMonitorCenter({ initial }: { initial: OTMonitorResult }) {
  const [result, setResult] = useState(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [auto, setAuto] = useState(true);
  const [tab, setTab] = useTabEnUrl();
  const inFlight = useRef(false);
  const abort = useRef<AbortController | null>(null);

  // Mismo patrón de polling que ControlCenter: 1 request en vuelo por vez,
  // aborta a los 25s para no dejar timers colgados, y un error de red nunca
  // pisa la última lectura buena que ya se está mostrando.
  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    const controller = new AbortController();
    abort.current = controller;
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch("/api/otmonitor", { cache: "no-store", signal: controller.signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se pudo actualizar");
      setResult(body);
      setFetchError("");
    } catch (e) {
      setFetchError(e instanceof Error && e.name !== "AbortError" ? e.message : "La consulta tardó demasiado. Se conserva la última lectura.");
    } finally {
      clearTimeout(timer);
      inFlight.current = false;
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      if (auto && document.visibilityState === "visible") void refresh();
    }, 60000);
    return () => {
      clearInterval(timer);
      abort.current?.abort();
    };
  }, [auto, refresh]);

  const data = result.data;
  const dispositivos = useMemo(() => data?.dispositivos ?? [], [data]);
  const operadores = useMemo(() => uniqueSorted(dispositivos.map((d) => d.operador)), [dispositivos]);
  const lineas = useMemo(() => uniqueSorted(dispositivos.map((d) => d.linea)), [dispositivos]);
  const estados = useMemo(() => uniqueSorted(dispositivos.map((d) => d.estado_kal)), [dispositivos]);
  const modulos = useMemo(() => uniqueSorted(dispositivos.flatMap((d) => modulosDeFallas(d.fallas))), [dispositivos]);

  return (
    <div className="otmonitor">
      <div className="otmonitor-head">
        <div>
          <h1>OT Monitor</h1>
          <p>Flota de validadores · dato generado {formatFecha(data?.generado_en)}</p>
        </div>
        <div className="otmonitor-refresh">
          <span><i className={`otmonitor-dot${auto ? "" : " stale"}`} />{auto ? "Auto-actualización activa" : "Auto-actualización pausada"}</span>
          <button type="button" onClick={() => void refresh()} disabled={refreshing}>{refreshing ? "Actualizando…" : "↻ Actualizar"}</button>
          <label><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />Cada 60s</label>
        </div>
      </div>

      {fetchError && (
        <div className="otmonitor-alert" role="alert">
          <strong>No se pudo refrescar.</strong> {fetchError} Se conserva la última lectura disponible.
        </div>
      )}

      {!data ? (
        <div className="otmonitor-empty">{result.error ?? "Todavía no hay datos de flota para mostrar."}</div>
      ) : (
        <>
          <div className="otmonitor-tabs">
            {TABS.map((t) => (
              <button key={t.key} type="button" className={tab === t.key ? "active" : ""} onClick={() => setTab(t.key)}>
                {t.label}
              </button>
            ))}
          </div>
          {tab === "global" && <TabGlobal dispositivos={dispositivos} kpis={data.kpis} operadores={operadores} lineas={lineas} estados={estados} modulos={modulos} />}
          {tab === "mtt" && <TabMtt mtt={data.mtt} generadoEn={data.generado_en} />}
          {tab === "mapa" && <TabMapa dispositivos={dispositivos} operadores={operadores} lineas={lineas} estados={estados} modulos={modulos} />}
          {tab === "explorador" && <TabExplorador dispositivos={dispositivos} operadores={operadores} lineas={lineas} estados={estados} modulos={modulos} />}
        </>
      )}
    </div>
  );
}
