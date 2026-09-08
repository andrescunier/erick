import type { StatCard as StatCardData } from "@/lib/dashboard-shape";
import { formatearValor } from "@/lib/format";

export function StatCard({ stat }: { stat: StatCardData }) {
  return (
    <div className="tarjeta">
      <div className="rotulo">{stat.label}</div>
      <div className="valor">{formatearValor(stat.valor, stat.formato)}</div>
      {stat.cobertura && <div className="muted">{stat.cobertura}</div>}
      {stat.delta !== null && (
        <div className={stat.delta >= 0 ? "delta delta-pos" : "delta delta-neg"}>
          <span className="delta-flecha">{stat.delta >= 0 ? "▲" : "▼"}</span>
          {formatearValor(Math.abs(stat.delta), "percent").replace("+", "")} vs. ventana anterior
        </div>
      )}
    </div>
  );
}
