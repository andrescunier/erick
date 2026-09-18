"use client";

/**
 * Envoltorio genérico para un gráfico de Chart.js, con el mismo patrón que
 * ya usa el mapa de Leaflet (OTMonitorMap): un elemento con useRef y la
 * instancia de la librería se crea/destruye en useEffect.
 *
 * A diferencia de Leaflet, Chart.js NO toca `window`/`document` al
 * importarse (sólo cuando se instancia un gráfico contra un <canvas> real,
 * que ya pasa dentro de useEffect, después del mount). Por eso el import
 * estático de "chart.js/auto" de más abajo es seguro durante el render en
 * el servidor (Next igual ejecuta este archivo en el server porque es un
 * client component sin `dynamic(..., { ssr:false })`) y no hace falta
 * repetir acá la gimnasia de import dinámico que sí necesita el mapa.
 *
 * "chart.js/auto" registra automáticamente todos los tipos de gráfico
 * (bar, line, doughnut, pie, escalas, tooltips, leyenda) — el bundle es un
 * poco más grande que registrar sólo lo necesario, pero esta pantalla usa
 * los cuatro tipos así que no hay ahorro real en ser más selectivo.
 */

import { useEffect, useRef } from "react";
import Chart from "chart.js/auto";
import type { ChartConfiguration } from "chart.js";

export function ChartCanvas({ config, alto = 270 }: { config: ChartConfiguration; alto?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    chartRef.current = new Chart(canvasRef.current, config);
    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
    // `config` ya llega memoizado (useMemo) desde quien nos llama: sólo
    // queremos destruir y recrear el gráfico cuando los datos filtrados
    // realmente cambian, no en cada re-render del padre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  return (
    <div className="otmonitor-chart-canvas" style={{ height: alto }}>
      <canvas ref={canvasRef} />
    </div>
  );
}
