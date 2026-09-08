/**
 * Heurísticas para que el dashboard se arme solo a partir de la forma del
 * JSON que llegó por API, sin esquema fijo. No es magia: son reglas simples
 * (nombre de campo, tipo de valor, algunas palabras clave de negocio) que
 * alcanzan para lo que hoy manda opentransit y para cualquier otro proyecto
 * con una forma parecida (colección de registros con métricas). Si el JSON
 * no calza con estas reglas, igual se ve completo gracias al fallback de
 * `resto` (JSON crudo).
 */

export type Formato = "money_cents" | "percent" | "variation" | "count" | "text";

export type Columna = {
  key: string;
  label: string;
  formato: Formato;
};

export type ColumnaVentana = {
  label: string; // p.ej. "Var 1d"
  ventanaKey: string; // p.ej. "1d"
  campoOrigen: string; // p.ej. "comparison_windows"
};

export type StatCard = {
  label: string;
  valor: number;
  formato: Formato;
  delta: number | null; // % vs. la ventana de comparación más reciente, si se pudo inferir
};

export type FormaDetectada = {
  titulo: string | null;
  meta: [string, string | number | boolean][];
  registros: Record<string, unknown>[] | null;
  columnas: Columna[];
  columnasVentana: ColumnaVentana[];
  campoDestacado: string | null; // columna que se usa para la barra inline de la tabla
  stats: StatCard[];
  procedencia: [string, string][] | null; // de dónde salió el dato, si el JSON lo declara
  resto: Record<string, unknown>;
};

// Un campo de primer nivel con este nombre no es un dato: es la ficha de
// procedencia del dashboard (de qué sistema, qué archivo y qué corrida salió
// lo que se está mostrando). Se renderiza aparte, no como métrica.
const CLAVE_PROCEDENCIA = /^_?(procedencia|fuente|origen|source|lineage)$/i;

function esEscalar(v: unknown): v is string | number | boolean {
  return typeof v === "string" || typeof v === "number" || typeof v === "boolean";
}

