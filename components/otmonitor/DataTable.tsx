"use client";

/**
 * Tabla genérica para las grillas de "Operaciones MTT" y "Explorador":
 * buscador de texto libre (sobre todas las columnas), orden asc/desc por
 * click en el header, selector de cantidad de filas por página y
 * paginación con números (no sólo Anterior/Siguiente), más exportar a
 * CSV/portapapeles.
 *
 * Es el reemplazo casero de jQuery DataTables + su plugin de Buttons, que
 * es lo que usaba `tableConfigBase` en la herramienta original
 * (generar_dashboard.py): `pageLength`/`lengthMenu` → el selector "Mostrar
 * N registros"; `dom: 'Blfrtip'` con `buttons: ['excel','csv','copy']` → la
 * fila de botones de exportar. El botón "Excel" exporta el mismo CSV que
 * "CSV": el original tampoco arma un binario .xlsx real, genera un XLSX
 * simple vía DataTables Buttons, así que sumar una librería de generación
 * de Excel acá no aporta nada que un CSV no resuelva igual.
 *
 * Cada columna separa la representación VISUAL (`render`, puede tener
 * badges/JSX) de la representación en TEXTO PLANO (`texto`, usada para
 * buscar y exportar) y, opcionalmente, de la clave de orden (`ordenar`):
 * sin esto, ordenar una columna de fecha por el texto ya formateado
 * ("17/09/2026 10:30") ordena mal entre meses/años distintos.
 */

import { useMemo, useState, type ReactNode } from "react";

export type ColumnaTabla<T> = {
  key: string;
  header: ReactNode;
  render: (fila: T) => ReactNode;
  texto: (fila: T) => string;
  ordenar?: (fila: T) => string | number;
  align?: "right" | "center";
};

const TAMANOS_PAGINA = [10, 25, 50, 100];

