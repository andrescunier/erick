import { expandRows, metricValue, timeValue, type Dataset, type Metric, type Row } from "./analytics";

export type Period = { from: string; to: string };
export type Point = { label: string; value: number | null; coverage: number };
export const DAY = 86400000;
export const HOUR = 3600000;

export function boundary(value: string, end = false): number {
  return timeValue(value) + (end ? (value.length === 10 ? DAY : 60000) - 1 : 0);
}

export function previousPeriod(period: Period, offsetDays?: number): Period {
  const start = boundary(period.from), end = boundary(period.to, true);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return { from: "", to: "" };
  const shift = offsetDays ? offsetDays * DAY : end - start + 1;
  const length = period.from.length === 10 ? 10 : 16;
  return { from: new Date(start - shift).toISOString().slice(0, length), to: new Date(end - shift).toISOString().slice(0, length) };
}

export function selectPeriod(rows: Row[], period: Period, filters: Record<string, string> = {}): Row[] {
  const from = boundary(period.from), to = boundary(period.to, true);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) return [];
  return rows.filter(r => {
    const t = timeValue(String(r.fecha));
    return t >= from && t <= to && Object.entries(filters).every(([k, v]) => !v || String(r[k]) === v);
  });
}

export function delta(current: number | null, previous: number | null, percentage = false): { value: number | null; label: string } {
  if (current === null || previous === null) return { value: null, label: "Sin base comparable" };
  if (percentage) return { value: current - previous, label: "pp" };
  if (previous === 0) return current === 0 ? { value: 0, label: "%" } : { value: null, label: "Base anterior en cero" };
  return { value: (current - previous) / Math.abs(previous) * 100, label: "%" };
}

export function series(rows: Row[], period: Period, metric: Metric, hourly = false): Point[] {
  const step = hourly ? HOUR : DAY;
  const start = Math.floor(boundary(period.from) / step) * step;
  const end = boundary(period.to, true);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
  const groups = new Map<number, Row[]>();
  for (const row of selectPeriod(rows, period)) {
    const key = Math.floor(timeValue(String(row.fecha)) / step) * step;
    const group = groups.get(key) ?? []; group.push(row); groups.set(key, group);
  }
  const result: Point[] = [];
  // Un límite de render no inventa puntos: para rangos grandes usar días.
  for (let t = start; t <= end && result.length < 2000; t += step) {
    const group = groups.get(t) ?? [];
    result.push({ label: new Date(t).toISOString().slice(0, hourly ? 16 : 10), value: metricValue(group, metric), coverage: group.length });
  }
  return result;
}

export function indexed(points: Point[]): Point[] {
  const base = points.find(p => p.value !== null && p.value !== 0)?.value;
  return points.map(p => ({ ...p, value: base && p.value !== null ? p.value / base * 100 : null }));
}

export function modeOf(d: Dataset): "history" | "snapshot" | "events" {
  // Compatibilidad con JSON anteriores; los productores nuevos lo declaran.
  if (d.mode) return d.mode;
  if (d.id === "actividad") return "events";
  if (d.id.startsWith("control_ativo") || d.id.startsWith("operaciones_") || ["tarjetas", "cuentas", "prestamos", "solicitudes_tarjeta", "rechazos"].includes(d.id)) return "snapshot";
  return "history";
}

export function sourceLabel(d: Dataset): string {
  return { history: "Histórico diario", snapshot: "Última foto", events: "Eventos recibidos" }[modeOf(d)];
}

export function sourceAge(value: string, now: number): number | null {
  // updatedAt sin offset en exports Windows está en Argentina.
  const timestamp = Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}-03:00`);
  return Number.isFinite(timestamp) ? Math.max(0, (now - timestamp) / 60000) : null;
}

export function ageLabel(minutes: number | null): string {
  if (minutes === null) return "Fecha desconocida";
  if (minutes < 1) return "hace menos de 1 min";
  if (minutes < 60) return `hace ${Math.floor(minutes)} min`;
  if (minutes < 1440) return `hace ${Math.floor(minutes / 60)} h`;
  return `hace ${Math.floor(minutes / 1440)} días`;
}

export function defaultPeriod(d: Dataset): Period {
  const dates = expandRows(d).map(r => String(r.fecha)).sort();
  const last = dates.at(-1)?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  const first = dates[0]?.slice(0, 10) ?? last;
  return { from: first > new Date(timeValue(last) - 6 * DAY).toISOString().slice(0, 10) ? first : new Date(timeValue(last) - 6 * DAY).toISOString().slice(0, 10), to: last };
}