function esObjetoPlano(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function pareceMapaDeVentanas(v: unknown): v is Record<string, Record<string, unknown>> {
  if (!esObjetoPlano(v)) return false;
  const entradas = Object.entries(v);
  if (entradas.length === 0) return false;
  return entradas.every(
    ([, val]) =>
      esObjetoPlano(val) &&
      Object.entries(val).some(([k, x]) => typeof x === "number" && /pct|percent|variation/i.test(k))
  );
}

function formatoDeCampo(key: string): Formato {
  if (/_cents$/i.test(key)) return "money_cents";
  if (/variation|_var_|^var_/i.test(key)) return "variation";
  if (/pct|percent/i.test(key)) return "percent";
  return "count";
}

function labelDeCampo(key: string): string {
  return key
    .replace(/_cents$/i, "")
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}

export function encontrarPctEnVentana(ventana: Record<string, unknown>): number | null {
  for (const [k, v] of Object.entries(ventana)) {
    if (typeof v === "number" && /pct|percent|variation/i.test(k)) return v;
  }
  return null;
}

// Orden de relevancia de negocio: más bajo = más importante. Es una lista de
// palabras clave, no una lista de campos — así sirve para opentransit y para
// cualquier otro dashboard que use vocabulario parecido (plata, taps,
// validadores, tarjetas), sin acoplarse a nombres exactos de campo.
const PRIORIDAD_PALABRAS: RegExp[] = [
  /money|amount|revenue|processed|ingreso|monto/i,
  /^tap|_tap|transaction/i,
  /validator|validador/i,
  /card|tarjeta|unique/i,
];

function prioridadColumna(col: Columna): number {
  const k = col.key.toLowerCase();
  if (/_ts$|timestamp/.test(k)) return 90; // redundante con la fecha, casi al final
  const idx = PRIORIDAD_PALABRAS.findIndex((re) => re.test(k));
  if (idx !== -1) return idx;
  if (col.formato === "text") return 10;
  return 20;
}

function tokenBase(key: string): string {
  return key.split("_")[0].toLowerCase();
}

function calcularDeltaStat(
  registros: Record<string, unknown>[],
  columnKey: string,
  campoOrigenVentana: string | undefined,
  ventanaKey: string | undefined
): number | null {
  if (!campoOrigenVentana || !ventanaKey) return null;
  const base = tokenBase(columnKey);
  let sumaActual = 0;
  let sumaPrevia = 0;
  let encontrado = false;

  for (const r of registros) {
    const mapa = r[campoOrigenVentana] as Record<string, unknown> | undefined;
    const ventana = mapa?.[ventanaKey] as Record<string, unknown> | undefined;
    if (!ventana) continue;
    const campoPrevio = Object.keys(ventana).find(
      (k) => k.toLowerCase().startsWith(base) && /previous/i.test(k)
    );
    if (!campoPrevio) continue;
    const previo = ventana[campoPrevio];
    if (typeof previo !== "number") continue;
    encontrado = true;
    sumaActual += (r[columnKey] as number) ?? 0;
    sumaPrevia += previo;
  }

  if (!encontrado || sumaPrevia === 0) return null;
  return ((sumaActual - sumaPrevia) / sumaPrevia) * 100;
}

export function detectarForma(data: Record<string, unknown>): FormaDetectada {
  const meta: [string, string | number | boolean][] = [];
  const resto: Record<string, unknown> = {};
  let registrosRaw: Record<string, unknown>[] | null = null;
  let campoColeccion: string | null = null;
  let procedencia: [string, string][] | null = null;

  for (const [key, value] of Object.entries(data)) {
    if (CLAVE_PROCEDENCIA.test(key) && esObjetoPlano(value)) {
      procedencia = Object.entries(value)
        .filter(([, v]) => esEscalar(v))
        .map(([k, v]) => [k, String(v)] as [string, string]);
      continue;
    }
    if (registrosRaw === null) {
      if (Array.isArray(value) && value.length > 0 && value.every(esObjetoPlano)) {
        registrosRaw = value as Record<string, unknown>[];
        campoColeccion = key;
        continue;
      }
      if (esObjetoPlano(value)) {
        const entradas = Object.entries(value);
        if (entradas.length > 0 && entradas.every(([, v]) => esObjetoPlano(v))) {
          registrosRaw = entradas.map(([k, v]) => ({ _key: k, ...(v as object) }));
          campoColeccion = key;
          continue;
        }
      }
    }
    if (esEscalar(value)) {
      meta.push([key, value]);
    } else if (key !== campoColeccion) {
      resto[key] = value;
    }
  }

  if (!registrosRaw) {
    return {
      titulo: typeof data.title === "string" ? data.title : null,
      meta,
      registros: null,
      columnas: [],
      columnasVentana: [],
      campoDestacado: null,
      stats: [],
      procedencia,
      resto,
    };
  }

  const labelKey =
    ["tenant", "name", "nombre", "id", "_key"].find((k) =>
      registrosRaw!.some((r) => typeof r[k] === "string")
    ) ?? "_key";

  const clavesVistas = new Set<string>();
  const columnas: Columna[] = [];
  const columnasVentana: ColumnaVentana[] = [];

  for (const registro of registrosRaw) {
    for (const [key, value] of Object.entries(registro)) {
      if (key === labelKey || key === "_key" || clavesVistas.has(key)) continue;
      clavesVistas.add(key);

      if (pareceMapaDeVentanas(value)) {
        for (const ventanaKey of Object.keys(value)) {
          columnasVentana.push({ label: `Var ${ventanaKey}`, ventanaKey, campoOrigen: key });
        }
        continue;
      }
      if (typeof value === "number") {
        columnas.push({ key, label: labelDeCampo(key), formato: formatoDeCampo(key) });
      } else if (typeof value === "string") {
        columnas.push({ key, label: labelDeCampo(key), formato: "text" });
      }
    }
  }

  const columnasOrdenadas = [...columnas].sort(
    (a, b) => prioridadColumna(a) - prioridadColumna(b)
  );
  const columnasLimitadas = columnasOrdenadas.slice(0, 8);
  const ventanasLimitadas = columnasVentana.slice(0, 3);
  const primeraVentana = ventanasLimitadas[0];

  const campoDestacado =
    columnasLimitadas.find((c) => c.formato === "money_cents")?.key ??
    columnasLimitadas.find((c) => c.formato === "count")?.key ??
    null;

  const registros = campoDestacado
    ? [...registrosRaw].sort(
        (a, b) => ((b[campoDestacado] as number) ?? 0) - ((a[campoDestacado] as number) ?? 0)
      )
    : registrosRaw;

  const registrosConLabel = registros.map((r) => ({ ...r, _label: r[labelKey] ?? r._key ?? "—" }));

  const statsFuente = [...columnasLimitadas]
    .filter((c) => c.formato !== "text")
    .sort((a, b) => prioridadColumna(a) - prioridadColumna(b))
    .slice(0, 4);

  const stats: StatCard[] = statsFuente.map((c) => ({
    label: c.label,
    valor: registrosRaw!.reduce((acc, r) => acc + ((r[c.key] as number) ?? 0), 0),
    formato: c.formato,
    delta: calcularDeltaStat(
      registrosRaw!,
      c.key,
      primeraVentana?.campoOrigen,
      primeraVentana?.ventanaKey
    ),
  }));
  stats.push({ label: "Registros", valor: registrosRaw.length, formato: "count", delta: null });

  return {
    titulo: typeof data.title === "string" ? data.title : null,
    meta,
    registros: registrosConLabel,
    columnas: columnasLimitadas,
    columnasVentana: ventanasLimitadas,
    campoDestacado,
    stats,
    procedencia,
    resto,
  };
}
