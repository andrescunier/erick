/**
 * Nombres en castellano para los campos que llegan en los JSON.
 *
 * Los productores (consultas SQL, scripts de opentransit) nombran sus campos
 * en inglés o en portugués porque así se llaman en las bases: `money_processed_cents`,
 * `tap_count`, `ativo`. Prettificar la clave -cambiar guiones bajos por
 * espacios- deja "Money processed" y "Tap count" en pantalla, que es lo que
 * hoy hace incomprensible el tablero para quien no escribió la consulta. Este
 * diccionario traduce lo conocido; lo que no esté acá cae en la
 * prettificación de siempre, así que un campo nuevo se sigue viendo (con su
 * nombre crudo) en vez de desaparecer.
 *
 * Las claves se buscan ya sin el sufijo `_cents` (la moneda la comunica el
 * formato del valor, no el rótulo).
 */

const ETIQUETAS: Record<string, string> = {
  // Informe de negocio de opentransit
  money_processed: "Monto procesado",
  tap_count: "Taps",
  transaction_volume: "Transacciones",
  average_ticket: "Ticket promedio",
  average_transaction: "Transacción promedio",
  validators_active_day: "Validadores activos (día)",
  validators_active_7d: "Validadores activos (7 días)",
  money_per_validator: "Monto por validador",
  month_projection: "Proyección del mes",
  unique_cards: "Tarjetas únicas",
  process_date: "Fecha del dato",
  process_ts: "Procesado el",
  no_cobrado: "No cobrado",
  no_cobrado_pct: "No cobrado",
  validadores_sin_taps_7d: "Validadores sin taps (7 días)",
  viajes_por_tarjeta: "Viajes por tarjeta",
  // Dimensiones: el mismo ente con tres vocabularios (ver lib/analytics-panel.ts)
  tenant: "Empresa",
  empresa: "Empresa (base)",
  base: "Base de datos",
  ativo: "Ativo (1 = cobrado)",
  estado: "Estado",
  tipo_estado: "Tipo de estado",
  marca: "Marca de tarjeta",
  medio_pago: "Medio de pago",
  linea: "Línea",
  // Medidas de las consultas de transporte
  taps: "Taps",
  monto: "Monto",
  cantidad: "Cantidad",
  registros: "Registros",
  sin_importe: "Taps sin importe",
  consultado_en: "Consultado el",
  corte: "Corte horario",
  fecha: "Fecha",
  emisiones: "Emisiones",
  saldo: "Saldo",
};

export function etiquetaDeCampo(key: string): string {
  const base = key.replace(/_cents$/i, "").replace(/^_+/, "");
  return (
    ETIQUETAS[base] ??
    ETIQUETAS[base.toLowerCase()] ??
    base.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
  );
}
