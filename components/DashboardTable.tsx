"use client";

import { useMemo, useState } from "react";
import type { Columna, ColumnaVentana } from "@/lib/dashboard-shape";
import { encontrarPctEnVentana } from "@/lib/dashboard-shape";
import { formatearValor } from "@/lib/format";

type Registro = Record<string, unknown>;

type Props = {
  registros: Registro[];
  columnas: Columna[];
  columnasVentana: ColumnaVentana[];
  campoDestacado: string | null;
};

type SortKey = { tipo: "label" } | { tipo: "columna"; key: string } | { tipo: "ventana"; index: number };

function PctBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="muted">—</span>;
  const clase = pct >= 0 ? "pct-pos" : "pct-neg";
  return <span className={clase}>{formatearValor(pct, "percent")}</span>;
}

function pctDeVentana(registro: Registro, v: ColumnaVentana): number | null {
  const mapa = registro[v.campoOrigen] as Record<string, unknown> | undefined;
  const ventana = mapa?.[v.ventanaKey] as Record<string, unknown> | undefined;
  return ventana ? encontrarPctEnVentana(ventana) : null;
}

export function DashboardTable({ registros, columnas, columnasVentana, campoDestacado }: Props) {
  const [busqueda, setBusqueda] = useState("");
  const [orden, setOrden] = useState<{ key: SortKey; dir: 1 | -1 }>({
    key: campoDestacado ? { tipo: "columna", key: campoDestacado } : { tipo: "label" },
    dir: -1,
  });

  const maximo = useMemo(() => {
    if (!campoDestacado) return 0;
    return Math.max(1, ...registros.map((r) => (r[campoDestacado] as number) ?? 0));
  }, [registros, campoDestacado]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return registros;
    return registros.filter((r) => String(r._label).toLowerCase().includes(q));
  }, [registros, busqueda]);

  const ordenados = useMemo(() => {
    const valorDeOrden = (r: Registro): number | string => {
      if (orden.key.tipo === "label") return String(r._label).toLowerCase();
      if (orden.key.tipo === "columna") return (r[orden.key.key] as number | string) ?? "";
      const v = columnasVentana[orden.key.index];
      return pctDeVentana(r, v) ?? -Infinity;
    };
    return [...filtrados].sort((a, b) => {
      const va = valorDeOrden(a);
      const vb = valorDeOrden(b);
      if (typeof va === "string" || typeof vb === "string") {
        return String(va).localeCompare(String(vb)) * orden.dir;
      }
      return (va - vb) * orden.dir;
    });
  }, [filtrados, orden, columnasVentana]);

  function alClickearHeader(key: SortKey) {
    setOrden((actual) => {
      const mismaClave = JSON.stringify(actual.key) === JSON.stringify(key);
      return { key, dir: mismaClave ? (actual.dir === 1 ? -1 : 1) : -1 };
    });
  }

  function flecha(key: SortKey): string {
    if (JSON.stringify(orden.key) !== JSON.stringify(key)) return "";
    return orden.dir === 1 ? " ↑" : " ↓";
  }

  return (
    <div>
      <div className="tabla-controles">
        <input
          type="text"
          placeholder="Buscar…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="buscador"
        />
        <span className="tabla-contador">
          {filtrados.length} de {registros.length}
        </span>
      </div>
      <div className="tabla-envoltorio">
        <table>
          <thead>
            <tr>
              <th className="ordenable" onClick={() => alClickearHeader({ tipo: "label" })}>
                Registro{flecha({ tipo: "label" })}
              </th>
              {columnas.map((c) => (
                <th
                  key={c.key}
                  className="ordenable"
                  onClick={() => alClickearHeader({ tipo: "columna", key: c.key })}
                >
                  {c.label}
                  {flecha({ tipo: "columna", key: c.key })}
                </th>
              ))}
              {columnasVentana.map((v, i) => (
                <th
                  key={v.label}
                  className="ordenable"
                  onClick={() => alClickearHeader({ tipo: "ventana", index: i })}
                >
                  {v.label}
                  {flecha({ tipo: "ventana", index: i })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ordenados.map((r, i) => (
              <tr key={String(r._key ?? r._label ?? i)}>
                <td>{String(r._label)}</td>
                {columnas.map((c) => {
                  const esDestacada = c.key === campoDestacado;
                  const valor = r[c.key];
                  if (esDestacada && typeof valor === "number") {
                    const pct = Math.max(2, Math.min(100, (valor / maximo) * 100));
                    return (
                      <td key={c.key} className="celda-barra">
                        <div className="barra-fondo" style={{ width: `${pct}%` }} />
                        <span className="barra-texto">{formatearValor(valor, c.formato)}</span>
                      </td>
                    );
                  }
                  return <td key={c.key}>{formatearValor(valor, c.formato)}</td>;
                })}
                {columnasVentana.map((v) => (
                  <td key={v.label}>
                    <PctBadge pct={pctDeVentana(r, v)} />
                  </td>
                ))}
              </tr>
            ))}
            {ordenados.length === 0 && (
              <tr>
                <td colSpan={1 + columnas.length + columnasVentana.length} className="vacio">
                  Sin resultados para &quot;{busqueda}&quot;.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
