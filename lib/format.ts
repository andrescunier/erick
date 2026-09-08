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
  if (formato === "percent" && typeof valor === "number") {
    const signo = valor > 0 ? "+" : "";
    return `${signo}${valor.toFixed(1)}%`;
  }
  if (formato === "count" && typeof valor === "number") {
    return formatoNumero.format(valor);
  }
  return String(valor);
}
