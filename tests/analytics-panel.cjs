const assert = require("node:assert/strict");
const fs = require("node:fs");
const { loadTS } = require("../scripts/sincronizar_control.cjs");
const panel = loadTS("lib/analytics-panel.ts");
const { etiquetaDeCampo } = loadTS("lib/etiquetas.ts");

// La misma empresa nombrada de las tres formas que llegan en los JSON.
assert.equal(panel.normalizarAmbito("pms-atlantida-hml"), "ATLANTIDA");
assert.equal(panel.normalizarAmbito("ATLANTIDA"), "ATLANTIDA");
assert.equal(panel.normalizarAmbito(" atlantida "), "ATLANTIDA");
assert.equal(panel.normalizarAmbito("EMOVA"), "EMOVA");
// Algo que no sigue el patrón se conserva: no se puede inventar una empresa.
assert.equal(panel.normalizarAmbito("gcba-reports"), "GCBA-REPORTS");

const historico = {
  id: "diario", title: "Diario", description: "", source: "", updatedAt: "2026-09-17T00:00:00",
  mode: "history",
  columns: ["fecha", "tenant", "monto_cents"], dimensions: ["tenant"],
  metrics: [{ key: "monto_cents", label: "Monto", format: "money_cents" }],
  rows: [
    ["2026-09-16", "ATLANTIDA", 100],
    ["2026-09-17", "ATLANTIDA", 300],
    ["2026-09-17", "EMOVA", 1000],
  ],
};
const foto = {
  id: "foto", title: "Foto", description: "", source: "", updatedAt: "2026-09-17T00:00:00",
  mode: "snapshot",
  columns: ["fecha", "empresa", "cantidad"], dimensions: ["empresa"],
  metrics: [{ key: "cantidad", label: "Registros", format: "count" }],
  rows: [
    ["2026-09-16", "pms-atlantida-hml", 7],
    ["2026-09-17", "pms-atlantida-hml", 5],
    ["2026-09-17", "pms-emova-hml", 9],
  ],
};

// Un único listado de empresas para fuentes que las nombran distinto.
assert.deepEqual(panel.listarAmbitos([historico, foto]), ["ATLANTIDA", "EMOVA"]);
assert.equal(panel.dimensionAmbito(historico), "tenant");
assert.equal(panel.dimensionAmbito(foto), "empresa");

// Recortar por empresa alcanza a las dos fuentes, cada una por su campo.
assert.equal(panel.recortarPorAmbito(historico, "ATLANTIDA").rows.length, 2);
assert.equal(panel.recortarPorAmbito(foto, "ATLANTIDA").rows.length, 2);
assert.equal(panel.recortarPorAmbito(foto, "EMOVA").rows.length, 1);
assert.equal(panel.recortarPorAmbito(historico, "").rows.length, 3, "sin ámbito no se toca la fuente");
assert.equal(panel.recortarPorAmbito(historico, "INEXISTENTE").rows.length, 0);

// Un histórico suma su ventana por defecto; una foto se queda en el último día
// observado (sumar siete fotos contaría siete veces lo mismo).
const rHistorico = panel.resumenFuente(historico);
assert.equal(rHistorico.total, 1400);
assert.ok(rHistorico.cambio, "un histórico se compara");
const rFoto = panel.resumenFuente(foto);
assert.equal(rFoto.total, 14, "sólo el 2026-09-17");
assert.equal(rFoto.cambio, null, "una foto no se compara");
assert.match(rFoto.rotuloPeriodo, /2026-09-17/);

// Una fuente con un solo día cargado se resume por ese día, no por una ventana
// de calendario con seis huecos (antes dibujaba un punto suelto invisible).
const unDia = { ...historico, rows: [["2026-09-17T08:00:00", "ATLANTIDA", 50], ["2026-09-17T09:00:00", "ATLANTIDA", 70]] };
const rUnDia = panel.resumenFuente(unDia);
assert.equal(rUnDia.total, 120);
assert.match(rUnDia.rotuloPeriodo, /Único día con datos: 2026-09-17/);
assert.ok(rUnDia.puntos.length >= 2, "con fechas horarias la curva del día tiene puntos");
assert.ok(rUnDia.puntos.every(p => p.value !== null), "la curva de la tarjeta no lleva huecos");

