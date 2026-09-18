/**
 * Qué es cada tablero, en castellano.
 *
 * El storage los identifica por `usuario/proyecto` ("opentransit/resumen",
 * "leandro/otmonitor"), que es una ruta de archivos, no un nombre: la pantalla
 * de inicio listaba "resumen", "emision" y "otmonitor" agrupados bajo el
 * nombre de una persona, y para saber qué había adentro de cada uno había que
 * abrirlos. Acá viven el nombre y la explicación de una línea; lo que no esté
 * declarado igual se lista, con su slug como nombre, así un tablero nuevo
 * aparece solo y después se le pone nombre.
 */

export type FichaTablero = {
  nombre: string;
  descripcion: string;
  /** Qué se mira primero al abrirlo. */
  destacado: string;
};

const CATALOGO: Record<string, FichaTablero> = {
  "opentransit/resumen": {
    nombre: "Tránsito",
    descripcion: "Recaudación, taps y estados de cobro de las empresas de colectivo y subte.",
    destacado: "12 fuentes, comparables entre sí y filtrables por empresa",
  },
  "leandro/emision": {
    nombre: "Emisión",
    descripcion: "Tarjetas, cuentas, solicitudes y rechazos que llegan por las notificaciones de BHUB.",
    destacado: "Operaciones del día y actividad en vivo",
  },
  "leandro/otmonitor": {
    nombre: "Monitoreo de flota",
    descripcion: "Estado en línea de los validadores: última señal, GPS, módem y lector, sobre el mapa.",
    destacado: "Mapa, semáforos y grillas de diagnóstico",
  },
};

export function fichaDe(user: string, project: string): FichaTablero {
  return (
    CATALOGO[`${user}/${project}`] ?? {
      nombre: project.replace(/[_-]/g, " ").replace(/^./, (c) => c.toUpperCase()),
      descripcion: `Tablero publicado por ${user}.`,
      destacado: "Todavía sin descripción",
    }
  );
}
