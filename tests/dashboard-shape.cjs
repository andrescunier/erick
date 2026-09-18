const assert = require("node:assert/strict");
const fs = require("node:fs");
// loadTS y no vm.runInNewContext: dashboard-shape.ts importa el diccionario de
// etiquetas, y un contexto de vm pelado no resuelve ese require.
const { loadTS } = require("../scripts/sincronizar_control.cjs");
const { detectarForma, encontrarPctEnVentana, aplicarPreferencia } = loadTS("lib/dashboard-shape.ts");
assert.equal(encontrarPctEnVentana({ variation_pct: 0 }), 0);
assert.equal(encontrarPctEnVentana({ variation_pct: null }), null);
const data = { tenants: {
  first: { no_cobrado_cents: null, comparison_windows: null },
  second: { no_cobrado_cents: 1200, average_ticket_cents: 300,
    comparison_windows: { "7d": { money_variation_pct: null } }, extra: { nested: 1 } }
}};
const shape = detectarForma(data);
assert.ok(shape.columnas.some(c => c.key === "no_cobrado_cents"));
assert.equal(shape.stats[0].valor, 1200);
assert.match(shape.stats[0].cobertura, /1 de 2/);
// Un promedio no sube a tarjeta (sumar tickets promedio no significa nada):
// se chequea por clave, no por rótulo, porque el rótulo ahora se traduce.
assert.ok(!shape.stats.some(c => c.key === "average_ticket_cents"));
assert.equal(shape.columnas.find(c => c.key === "average_ticket_cents").label, "Ticket promedio");
assert.equal(shape.columnas.find(c => c.key === "no_cobrado_cents").label, "No cobrado");
assert.equal(shape.columnasVentana.length, 1);
assert.equal(shape.resto.tenants, data.tenants);

// aplicarPreferencia: null = todo (default); una lista filtra columnas+stats
// por la misma clave, pero nunca la tarjeta estructural "_registros".
assert.equal(aplicarPreferencia(shape, null), shape);
const filtrado = aplicarPreferencia(shape, ["no_cobrado_cents"]);
assert.equal(filtrado.columnas.length, 1);
assert.ok(filtrado.columnas.every(c => c.key === "no_cobrado_cents"));
assert.ok(filtrado.stats.some(s => s.key === "_registros"), "_registros nunca se filtra");
assert.ok(!filtrado.stats.some(s => s.key === "average_ticket_cents"));
assert.equal(aplicarPreferencia(shape, []).columnas.length, 0);
const middleware = fs.readFileSync("middleware.ts", "utf8");
const matcher = JSON.parse(middleware.match(/matcher: \[\s*(".*")/)[1]);
const pattern = new RegExp("^" + matcher + "$" );
for (const path of ["/opentransit/report.png", "/api-team/report", "/login-team/report", "/opentransit/resumen"]) assert.ok(pattern.test(path), path);
for (const path of ["/logo-openpass.webp", "/icono-openpass.webp", "/login", "/api/dashboards", "/_next/image"]) assert.ok(!pattern.test(path), path);
console.log("Dashboard y rutas: OK");