function textoCsv(valor: string): string {
  return /[",\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor;
}

function descargarArchivo(contenido: string, nombre: string, tipo: string) {
  const blob = new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Rango de páginas tipo "1 2 3 … 133": siempre primera y última página, una
// ventana chica alrededor de la actual, y "…" donde se corta la secuencia.
function rangoPaginas(actual: number, total: number): (number | "…")[] {
  const paginas = new Set<number>([0, total - 1, actual, actual - 1, actual + 1]);
  const ordenadas = [...paginas].filter((p) => p >= 0 && p < total).sort((a, b) => a - b);
  const resultado: (number | "…")[] = [];
  let anterior = -1;
  for (const p of ordenadas) {
    if (anterior !== -1 && p - anterior > 1) resultado.push("…");
    resultado.push(p);
    anterior = p;
  }
  return resultado;
}

export function DataTable<T>({
  columnas,
  filas,
  rowKey,
  filasPorPaginaInicial = 10,
  nombreArchivo = "datos",
}: {
  columnas: ColumnaTabla<T>[];
  filas: T[];
  rowKey: (fila: T, indice: number) => string;
  filasPorPaginaInicial?: number;
  nombreArchivo?: string;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [orden, setOrden] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [porPagina, setPorPagina] = useState(filasPorPaginaInicial);
  const [pagina, setPagina] = useState(0);
  const [copiado, setCopiado] = useState(false);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return filas;
    return filas.filter((f) => columnas.some((c) => c.texto(f).toLowerCase().includes(q)));
  }, [filas, busqueda, columnas]);

  const ordenadas = useMemo(() => {
    if (!orden) return filtradas;
    const columna = columnas.find((c) => c.key === orden.key);
    if (!columna) return filtradas;
    const clave = columna.ordenar ?? columna.texto;
    return [...filtradas].sort((a, b) => {
      const va = clave(a);
      const vb = clave(b);
      const cmp =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb), "es", { numeric: true });
      return cmp * orden.dir;
    });
  }, [filtradas, orden, columnas]);

  const totalPaginas = porPagina === -1 ? 1 : Math.max(1, Math.ceil(ordenadas.length / porPagina));
  // Math.min contra totalPaginas-1 evita mostrar una página vacía cuando un
  // filtro nuevo reduce el total y la página guardada quedó fuera de rango.
  const paginaSegura = Math.min(pagina, totalPaginas - 1);
  const visibles =
    porPagina === -1 ? ordenadas : ordenadas.slice(paginaSegura * porPagina, paginaSegura * porPagina + porPagina);

  function alternarOrden(key: string) {
    setOrden((actual) => {
      if (!actual || actual.key !== key) return { key, dir: 1 };
      if (actual.dir === 1) return { key, dir: -1 };
      return null;
    });
  }

  function encabezadoTexto(c: ColumnaTabla<T>): string {
    return typeof c.header === "string" ? c.header : c.key;
  }

  function exportarCsv() {
    const lineas = [columnas.map((c) => textoCsv(encabezadoTexto(c))).join(",")];
    for (const f of ordenadas) lineas.push(columnas.map((c) => textoCsv(c.texto(f))).join(","));
    // BOM UTF-8 para que Excel abra tildes/ñ sin pisarlas.
    descargarArchivo("﻿" + lineas.join("\r\n"), `${nombreArchivo}.csv`, "text/csv;charset=utf-8;");
  }

  async function copiar() {
    const lineas = [columnas.map(encabezadoTexto).join("\t")];
    for (const f of ordenadas) lineas.push(columnas.map((c) => c.texto(f)).join("\t"));
    try {
      await navigator.clipboard.writeText(lineas.join("\n"));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      // Sin permiso de portapapeles (contexto no seguro, política del
      // navegador, etc.): no hay nada más para hacer del lado del cliente.
    }
  }

  return (
    <div className="otmonitor-datatable">
      <div className="otmonitor-datatable-toolbar">
        <label className="otmonitor-datatable-length">
          Mostrar
          <select
            value={porPagina}
            onChange={(e) => {
              setPorPagina(Number(e.target.value));
              setPagina(0);
            }}
          >
            {TAMANOS_PAGINA.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
            <option value={-1}>Todos</option>
          </select>
          registros
        </label>
        <div className="otmonitor-datatable-export">
          <button type="button" onClick={exportarCsv} title="Exporta lo filtrado a un .csv que Excel abre directo">
            Excel
          </button>
          <button type="button" onClick={exportarCsv}>
            CSV
          </button>
          <button type="button" onClick={() => void copiar()}>
            {copiado ? "Copiado ✓" : "Copiar"}
          </button>
        </div>
        <input
          type="search"
          className="otmonitor-datatable-search"
          placeholder="Buscar…"
          value={busqueda}
          onChange={(e) => {
            setBusqueda(e.target.value);
            setPagina(0);
          }}
        />
      </div>
      <div className="tabla-envoltorio">
        <table>
          <thead>
            <tr>
              {columnas.map((c) => {
                const activo = orden?.key === c.key;
                return (
                  <th
                    key={c.key}
                    className={`otmonitor-th-ord${activo ? " activo" : ""}`}
                    onClick={() => alternarOrden(c.key)}
                    aria-sort={activo ? (orden!.dir === 1 ? "ascending" : "descending") : "none"}
                  >
                    {c.header}
                    <span className="otmonitor-th-flecha">{activo ? (orden!.dir === 1 ? "▲" : "▼") : "⇅"}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visibles.map((f, i) => (
              <tr key={rowKey(f, i)}>
                {columnas.map((c) => (
                  <td key={c.key} className={c.align ? `col-${c.align}` : undefined}>
                    {c.render(f)}
                  </td>
                ))}
              </tr>
            ))}
            {visibles.length === 0 && (
              <tr>
                <td colSpan={columnas.length} className="vacio">
                  Sin resultados para estos filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="otmonitor-datatable-footer">
        <span>
          {ordenadas.length === filas.length
            ? `${filas.length} registros`
            : `${ordenadas.length} de ${filas.length} registros`}
        </span>
        {totalPaginas > 1 && (
          <div className="otmonitor-pagenums">
            <button type="button" disabled={paginaSegura === 0} onClick={() => setPagina(paginaSegura - 1)}>
              ‹
            </button>
            {rangoPaginas(paginaSegura, totalPaginas).map((p, i) =>
              p === "…" ? (
                <span key={`e${i}`} className="otmonitor-pagenums-ellipsis">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  className={p === paginaSegura ? "active" : ""}
                  onClick={() => setPagina(p)}
                >
                  {p + 1}
                </button>
              )
            )}
            <button
              type="button"
              disabled={paginaSegura >= totalPaginas - 1}
              onClick={() => setPagina(paginaSegura + 1)}
            >
              ›
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
