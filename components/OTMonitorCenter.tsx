"use client";

/**
 * Dashboard NOC de la flota de validadores (leandro/otmonitor). Reemplaza
 * una herramienta vieja en HTML + Bootstrap 5 + DataTables + Chart.js +
 * Leaflet: acá todo es React nativo salvo el mapa, que sigue usando Leaflet
 * (ver components/otmonitor/OTMonitorMap.tsx) porque dibujar ~1300 puntos
 * geográficos a mano no vale la pena reinventarlo.
 *
 * Los gráficos de la pestaña "Indicadores globales" son barras apiladas
 * hechas con <div>/CSS (mismo criterio que ya usa el resto de erick para
 * `.barra-fondo`/`.analytics-bar`): no hace falta sumar Chart.js para dos
 * gráficos de barras, y así el bundle no crece por una librería que sólo se
 * usaría acá.
 */

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BADGE_HEX, type Dispositivo, type OTMonitorData, type OTMonitorResult, type RegistroMTT } from "@/lib/otmonitor-store";
import { formatearValor } from "@/lib/format";

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
  if (!iso) return "Sin dato";
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

// Paginación simple client-side: no hace falta una librería de grid para
// ~1300 filas, alcanza con cortar el array ya filtrado. Usar Math.min contra
// totalPaginas-1 evita mostrar una página vacía cuando un filtro nuevo
// reduce el total y la página guardada quedó fuera de rango.
function usePaginacion<T>(filas: T[], porPagina: number) {
  const [pagina, setPagina] = useState(0);
  const totalPaginas = Math.max(1, Math.ceil(filas.length / porPagina));
  const paginaSegura = Math.min(pagina, totalPaginas - 1);
  const visibles = filas.slice(paginaSegura * porPagina, paginaSegura * porPagina + porPagina);
  return { visibles, pagina: paginaSegura, totalPaginas, setPagina };
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

function Pager({ pagina, totalPaginas, total, onPagina }: { pagina: number; totalPaginas: number; total: number; onPagina: (p: number) => void }) {
  if (totalPaginas <= 1) return null;
  return (
    <div className="otmonitor-pager">
      <span>{formatearValor(total, "count")} registros · página {pagina + 1} de {totalPaginas}</span>
      <button type="button" disabled={pagina === 0} onClick={() => onPagina(pagina - 1)}>← Anterior</button>
      <button type="button" disabled={pagina >= totalPaginas - 1} onClick={() => onPagina(pagina + 1)}>Siguiente →</button>
    </div>
  );
}

// --- Gráficos de barras apiladas por operador (Pestaña A) ---

type Segmento = { key: string; label: string; color: string; valor: number };
type FilaOperador = { operador: string; total: number; segmentos: Segmento[] };

function BarraOperadores({ filas, limite = 12 }: { filas: FilaOperador[]; limite?: number }) {
  const ordenadas = [...filas].sort((a, b) => b.total - a.total);
  const visibles = ordenadas.slice(0, limite);
  const resto = ordenadas.length - visibles.length;
  if (visibles.length === 0) return <p className="otmonitor-bar-note">Sin dispositivos para los filtros elegidos.</p>;
  return (
    <div className="otmonitor-bar-rows">
      {visibles.map((f) => (
        <div className="otmonitor-bar-row" key={f.operador}>
          <span title={f.operador}>{f.operador}</span>
          <div className="otmonitor-bar-track">
            {f.segmentos.filter((s) => s.valor > 0).map((s) => (
              <div key={s.key} className="otmonitor-bar-seg" style={{ width: `${(s.valor / f.total) * 100}%`, background: s.color }} title={`${s.label}: ${s.valor}`} />
            ))}
          </div>
          <span>{f.total}</span>
        </div>
      ))}
      {resto > 0 && <p className="otmonitor-bar-note">+{resto} operador(es) más. Filtrá por operador para verlos en detalle.</p>}
    </div>
  );
}

// --- Pestaña A: Indicadores Globales ---

function TabGlobal({
  dispositivos, kpis, operadores, lineas, estados, modulos,
}: {
  dispositivos: Dispositivo[]; kpis: OTMonitorData["kpis"];
  operadores: string[]; lineas: string[]; estados: string[]; modulos: string[];
}) {
  const [filtros, setFiltros] = useState<FiltrosFlota>(FILTROS_VACIOS);
  const patch = useCallback((p: Partial<FiltrosFlota>) => setFiltros((f) => ({ ...f, ...p })), []);
  const filtrados = useMemo(() => dispositivos.filter((d) => coincideFlota(d, filtros)), [dispositivos, filtros]);

  const porModulos = useMemo<FilaOperador[]>(() => {
    const mapa = new Map<string, { total: number; ok: number; falla: number }>();
    for (const d of filtrados) {
      const g = mapa.get(d.operador) ?? { total: 0, ok: 0, falla: 0 };
      g.total++;
      if (d.num_fallas > 0) g.falla++; else g.ok++;
      mapa.set(d.operador, g);
    }
    return [...mapa.entries()].map(([operador, g]) => ({
      operador, total: g.total,
      segmentos: [
        { key: "ok", label: "Sin fallas", color: BADGE_HEX.success, valor: g.ok },
        { key: "falla", label: "Con fallas", color: BADGE_HEX.danger, valor: g.falla },
      ],
    }));
  }, [filtrados]);

  const porKal = useMemo<FilaOperador[]>(() => {
    const mapa = new Map<string, { total: number; online: number; medio: number; grave: number; sinDato: number }>();
    for (const d of filtrados) {
      const g = mapa.get(d.operador) ?? { total: 0, online: 0, medio: 0, grave: 0, sinDato: 0 };
      g.total++;
      if (d.estado_kal === "En línea") g.online++;
      else if (d.estado_kal === "Offline - Leve" || d.estado_kal === "Offline - Medio") g.medio++;
      else if (d.estado_kal === "Offline - Grave" || d.estado_kal === "Vehículo apagado") g.grave++;
      else g.sinDato++;
      mapa.set(d.operador, g);
    }
    return [...mapa.entries()].map(([operador, g]) => ({
      operador, total: g.total,
      segmentos: [
        { key: "online", label: "En línea", color: BADGE_HEX.success, valor: g.online },
        { key: "medio", label: "Offline leve/medio", color: BADGE_HEX.warning, valor: g.medio },
        { key: "grave", label: "Offline grave/apagado", color: BADGE_HEX.danger, valor: g.grave },
        { key: "sinDato", label: "Sin dato reciente", color: BADGE_HEX.secondary, valor: g.sinDato },
      ],
    }));
  }, [filtrados]);

  return (
    <>
      <BarraFiltros
        filtros={filtros} onChange={patch} operadores={operadores} lineas={lineas} estados={estados} modulos={modulos}
        onReset={() => setFiltros(FILTROS_VACIOS)}
        extra={<span className="otmonitor-contador">{filtrados.length} de {dispositivos.length} dispositivos</span>}
      />
      <div className="tarjetas">
        <div className="tarjeta"><p className="rotulo">Total monitoreados</p><p className="valor">{formatearValor(kpis.total_monitoreados, "count")}</p></div>
        <div className="tarjeta otm-ok"><p className="rotulo">En línea</p><p className="valor">{formatearValor(kpis.en_linea, "count")}</p><p className="otm-sub">{kpis.en_linea_pct.toFixed(1)}% de la flota</p></div>
        <div className="tarjeta otm-warn"><p className="rotulo">Offline leve / medio</p><p className="valor">{formatearValor(kpis.offline_medio, "count")}</p></div>
        <div className="tarjeta otm-bad"><p className="rotulo">Offline grave / apagado</p><p className="valor">{formatearValor(kpis.offline_grave, "count")}</p></div>
        <div className="tarjeta otm-bad"><p className="rotulo">Con fallas de hardware</p><p className="valor">{formatearValor(kpis.con_fallas_hw, "count")}</p><p className="otm-sub">{kpis.con_fallas_hw_pct.toFixed(1)}% de la flota</p></div>
        <div className="tarjeta"><p className="rotulo">Señal promedio</p><p className="valor">{kpis.senal_promedio_dbm.toFixed(1)} dBm</p></div>
      </div>
      <p className="otmonitor-note">Las tarjetas de arriba son totales de toda la flota (no cambian con los filtros); los gráficos de abajo sí reflejan lo filtrado.</p>
      <div className="otmonitor-charts">
        <div className="otmonitor-chart">
          <h3>Módulos por operador</h3>
          <p>Dispositivos con al menos una falla de hardware activa frente a los que están OK.</p>
          <div className="otmonitor-bar-legend">
            <span><i style={{ background: BADGE_HEX.success }} />Sin fallas</span>
            <span><i style={{ background: BADGE_HEX.danger }} />Con fallas</span>
          </div>
          <BarraOperadores filas={porModulos} />
        </div>
        <div className="otmonitor-chart">
          <h3>Estado Keep Alive por operador</h3>
          <p>Distribución de estados de conectividad de cada operador.</p>
          <div className="otmonitor-bar-legend">
            <span><i style={{ background: BADGE_HEX.success }} />En línea</span>
            <span><i style={{ background: BADGE_HEX.warning }} />Offline leve/medio</span>
            <span><i style={{ background: BADGE_HEX.danger }} />Offline grave/apagado</span>
            <span><i style={{ background: BADGE_HEX.secondary }} />Sin dato</span>
          </div>
          <BarraOperadores filas={porKal} />
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
  const { visibles, pagina, totalPaginas, setPagina } = usePaginacion(filtrados, 50);

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
        <div className="tarjeta">
          <p className="rotulo">Total registros MSSQL</p>
          <p className="valor">{formatearValor(filtrados.length, "count")}</p>
          {filtrados.length !== mtt.length && <p className="otm-sub">de {mtt.length} totales</p>}
        </div>
        <div className="tarjeta otm-ok"><p className="rotulo">Taps recientes (&lt;24hs)</p><p className="valor">{formatearValor(recientes, "count")}</p></div>
        <div className="tarjeta"><p className="rotulo">Versión app predominante</p><p className="valor" style={{ fontSize: 26 }}>{versionPredominante}</p></div>
      </div>
      <div className="tabla-envoltorio">
        <table>
          <thead>
            <tr>
              <th>Base</th><th>Interno</th><th>Último tap</th><th>Último KAL</th><th>Estado KAL</th>
              <th>Serial</th><th>SAM UID</th><th>Company</th><th>Línea</th><th>App version</th><th>Dominio</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((r, i) => (
              <tr key={`${r.serial_number}-${i}`}>
                <td>{r.base_datos_mssql}</td>
                <td>{r.interno}</td>
                <td>{formatFecha(r.ultimo_tap)}</td>
                <td>{formatFecha(r.fecha_kal)}</td>
                <td><Badge texto={r.estado_kal} color={r.badge_color_kal} titulo={r.diagnostico_kal} /></td>
                <td>{r.serial_number}</td>
                <td>{r.sam_uid}</td>
                <td>{r.id_company}</td>
                <td>{r.linea_mtt}</td>
                <td>{r.app_version}</td>
                <td>{r.dominio}</td>
              </tr>
            ))}
            {visibles.length === 0 && <tr><td colSpan={11} className="vacio">Sin resultados para estos filtros.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager pagina={pagina} totalPaginas={totalPaginas} total={filtrados.length} onPagina={setPagina} />
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

function TablaModem({ filas }: { filas: Dispositivo[] }) {
  return (
    <table>
      <thead>
        <tr><th>Serial</th><th>Terminal</th><th>Línea</th><th>Operador</th><th>Estado KAL</th><th>Fallas</th><th>Último dato</th><th>IP</th><th>Tecnología</th><th>dBm</th><th>IMEI</th></tr>
      </thead>
      <tbody>
        {filas.map((d) => (
          <tr key={d.serial}>
            <td>{d.serial}</td><td>{d.terminal_id}</td><td>{d.linea}</td><td>{d.operador}</td>
            <td><Badge texto={d.estado_kal} color={d.badge_color} titulo={d.diagnostico} /></td>
            <td>{d.fallas}</td><td>{formatFecha(d.time_stamp)}</td><td>{d.ip}</td><td>{d.tecnologia}</td>
            <td>{d.dbm}</td><td>{d.imei}</td>
          </tr>
        ))}
        {filas.length === 0 && <tr><td colSpan={11} className="vacio">Sin resultados para estos filtros.</td></tr>}
      </tbody>
    </table>
  );
}

function TablaGps({ filas }: { filas: Dispositivo[] }) {
  return (
    <table>
      <thead><tr><th>Serial</th><th>Terminal</th><th>Línea</th><th>GPS OK</th><th>Lat</th><th>Lon</th><th>Velocidad</th><th>Satélites</th><th>Fix</th></tr></thead>
      <tbody>
        {filas.map((d) => (
          <tr key={d.serial}>
            <td>{d.serial}</td><td>{d.terminal_id}</td><td>{d.linea}</td><td>{d.gps_ok}</td>
            <td>{d.lat.toFixed(5)}</td><td>{d.lon.toFixed(5)}</td><td>{d.speed}</td><td>{d.satellites}</td><td>{d.fix_type}</td>
          </tr>
        ))}
        {filas.length === 0 && <tr><td colSpan={9} className="vacio">Sin resultados para estos filtros.</td></tr>}
      </tbody>
    </table>
  );
}

function TablaEmv({ filas }: { filas: Dispositivo[] }) {
  return (
    <table>
      <thead><tr><th>Serial</th><th>Terminal</th><th>Línea</th><th>vlib</th><th>SAM</th><th>PSP</th><th>SAM server</th><th>Estado KAL</th></tr></thead>
      <tbody>
        {filas.map((d) => (
          <tr key={d.serial}>
            <td>{d.serial}</td><td>{d.terminal_id}</td><td>{d.linea}</td><td>{d.vlib_version}</td><td>{d.sam_version}</td>
            <td className={d.psp_ok === "OK" ? "pct-pos" : "pct-neg"}>{d.psp_ok}</td>
            <td className={d.sam_server_ok === "OK" ? "pct-pos" : "pct-neg"}>{d.sam_server_ok}</td>
            <td><Badge texto={d.estado_kal} color={d.badge_color} titulo={d.diagnostico} /></td>
          </tr>
        ))}
        {filas.length === 0 && <tr><td colSpan={8} className="vacio">Sin resultados para estos filtros.</td></tr>}
      </tbody>
    </table>
  );
}

function TablaSistema({ filas }: { filas: Dispositivo[] }) {
  return (
    <table>
      <thead><tr><th>Serial</th><th>Terminal</th><th>Línea</th><th>Versión</th><th>CPU</th><th>RAM</th><th>Storage libre</th><th>Uptime</th><th>Estado KAL</th></tr></thead>
      <tbody>
        {filas.map((d) => (
          <tr key={d.serial}>
            <td>{d.serial}</td><td>{d.terminal_id}</td><td>{d.linea}</td><td>{d.version}</td>
            <td>{d.cpu}%</td><td>{d.ram}%</td><td>{d.storage_free_mb} MB</td><td>{d.uptime_hs.toFixed(1)} hs</td>
            <td><Badge texto={d.estado_kal} color={d.badge_color} titulo={d.diagnostico} /></td>
          </tr>
        ))}
        {filas.length === 0 && <tr><td colSpan={9} className="vacio">Sin resultados para estos filtros.</td></tr>}
      </tbody>
    </table>
  );
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
  const { visibles, pagina, totalPaginas, setPagina } = usePaginacion(filtrados, 50);

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
      <div className="tabla-envoltorio">
        {sub === "modem" && <TablaModem filas={visibles} />}
        {sub === "gps" && <TablaGps filas={visibles} />}
        {sub === "emv" && <TablaEmv filas={visibles} />}
        {sub === "sistema" && <TablaSistema filas={visibles} />}
      </div>
      <Pager pagina={pagina} totalPaginas={totalPaginas} total={filtrados.length} onPagina={setPagina} />
    </>
  );
}

// --- Componente principal ---

type Tab = "global" | "mtt" | "mapa" | "explorador";

export function OTMonitorCenter({ initial }: { initial: OTMonitorResult }) {
  const [result, setResult] = useState(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [auto, setAuto] = useState(true);
  const [tab, setTab] = useState<Tab>("global");
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
            <button type="button" className={tab === "global" ? "active" : ""} onClick={() => setTab("global")}>Indicadores globales</button>
            <button type="button" className={tab === "mtt" ? "active" : ""} onClick={() => setTab("mtt")}>Operaciones MTT</button>
            <button type="button" className={tab === "mapa" ? "active" : ""} onClick={() => setTab("mapa")}>Mapa GIS</button>
            <button type="button" className={tab === "explorador" ? "active" : ""} onClick={() => setTab("explorador")}>Explorador</button>
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
