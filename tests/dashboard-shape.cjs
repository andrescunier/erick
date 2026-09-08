const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");
const output = ts.transpileModule(fs.readFileSync("lib/dashboard-shape.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 }
}).outputText;
const context = { exports: {} };
vm.runInNewContext(output, context);
const { detectarForma, encontrarPctEnVentana } = context.exports;
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
assert.ok(!shape.stats.some(c => c.label === "Average ticket"));
assert.equal(shape.columnasVentana.length, 1);
assert.equal(shape.resto.tenants, data.tenants);
const middleware = fs.readFileSync("middleware.ts", "utf8");
const matcher = JSON.parse(middleware.match(/matcher: \[\s*(".*")/)[1]);
const pattern = new RegExp("^" + matcher + "$" );
for (const path of ["/opentransit/report.png", "/api-team/report", "/login-team/report", "/opentransit/resumen"]) assert.ok(pattern.test(path), path);
for (const path of ["/logo-openpass.webp", "/icono-openpass.webp", "/login", "/api/dashboards", "/_next/image"]) assert.ok(!pattern.test(path), path);
console.log("Dashboard y rutas: OK");
