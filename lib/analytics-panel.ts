/**
 * Soporte del panel general: lo que hace falta para mostrar TODAS las fuentes
 * de un dashboard a la vez y para filtrarlas juntas por empresa.
 *
 * El problema que resuelve el "ámbito": una misma empresa aparece con dos
 * vocabularios distintos según de qué insumo salió la fuente. El informe de
 * negocio la llama `tenant` = "ATLANTIDA"; las consultas que van contra las
 * bases la llaman `empresa`/`base` = "pms-atlantida-hml". Son la misma
 * empresa, así que si cada fuente se filtra sólo por su propio nombre de
 * campo, elegir una empresa en una grilla no filtra las demás y la pantalla
 * deja de ser un tablero: pasa a ser doce tablas sueltas. Acá se normalizan
 * los tres vocabularios a un único valor ("ATLANTIDA") para poder recortar
 * las doce fuentes con una sola elección.
 */

import { expandRows, groupRows, metricValue, type Dataset, type Metric, type Row } from "./analytics";
import {
  DAY, boundary, delta, modeOf, previousPeriod, selectPeriod, series,
  type Period, type Point,
} from "./control-math";

// Orden de preferencia: si una fuente trae varias, `tenant` es el nombre de
// negocio (el que la gente usa al hablar), no el nombre técnico de la base.
const DIMENSIONES_AMBITO = ["tenant", "empresa", "base"];

/** "pms-atlantida-hml" y "ATLANTIDA" son la misma empresa. */
export function normalizarAmbito(valor: string): string {
  const limpio = valor.trim();
  const base = /^pms-(.+)-hml$/i.exec(limpio);
  return (base ? base[1] : limpio).toUpperCase();
}

export function dimensionAmbito(d: Dataset): string | null {
  return DIMENSIONES_AMBITO.find((k) => d.dimensions.includes(k)) ?? null;
}

export function listarAmbitos(datasets: Dataset[]): string[] {
  const vistos = new Set<string>();
  for (const d of datasets) {
    const dim = dimensionAmbito(d);
    if (!dim) continue;
    const i = d.columns.indexOf(dim);
    for (const fila of d.rows) {
      const valor = fila[i];
      if (valor !== null && valor !== undefined && String(valor).trim() !== "") {
        vistos.add(normalizarAmbito(String(valor)));
      }
    }
  }
  return [...vistos].sort();
}

/**
 * Devuelve la fuente recortada a una empresa. Se recorta el dataset entero (no
 * sólo la vista) para que todo lo que cuelga de él —tarjetas, evolución,
 * distribución, tabla y CSV— quede consistente sin tocar cada consumidor.
 * Una fuente sin dimensión de empresa se devuelve tal cual: es un total que no
 * se puede desglosar, y ocultarlo sería peor que mostrarlo aclarado.
 */
export function recortarPorAmbito(d: Dataset, ambito: string): Dataset {
  if (!ambito) return d;
  const dim = dimensionAmbito(d);
  if (!dim) return d;
  const i = d.columns.indexOf(dim);
  return { ...d, rows: d.rows.filter((fila) => normalizarAmbito(String(fila[i])) === ambito) };
}

export type PeriodoTarjeta = { periodo: Period; horario: boolean; rotulo: string };

const DIAS_TARJETA = 7;

/**
 * Qué período resume la tarjeta de una fuente.
 *
 * Una foto (`snapshot`) describe el estado de ahora, no una serie: sumar siete
 * fotos contaría siete veces lo mismo, así que se queda con el último día
 * observado. Un histórico suma los últimos siete días CON DATOS, no los siete
 * días de calendario: hay fuentes que traen un solo día (el histórico horario
 * de referencia) y una ventana de calendario les dibujaba seis huecos y un
 * punto suelto, que se lee como una fuente rota en vez de como una fuente con
 * un día cargado.
 */
export function periodoTarjeta(d: Dataset, filas: Row[]): PeriodoTarjeta {
  const fechas = filas.map((r) => String(r.fecha)).sort();
  const ultima = fechas[fechas.length - 1] ?? "";
  if (!ultima) return { periodo: { from: "", to: "" }, horario: false, rotulo: "Sin datos" };
  const dias = [...new Set(fechas.map((f) => f.slice(0, 10)))].sort();
  const hasta = dias[dias.length - 1];
  const esFoto = modeOf(d) === "snapshot";
  const desde = esFoto ? hasta : dias.slice(-DIAS_TARJETA)[0];
  const unDia = desde === hasta;
  const conHora = ultima.includes("T");
  const periodo = conHora
    ? { from: `${desde}T00:00`, to: `${hasta}T23:59` }
    : { from: desde, to: hasta };
  const rotulo = esFoto
    ? `Último día observado: ${hasta}`
    : unDia
      ? `Único día con datos: ${hasta}`
      : `${desde} → ${hasta} · ${dias.slice(-DIAS_TARJETA).length} días con datos`;
  // Con un solo día y fechas con hora, la curva se dibuja por hora: así una
  // fuente horaria muestra su forma del día en vez de un único punto.
  return { periodo, horario: conHora && unDia, rotulo };
}

export type Parte = { label: string; share: number };

