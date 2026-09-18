import type { Formato } from "@/lib/dashboard-shape";

const formatoMoneda = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

const formatoNumero = new Intl.NumberFormat("es-AR");

export function formatearValor(valor: unknown, formato: Formato): string {
  if (valor === null || valor === undefined || valor === "") return "—";

  if (formato === "money_cents" && typeof valor === "number") {
    return formatoMoneda.format(valor / 100);
  }
  // Una variación lleva signo ("+5,1% vs. ayer"); una tasa no ("3,1% sin cobrar").
  if (formato === "variation" && typeof valor === "number") {
    const signo = valor > 0 ? "+" : "";
    return `${signo}${valor.toFixed(1)}%`;
  }
  if (formato === "percent" && typeof valor === "number") {
    return `${valor.toFixed(2)}%`;
  }
  if (formato === "count" && typeof valor === "number") {
    return formatoNumero.format(valor);
  }
  return String(valor);
}

/**
 * "2026-09-17T08:35:31.929627-03:00" -> "2026-09-17 08:35".
 * Los microsegundos y el offset son ruido en pantalla: nadie lee la corrida al
 * microsegundo y el offset ya es el de Argentina en todas estas fuentes.
 */
export function fechaHoraCorta(valor: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(valor.trim());
  return m ? `${m[1]} ${m[2]}` : valor;
}
