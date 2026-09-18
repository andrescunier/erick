"use client";

/**
 * Mapa GIS de la flota. Vive en su propio archivo porque Leaflet toca
 * `window`/`document` al cargarse y no soporta SSR: OTMonitorCenter importa
 * este componente con `next/dynamic({ ssr: false })`. Además de eso, acá
 * adentro el módulo de Leaflet se carga con `import()` dinámico (no como
 * import estático arriba del archivo) para no arriesgarnos a que Next lo
 * evalúe en el paso de build del server bundle.
 *
 * Clustering: la herramienta original agrupa los marcadores con el plugin
 * `leaflet.markercluster` (a nivel alejado se ven círculos con un número
 * adentro, que se separan en marcadores individuales al acercar el zoom).
 * Con ~1300 dispositivos sueltos, un mapa sin agrupar es tanto lento como
 * ilegible (queda una alfombra de puntos superpuestos), así que esto no es
 * un detalle cosmético: es la diferencia visual más grande contra el
 * original. `leaflet.markercluster` no tiene tipos oficiales de la propia
 * librería, pero sí un paquete de la comunidad (`@types/leaflet.markercluster`)
 * que instalamos aparte; sólo hace falta un cast puntual donde sus tipos
 * asumen `L.Marker` y nosotros — como hace el original — agregamos
 * `L.CircleMarker` al grupo (funciona igual en runtime, ver `renderizarMapa`
 * en generar_dashboard.py).
 */

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import type * as LeafletNS from "leaflet";
import { BADGE_HEX, type Dispositivo } from "@/lib/otmonitor-store";

// @types/leaflet no conoce esta propiedad: la agregamos vía augmentation
// para poder guardar en cada CircleMarker qué badge_color tiene el
// dispositivo, y así calcular en `iconCreateFunction` el color del cluster
// que lo agrupa (ver colorClusterPredominante más abajo).
declare module "leaflet" {
  interface CircleMarkerOptions {
    severidad?: string;
  }
}

// Colores de severidad para el ícono del cluster: mismo criterio que usa la
// herramienta original en `renderizarMapa` para el color de cada punto
// (warning/orange comparten el mismo naranja). Se declaran acá aparte de
// BADGE_HEX porque son sólo 4 "niveles" agrupados, no un color por estado.
const COLOR_CLUSTER_DANGER = "#da3633";
const COLOR_CLUSTER_WARNING = "#d97706";
const COLOR_CLUSTER_SECONDARY = "#6e7681";
const COLOR_CLUSTER_OK = "#238636";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

// Severidad predominante de un cluster: si hay al menos un dispositivo grave
// (danger) el cluster se pinta rojo; si no hay ninguno grave pero sí
// leve/medio (warning u orange) se pinta naranja; si sólo hay "sin dato"
// (secondary) se pinta gris; en cualquier otro caso (todo operativo/en
// línea) se pinta verde. Mismo orden de prioridad que pidió el dueño del
// producto al describir cómo debía verse esto.
function colorClusterPredominante(coloresBadge: string[]): string {
  if (coloresBadge.includes("danger")) return COLOR_CLUSTER_DANGER;
  if (coloresBadge.includes("warning") || coloresBadge.includes("orange")) return COLOR_CLUSTER_WARNING;
  if (coloresBadge.includes("secondary")) return COLOR_CLUSTER_SECONDARY;
  return COLOR_CLUSTER_OK;
}

function claseSeveridad(color: string): string {
  if (color === COLOR_CLUSTER_DANGER) return "otmonitor-cluster--danger";
  if (color === COLOR_CLUSTER_WARNING) return "otmonitor-cluster--warning";
  if (color === COLOR_CLUSTER_SECONDARY) return "otmonitor-cluster--secondary";
  return "otmonitor-cluster--success";
}

