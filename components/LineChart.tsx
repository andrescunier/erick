"use client";
import { useId, useState } from "react";
import { formatearValor } from "@/lib/format";
import type { Formato } from "@/lib/dashboard-shape";
import type { Point } from "@/lib/control-math";

export type Line = { name: string; points: Point[]; color: string; dashed?: boolean };
export function LineChart({ lines, format, compact = false }: { lines: Line[]; format: Formato; compact?: boolean }) {
  const id = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const count = Math.max(1, ...lines.map(l => l.points.length));
  const values = lines.flatMap(l => l.points.map(p => p.value)).filter((n): n is number => n !== null);
  const min = Math.min(0, ...values), max = Math.max(1, ...values);
  const left = compact ? 4 : 94, width = compact ? 292 : 700, bottom = compact ? 72 : 232, height = compact ? 64 : 196;
  const x = (i: number) => left + i / Math.max(1, count - 1) * width;
  const y = (v: number) => bottom - (v - min) / (max - min) * height;
  function paths(points: Point[]) {
    const segments: string[] = []; let path = "";
    points.forEach((p, i) => {
      if (p.value === null) { if (path) segments.push(path); path = ""; }
      else path += `${path ? " L" : "M"}${x(i)},${y(p.value)}`;
    });
    if (path) segments.push(path);
    return segments;
  }
  return <div className={compact ? "sparkline" : "control-linechart"}>
    <svg viewBox={compact ? "0 0 300 80" : "0 0 820 285"} role="img" aria-label={lines.map(l => l.name).join(" frente a ")}>
      {!compact && [0, .25, .5, .75, 1].map(r => <g key={r}><line x1={left} x2={left + width} y1={y(min + (max - min) * r)} y2={y(min + (max - min) * r)} stroke="var(--chart-grid, #e5eaf1)" strokeDasharray="3 5" /><text x={left - 12} y={y(min + (max - min) * r) + 4} textAnchor="end">{formatearValor(min + (max - min) * r, format)}</text></g>)}
      {lines.map((l, n) => <g key={l.name}>
        <defs><linearGradient id={`${id}-${n}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={l.color} stopOpacity=".18" /><stop offset="100%" stopColor={l.color} stopOpacity="0" /></linearGradient></defs>
        {paths(l.points).map((path, i) => <path key={i} d={path} stroke={l.color} strokeWidth={compact ? 2 : 3} fill="none" strokeDasharray={l.dashed ? "7 6" : undefined} strokeLinecap="round" strokeLinejoin="round" />)}
        {l.points.map((p, i) => p.value === null ? null : <circle key={p.label} cx={x(i)} cy={y(p.value)} r={compact ? 1.6 : hover === i ? 5 : 3} fill={l.color} tabIndex={compact ? undefined : 0} onFocus={() => setHover(i)} onMouseEnter={() => setHover(i)} aria-label={`${l.name}, ${p.label}: ${formatearValor(p.value, format)}`}>
          <title>{`${l.name} · ${p.label} · ${formatearValor(p.value, format)}`}</title></circle>)}
      </g>)}
      {!compact && <>
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1="24" y2={bottom} stroke="#a9b5c7" strokeDasharray="4 4" />}
        <text x={left} y="266">{lines[0]?.points[0]?.label.replace("T", " ")}</text><text x={left + width} y="266" textAnchor="end">{lines[0]?.points.at(-1)?.label.replace("T", " ")}</text>
      </>}
    </svg>
    {!compact && <><div className="chart-legend">{lines.map(l => <span key={l.name}><i style={{ background: l.color }} />{l.name}</span>)}</div>
      <div className="chart-readout" aria-live="polite">{hover === null ? "Recorré los puntos para ver valores. Los huecos indican datos ausentes." : lines.map(l => `${l.name}: ${l.points[hover]?.label ?? "—"} · ${formatearValor(l.points[hover]?.value, format)}`).join("  /  ")}</div></>}
  </div>;
}