// Reparto: se descarta la métrica que vive entera en una categoría (acá el
// "sin cobrar" sólo existe en UNPAID) y se usa la primera que reparta de
// verdad; los códigos numéricos no se muestran como categorías.
const estados = {
  id: "estados", title: "Estados", description: "", source: "", updatedAt: "2026-09-17T00:00:00",
  mode: "history",
  columns: ["fecha", "tenant", "estado", "sin_cobrar_cents", "monto_cents"],
  dimensions: ["tenant", "estado"],
  metrics: [
    { key: "sin_cobrar_cents", label: "Sin cobrar", format: "money_cents" },
    { key: "monto_cents", label: "Monto", format: "money_cents" },
  ],
  rows: [
    ["2026-09-17", "ATLANTIDA", "PAID", 0, 900],
    ["2026-09-17", "ATLANTIDA", "UNPAID", 100, 100],
  ],
};
assert.equal(panel.dimensionDesglose(estados), "estado");
assert.equal(panel.dimensionDesglose(historico), null, "la empresa no es un desglose");
const reparto = panel.resumenFuente(estados).reparto;
assert.equal(reparto.metric.label, "Monto", "la métrica degenerada no sirve para repartir");
assert.deepEqual(reparto.partes.map(p => [p.label, Math.round(p.share)]), [["PAID", 90], ["UNPAID", 10]]);
assert.equal(panel.resumenFuente(estados).total, 100, "el titular sigue siendo lo que no se cobró");
const conCodigos = { ...estados, rows: estados.rows.map((r, i) => [r[0], r[1], String(i), r[3], r[4]]) };
assert.equal(panel.resumenFuente(conCodigos).reparto, null, "un código no es una categoría legible");

// Recortado por empresa, el titular acompaña.
assert.equal(panel.resumenFuente(panel.recortarPorAmbito(historico, "ATLANTIDA")).total, 400);
const vacio = panel.resumenFuente(panel.recortarPorAmbito(historico, "INEXISTENTE"));
assert.equal(vacio.conDatos, false);
assert.equal(vacio.total, null);
assert.deepEqual(vacio.puntos, []);

// Rótulos: lo conocido se traduce, lo desconocido se prettifica igual.
assert.equal(etiquetaDeCampo("money_processed_cents"), "Monto procesado");
assert.equal(etiquetaDeCampo("tap_count"), "Taps");
assert.equal(etiquetaDeCampo("tenant"), "Empresa");
assert.equal(etiquetaDeCampo("campo_nuevo_sin_traducir"), "Campo nuevo sin traducir");

// Contra el dato real publicado: todas las fuentes tienen que caer bajo una
// misma lista de empresas, si no el recorte global no sirve para nada.
if (fs.existsSync(".preview/resumen.json")) {
  const datasets = JSON.parse(fs.readFileSync(".preview/resumen.json", "utf8"))._analytics.datasets;
  const ambitos = panel.listarAmbitos(datasets);
  assert.ok(ambitos.includes("ATLANTIDA"), "ATLANTIDA tiene que estar una sola vez");
  assert.ok(!ambitos.some(a => /^PMS-/.test(a)), "no puede quedar ningún nombre de base sin normalizar");
  const sinDimension = datasets.filter(d => !panel.dimensionAmbito(d));
  assert.equal(sinDimension.length, 0, `fuentes sin empresa: ${sinDimension.map(d => d.id)}`);
  for (const d of datasets) {
    // Cada fuente se recorta por una empresa que ella misma tenga; una fuente
    // de una sola empresa (Pendientes EMOVA) puede quedar en cero para otra, y
    // así se ve en el panel ("Sin datos para esta empresa").
    const propio = panel.listarAmbitos([d]);
    const recortado = panel.recortarPorAmbito(d, propio[0]);
    assert.ok(recortado.rows.length > 0, `${d.id} quedó sin filas al recortar por ${propio[0]}`);
    assert.ok(recortado.rows.length <= d.rows.length, `${d.id} creció al recortar`);
    if (propio.length > 1) assert.ok(recortado.rows.length < d.rows.length, `${d.id} no se recortó`);
    assert.ok(panel.resumenFuente(d).metric, `${d.id} sin métrica titular`);
    assert.ok(panel.resumenFuente(d).total !== null, `${d.id} sin titular calculable`);
  }
}
console.log("Panel de fuentes, ámbito unificado y etiquetas: OK");