export function OTMonitorMap({ dispositivos }: { dispositivos: Dispositivo[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletNS.Map | null>(null);
  const clusterRef = useRef<LeafletNS.MarkerClusterGroup | null>(null);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    let cancelado = false;
    // El build UMD de leaflet.markercluster está pensado para <script> plano
    // (leaflet.js primero, leaflet.markercluster.js después): su código
    // referencia la variable global `L` directamente, sin hacer
    // `require('leaflet')` — con un bundler hay que exponerla a mano en
    // `window.L` ANTES de importarlo, si no explota con "L is not defined".
    import("leaflet").then(async (L) => {
      if (cancelado || !containerRef.current) return;
      (window as unknown as { L: typeof L }).L = L;
      await import("leaflet.markercluster");
      const mapa = L.map(containerRef.current, {
        center: [-34.6, -58.45], // Buenos Aires como centro por defecto; fitBounds lo ajusta apenas hay puntos
        zoom: 11,
        preferCanvas: true,
      });
      // Basemap gris oscuro, el mismo que usa la herramienta original: sobre
      // un mapa claro los marcadores de severidad (rojo/naranja/verde) pierden
      // contraste y la pantalla deja de leerse como una consola.
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
        attribution: "Tiles &copy; Esri",
        maxZoom: 16,
      }).addTo(mapa);
      mapRef.current = mapa;
      clusterRef.current = L.markerClusterGroup({
        maxClusterRadius: 60,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        iconCreateFunction: (cluster) => {
          // Los tipos de @types/leaflet.markercluster asumen L.Marker, pero
          // acá (como en el original) agregamos L.CircleMarker al grupo:
          // funciona en runtime, sólo hace falta el cast para leer nuestra
          // propiedad custom `severidad`.
          const marcadores = cluster.getAllChildMarkers() as unknown as {
            options: LeafletNS.CircleMarkerOptions & { severidad?: string };
          }[];
          const colores = marcadores.map((m) => m.options.severidad ?? "success");
          const color = colorClusterPredominante(colores);
          const cantidad = cluster.getChildCount();
          const tamano = cantidad < 10 ? "small" : cantidad < 50 ? "medium" : "large";
          // iconSize explicito: sin esto Leaflet no dimensiona ni centra el
          // divIcon, y el numero terminaba dibujado al lado del circulo en vez
          // de adentro. El CSS se queda solo con el aspecto (color y borde).
          const lado = tamano === "small" ? 34 : tamano === "medium" ? 42 : 52;
          return L.divIcon({
            html: `<div>${cantidad}</div>`,
            className: `otmonitor-cluster otmonitor-cluster--${tamano} ${claseSeveridad(color)}`,
            iconSize: L.point(lado, lado),
          });
        },
      });
      mapa.addLayer(clusterRef.current);
      setListo(true);
    });
    return () => {
      cancelado = true;
      mapRef.current?.remove();
      mapRef.current = null;
      clusterRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!listo) return;
    let cancelado = false;
    import("leaflet").then((L) => {
      if (cancelado) return;
      const grupo = clusterRef.current;
      const mapa = mapRef.current;
      if (!grupo || !mapa) return;
      grupo.clearLayers();
      const bounds: [number, number][] = [];
      for (const d of dispositivos) {
        const color = BADGE_HEX[d.badge_color] ?? "#6e7681";
        const popup = `<strong>${escapeHtml(d.serial)}</strong><br>Terminal ${escapeHtml(d.terminal_id)} · Línea ${escapeHtml(d.linea)}<br>${escapeHtml(d.operador)}<br>${escapeHtml(d.estado_kal)}<br>Señal: ${d.dbm} dBm`;
        const marker = L.circleMarker([d.lat, d.lon], {
          radius: 6,
          color,
          fillColor: color,
          fillOpacity: 0.85,
          weight: 1,
          // Propiedad custom (declarada en leaflet.d.ts) leída por
          // iconCreateFunction para elegir el color del cluster.
          severidad: d.badge_color,
        }).bindPopup(popup);
        grupo.addLayer(marker);
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
