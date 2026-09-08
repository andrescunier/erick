import type { Formato } from "./dashboard-shape";

export type Metric = { key: string; label: string; format: Formato; denominator?: string; scale?: number };
export type Dataset = {
  id: string; title: string; description: string; source: string; updatedAt: string;
  mode?: "history" | "snapshot" | "events";
  cadenceMinutes?: number;
  columns: string[]; dimensions: string[]; metrics: Metric[];
  rows: (string | number | null)[][];
};
export type Analytics = { version: 1; title?: string; notice?: string; datasets: Dataset[]; warnings: string[] };
export type Row = Record<string, string | number | null>;

export function timeValue(value: string): number {
  // Sin zona explícita, conservar la hora de origen sobre un eje neutral.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return Date.parse(`${value}T00:00:00Z`);
  return Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}Z`);
}

export function isAnalytics(value: unknown): value is Analytics {
  if (!value || typeof value !== "object") return false;
  const a = value as Analytics;
  return a.version === 1 && (a.title === undefined || typeof a.title === "string") &&
    (a.notice === undefined || typeof a.notice === "string") &&
    Array.isArray(a.warnings) && a.warnings.every(w => typeof w === "string") &&
    Array.isArray(a.datasets) && a.datasets.every(d => d &&
      [d.id, d.title, d.description, d.source, d.updatedAt].every(v => typeof v === "string") &&
      (d.mode === undefined || ["history", "snapshot", "events"].includes(d.mode)) &&
      (d.cadenceMinutes === undefined || (Number.isFinite(d.cadenceMinutes) && d.cadenceMinutes > 0)) &&
      Array.isArray(d.columns) && d.columns.includes("fecha") && d.columns.every(c => typeof c === "string") &&
      Array.isArray(d.dimensions) && d.dimensions.every(c => d.columns.includes(c)) &&
      Array.isArray(d.metrics) && d.metrics.length > 0 && d.metrics.every(m => m &&
        typeof m.label === "string" && d.columns.includes(m.key) &&
        ["money_cents", "count", "percent", "variation"].includes(m.format) &&
        (!m.denominator || d.columns.includes(m.denominator)) &&
        (m.scale === undefined || Number.isFinite(m.scale))) &&
      Array.isArray(d.rows) && d.rows.every(r => Array.isArray(r) && r.length === d.columns.length &&
        typeof r[d.columns.indexOf("fecha")] === "string" && Number.isFinite(timeValue(String(r[d.columns.indexOf("fecha")])) ) &&
        r.every(v => v === null || typeof v === "string" || (typeof v === "number" && Number.isFinite(v)))));
}

export function expandRows(d: Dataset): Row[] {
  return d.rows.map(r => Object.fromEntries(d.columns.map((c, i) => [c, r[i]])));
}

export function filterRows(rows: Row[], from: string, to: string, filters: Record<string, string>): Row[] {
  return rows.filter(r => (!from || String(r.fecha).slice(0, 10) >= from) &&
    (!to || String(r.fecha).slice(0, 10) <= to) &&
    Object.entries(filters).every(([k, v]) => !v || String(r[k]) === v));
}

export function metricValue(rows: Row[], metric: Metric): number | null {
  const valid = rows.filter(r => typeof r[metric.key] === "number" &&
    (!metric.denominator || typeof r[metric.denominator] === "number"));
  if (!valid.length) return null;
  const total = valid.reduce((n, r) => n + Number(r[metric.key]), 0);
  if (!metric.denominator) return total;
  const denominator = valid.reduce((n, r) => n + Number(r[metric.denominator!]), 0);
  return denominator ? total / denominator * (metric.scale ?? 1) : null;
}

export function groupRows(rows: Row[], key: string, metric: Metric): { label: string; value: number | null; count: number }[] {
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const label = String(r[key] ?? "Sin dato");
    const group = groups.get(label) ?? [];
    group.push(r); groups.set(label, group);
  }
  return [...groups].map(([label, group]) => ({ label, value: metricValue(group, metric), count: group.length }));
}
