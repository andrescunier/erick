"use client";

import { useState } from "react";

type Item = { key: string; label: string };

/**
 * Elegir qué columnas/tarjetas mostrar de este dashboard en particular.
 * `habilitadas === null` significa "sin preferencia guardada": arranca con
 * todo tildado, igual que se ve hoy sin configurar nada.
 */
export function WidgetPicker({
  dashboardKey,
  disponibles,
  habilitadas,
}: {
  dashboardKey: string;
  disponibles: Item[];
  habilitadas: string[] | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const [seleccion, setSeleccion] = useState<Set<string>>(
    new Set(habilitadas ?? disponibles.map((d) => d.key))
  );
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");

  function alternar(key: string) {
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function guardar() {
    setGuardando(true);
    setMensaje("");
    try {
      const res = await fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dashboard: dashboardKey, columnas: [...seleccion] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar.");
      setMensaje("Guardado.");
      window.location.reload();
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : "Error al guardar.");
      setGuardando(false);
    }
  }

  async function mostrarTodo() {
    setGuardando(true);
    try {
      await fetch(`/api/preferences?dashboard=${encodeURIComponent(dashboardKey)}`, {
        method: "DELETE",
      });
      window.location.reload();
    } catch {
      setGuardando(false);
    }
  }

  return (
    <div className="widget-picker">
      <button type="button" onClick={() => setAbierto((a) => !a)}>
        {abierto ? "Cerrar personalización" : "Personalizar widgets"}
      </button>
      {abierto && (
        <div className="widget-picker-panel">
          {disponibles.map((item) => (
            <label key={item.key} className="widget-picker-item">
              <input
                type="checkbox"
                checked={seleccion.has(item.key)}
                onChange={() => alternar(item.key)}
              />
              {item.label}
            </label>
          ))}
          <div className="widget-picker-acciones">
            <button type="button" onClick={guardar} disabled={guardando}>
              Guardar
            </button>
            {habilitadas !== null && (
              <button type="button" onClick={mostrarTodo} disabled={guardando}>
                Mostrar todo (default)
              </button>
            )}
          </div>
          {mensaje && <p className="widget-picker-mensaje">{mensaje}</p>}
        </div>
      )}
    </div>
  );
}
