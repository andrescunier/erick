/**
 * Heurísticas para que el dashboard se arme solo a partir de la forma del
 * JSON que llegó por API, sin esquema fijo. No es magia: son reglas simples
 * (nombre de campo, tipo de valor) que alcanzan para lo que hoy manda
 * opentransit y para cualquier otro proyecto con una forma parecida
 * (colección de registros con métricas). Si el JSON no calza con estas
 * reglas, igual se ve completo gracias al fallback de `resto` (JSON crudo).
 */

export type Formato = "money_cents" | "percent" | "count" | "text";

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
};

export type FormaDetectada = {
  titulo: string | null;
  meta: [string, string | number | boolean][];
  registros: Record<string, unknown>[] | null;
  columnas: Columna[];
  columnasVentana: ColumnaVentana[];
  stats: StatCard[];
  resto: Record<string, unknown>;
};

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
  if (/pct|percent|variation/i.test(key)) return "percent";
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

export function detectarForma(data: Record<string, unknown>): FormaDetectada {
  const meta: [string, string | number | boolean][] = [];
  const resto: Record<string, unknown> = {};
  let registrosRaw: Record<string, unknown>[] | null = null;
  let campoColeccion: string | null = null;

  for (const [key, value] of Object.entries(data)) {
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
      stats: [],
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
      } else if (typeof value === "string" && columnas.length < 8) {
        columnas.push({ key, label: labelDeCampo(key), formato: "text" });
      }
    }
    if (columnas.length >= 8) break;
  }

  const columnasLimitadas = columnas.slice(0, 8);
  const ventanasLimitadas = columnasVentana.slice(0, 3);

  const campoOrden =
    columnasLimitadas.find((c) => c.formato === "money_cents")?.key ??
    columnasLimitadas.find((c) => c.formato === "count")?.key ??
    null;

  const registros = campoOrden
    ? [...registrosRaw].sort(
        (a, b) => ((b[campoOrden] as number) ?? 0) - ((a[campoOrden] as number) ?? 0)
      )
    : registrosRaw;

  const registrosConLabel = registros.map((r) => ({ ...r, _label: r[labelKey] ?? r._key ?? "—" }));

  const statsFuente = columnasLimitadas.filter((c) => c.formato !== "text").slice(0, 3);
  const stats: StatCard[] = statsFuente.map((c) => ({
    label: c.label,
    valor: registrosRaw!.reduce((acc, r) => acc + ((r[c.key] as number) ?? 0), 0),
    formato: c.formato,
  }));
  stats.push({ label: "Registros", valor: registrosRaw.length, formato: "count" });

  return {
    titulo: typeof data.title === "string" ? data.title : null,
    meta,
    registros: registrosConLabel,
    columnas: columnasLimitadas,
    columnasVentana: ventanasLimitadas,
    stats,
    resto,
  };
}
