"use client";

/**
 * Mapa GIS de la flota. Vive en su propio archivo porque Leaflet toca
 * `window`/`document` al cargarse y no soporta SSR: OTMonitorCenter importa
 * este componente con `next/dynamic({ ssr: false })`. Además de eso, acá
 * adentro el módulo de Leaflet se carga con `import()` dinámico (no como
 * import estático arriba del archivo) para no arriesgarnos a que Next lo
 * evalúe en el paso de build del server bundle.
 *
 * Con ~1300 dispositivos, un marcador por punto (L.marker, con icono DOM)
 * puede quedar lento. En vez de sumar la dependencia `leaflet.markercluster`
 * (sin tipos oficiales, complejidad extra para tipar), usamos
 * `L.circleMarker` con `preferCanvas: true`: Leaflet dibuja los círculos en
 * un único <canvas> en vez de un nodo DOM por marcador, que alcanza para que
 * este volumen de puntos ande fluido sin agregar otra librería.
 */

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type * as LeafletNS from "leaflet";
import { BADGE_HEX, type Dispositivo } from "@/lib/otmonitor-store";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

export function OTMonitorMap({ dispositivos }: { dispositivos: Dispositivo[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletNS.Map | null>(null);
  const layerRef = useRef<LeafletNS.LayerGroup | null>(null);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    let cancelado = false;
    import("leaflet").then((L) => {
      if (cancelado || !containerRef.current) return;
      const mapa = L.map(containerRef.current, {
        center: [-34.6, -58.45], // Buenos Aires como centro por defecto; fitBounds lo ajusta apenas hay puntos
        zoom: 11,
        preferCanvas: true,
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
        maxZoom: 19,
      }).addTo(mapa);
      mapRef.current = mapa;
      layerRef.current = L.layerGroup().addTo(mapa);
      setListo(true);
    });
    return () => {
      cancelado = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!listo) return;
    let cancelado = false;
    import("leaflet").then((L) => {
      if (cancelado) return;
      const capa = layerRef.current;
      const mapa = mapRef.current;
      if (!capa || !mapa) return;
      capa.clearLayers();
      const bounds: [number, number][] = [];
      for (const d of dispositivos) {
        const color = BADGE_HEX[d.badge_color] ?? "#6e7681";
        const popup = `<strong>${escapeHtml(d.serial)}</strong><br>Terminal ${escapeHtml(d.terminal_id)} · Línea ${escapeHtml(d.linea)}<br>${escapeHtml(d.operador)}<br>${escapeHtml(d.estado_kal)}<br>Señal: ${d.dbm} dBm`;
        L.circleMarker([d.lat, d.lon], { radius: 6, color, fillColor: color, fillOpacity: 0.85, weight: 1 })
          .bindPopup(popup)
          .addTo(capa);
        bounds.push([d.lat, d.lon]);
      }
      if (bounds.length) mapa.fitBounds(bounds, { padding: [24, 24], maxZoom: 13 });
    });
    return () => {
      cancelado = true;
    };
  }, [dispositivos, listo]);

  return <div ref={containerRef} className="otmonitor-map" aria-label="Mapa de dispositivos monitoreados" />;
}
