/**
 * Lee los datos de OT Monitor (flota de validadores de colectivos) que
 * publica el proyecto "leandro" en el dashboard store genérico. Este
 * proyecto (erick) sólo los muestra: el pipeline que arma y publica el JSON
 * vive en otro repo y no se toca acá.
 *
 * El tipo de campos usa snake_case porque así llega el JSON ya generado
 * (no lo elegimos nosotros). `senal_promedio_dbm` es ASCII a propósito
 * (sin eñe): el pipeline evita caracteres no ASCII en claves de JSON para
 * no repetir un problema de encoding que tuvo en otro campo similar. El
 * label visible en la UI puede seguir escribiéndose "Señal" normalmente.
 */

import { getDashboard } from "./github-store";
import { puedeVer, type Sesion } from "./session";

export type Dispositivo = {
  serial: string;
  terminal_id: string;
  linea: string;
  operador: string;
  estado_kal: string;
  badge_color: string;
  diagnostico: string;
  minutos_kal: number; // -1 si no hay dato
  estado: "operative" | "error";
  fallas: string; // "Ninguna" o lista separada por ", "
  num_fallas: number;
  version: string;
  ip: string;
  sim_operator: string;
  signal_level: number;
  dbm: number;
  tecnologia: string;
  imei: string;
  ccid: string;
  gps_ok: "Sí" | "No";
  lat: number;
  lon: number;
  speed: number;
  satellites: number;
  fix_type: string;
  vlib_version: string;
  sam_version: string;
  psp_ok: "OK" | "FAIL";
  sam_server_ok: "OK" | "FAIL";
  cpu: number;
  ram: number;
  storage_free_mb: number;
  uptime_hs: number;
  pending_tx: number;
  time_stamp: string;
};

export type RegistroMTT = {
  base_datos_mssql: string;
  interno: string;
  ultimo_tap: string;
  serial_number: string;
  sam_uid: string;
  id_company: string;
  linea_mtt: string;
  app_version: string;
  dominio: string;
  fecha_kal: string;
  estado_kal: string;
  badge_color_kal: string;
  diagnostico_kal: string;
};

export type OTMonitorKpis = {
  total_monitoreados: number;
  en_linea: number;
  en_linea_pct: number;
  offline_medio: number;
  offline_grave: number;
  con_fallas_hw: number;
  con_fallas_hw_pct: number;
  senal_promedio_dbm: number;
};

export type OTMonitorData = {
  generado_en: string; // ISO datetime
  kpis: OTMonitorKpis;
  dispositivos: Dispositivo[];
  mtt: RegistroMTT[];
};

export type OTMonitorResult = { data: OTMonitorData | null; error: string | null };

// Paleta de la herramienta NOC original que esta pantalla reemplaza — se
// mantiene igual para no romper la asociación color→severidad que ya conoce
// quien la usaba. Compartida entre OTMonitorCenter (badges, gráficos) y
// OTMonitorMap (marcadores) para no repetir los hex en dos archivos.
export const BADGE_HEX: Record<string, string> = {
  success: "#238636",
  "success-light": "#2ea043",
  warning: "#d97706",
  orange: "#f97316",
  danger: "#da3633",
  secondary: "#6e7681",
};

const USUARIO = "leandro";
const PROYECTO = "otmonitor";

// No reimplementamos un validador de esquema completo: sólo lo mínimo para
// no romper el render si el pipeline publica algo con forma inesperada.
function esOTMonitorData(value: unknown): value is OTMonitorData {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.generado_en === "string" &&
    Array.isArray(v.dispositivos) &&
    Array.isArray(v.mtt) &&
    typeof v.kpis === "object" &&
    v.kpis !== null
  );
}

export async function readOTMonitor(session: Sesion): Promise<OTMonitorResult> {
  if (!puedeVer(session, USUARIO, PROYECTO)) {
    return { data: null, error: "No tenés acceso a este tablero." };
  }
  try {
    const raw = await getDashboard(USUARIO, PROYECTO);
    if (!raw) return { data: null, error: "Todavía no hay datos publicados para este tablero." };
    if (!esOTMonitorData(raw)) {
      return { data: null, error: "El dato publicado no tiene el formato esperado." };
    }
    return { data: raw, error: null };
  } catch {
    return {
      data: null,
      error: "No se pudo leer la fuente de datos. Se puede reintentar sin perder lo último mostrado.",
    };
  }
}