export type ResumenFuente = {
  metric: Metric;
  total: number | null;
  /** null cuando comparar no tendría sentido (fotos). */
  cambio: { value: number | null; label: string } | null;
  puntos: Point[];
  periodo: Period;
  rotuloPeriodo: string;
  filas: number;
  dias: number;
  /** Hay filas en la fuente (antes de mirar el período). */
  conDatos: boolean;
  /** Por qué está cortada la fuente, si corta el total por algo además de la empresa. */
  desglose: string | null;
  /** Reparto entre las categorías del desglose; null si no hay uno legible. */
  reparto: { metric: Metric; partes: Parte[] } | null;
};

const MAX_PARTES = 3;

/**
 * Titular de una fuente: su primera métrica sobre el período de la tarjeta.
 *
 * Varias fuentes del informe de tránsito cortan LA MISMA plata por criterios
 * distintos (marca de tarjeta, medio de pago, estado), así que su titular es
 * el mismo número repetido y el panel parecía estar fallado. Por eso cada
 * fuente declara acá por qué está cortada y cómo se reparte: cuatro veces el
 * mismo total con tres composiciones distintas se entiende; cuatro veces el
 * mismo número solo, no.
 */
export function resumenFuente(d: Dataset): ResumenFuente {
  const filas = expandRows(d);
  const { periodo, horario, rotulo } = periodoTarjeta(d, filas);
  const metric = d.metrics[0];
  const enPeriodo = selectPeriod(filas, periodo);
  const total = metricValue(enPeriodo, metric);
  const dias = new Set(enPeriodo.map((r) => String(r.fecha).slice(0, 10))).size;
  const diasDelPeriodo = periodo.from
    ? Math.max(1, Math.round((boundary(periodo.to, true) + 1 - boundary(periodo.from)) / DAY))
    : 0;
  // Comparar exige una serie continua. El histórico horario de referencia trae
  // siete días sueltos repartidos en seis semanas: medirlo contra "la ventana
  // anterior de calendario" (que está casi vacía) daba un +684% inventado.
  const contiguo = dias >= diasDelPeriodo;
  const comparable = modeOf(d) !== "snapshot" && periodo.from !== "";
  const previo = comparable && contiguo ? selectPeriod(filas, previousPeriod(periodo)) : null;
  const desglose = dimensionDesglose(d);
  return {
    metric,
    total,
    cambio: previo
      ? delta(total, metricValue(previo, metric), metric.format === "percent")
      : comparable && !contiguo
        ? { value: null, label: `Días sueltos (${dias} de ${diasDelPeriodo}): no se compara` }
        : null,
    // Sin los huecos: en 34 píxeles un punto aislado entre nulos es invisible y
    // la fuente parece vacía. La curva de la tarjeta muestra la forma de los
    // días que trajeron datos; los huecos reales se ven en el detalle, que sí
    // tiene eje de tiempo y los rotula.
    puntos: series(enPeriodo, periodo, metric, horario).filter((p) => p.value !== null),
    periodo,
    rotuloPeriodo: rotulo,
    filas: enPeriodo.length,
    dias,
    conDatos: filas.length > 0,
    desglose,
    reparto: desglose ? composicion(enPeriodo, desglose, d.metrics) : null,
  };
}

/** La dimensión por la que la fuente corta el total, además de la empresa. */
export function dimensionDesglose(d: Dataset): string | null {
  const ambito = dimensionAmbito(d);
  // `tipo_estado` no corta nada: hay una fuente por tipo y siempre trae un
  // solo valor, que además ya está en el título.
  return d.dimensions.find((k) => k !== ambito && k !== "tipo_estado") ?? null;
}

const ES_CODIGO = /^-?\d+([.,]\d+)?$/;
// Una categoría que se lleva casi todo no describe un reparto: o la métrica
// elegida sólo existe para esa categoría (el "sin cobrar" de PRESENTACION vive
// entero en UNPAID) o no hay nada que mostrar.
const SHARE_DEGENERADO = 99;

/**
 * Cómo se reparte el total entre las categorías del desglose.
 *
 * Se prueba métrica por métrica en el orden que las declara la fuente y se usa
 * la primera que efectivamente reparta: así PRESENTACION muestra el reparto de
 * su monto (PAID / UNPAID / ZERO) en vez de un "UNPAID 100%" que no informa
 * nada, sin dejar de titular con lo que importa, que es lo que no se cobró.
 *
 * Devuelve null cuando las categorías son códigos ("estado 0", "ativo 2"): un
 * "0 · 54%" en una tarjeta no le dice nada a nadie, y qué significa cada código
 * está en la descripción de la fuente, no en un rótulo de un caracter.
 */
export function composicion(filas: Row[], dimension: string, metrics: Metric[]): { metric: Metric; partes: Parte[] } | null {
  const valores = [...new Set(filas.map((r) => String(r[dimension] ?? "")))];
  if (valores.length < 2 || valores.some((v) => ES_CODIGO.test(v.trim()))) return null;
  for (const metric of metrics) {
    // Las razones y los porcentajes no se reparten: sumar tasas no da el total.
    if (metric.format === "percent" || metric.denominator) continue;
    const grupos = groupRows(filas, dimension, metric)
      .filter((g): g is { label: string; value: number; count: number } => typeof g.value === "number")
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    const suma = grupos.reduce((n, g) => n + Math.abs(g.value), 0);
    if (!suma || grupos.length < 2) continue;
    const partes = grupos.slice(0, MAX_PARTES).map((g) => ({ label: g.label, share: (Math.abs(g.value) / suma) * 100 }));
    if (partes[0].share < SHARE_DEGENERADO) return { metric, partes };
  }
  return null;
}
