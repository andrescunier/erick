const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync("lib/analytics.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 }
}).outputText, context);
const { metricValue, filterRows, groupRows, isAnalytics, timeValue } = context.exports;
assert.equal(timeValue("2026-09-08T12:00:00-03:00"), Date.parse("2026-09-08T15:00:00Z"));
assert.equal(timeValue("2026-09-08T12:00:00"), Date.parse("2026-09-08T12:00:00Z"));
const rows = [
  { fecha: "2026-09-01", tenant: "A", money: 100, taps: 10 },
  { fecha: "2026-09-02", tenant: "A", money: 900, taps: 30 },
  { fecha: "2026-09-02", tenant: "B", money: null, taps: 100 },
];
const ratio = { key: "money", denominator: "taps" };
assert.equal(metricValue(rows, ratio), 25); // No sumar ni promediar tickets diarios.
assert.equal(metricValue([], ratio), null);
assert.equal(metricValue([{ money: 10, taps: 0 }], ratio), null);
assert.equal(filterRows(rows, "2026-09-02", "2026-09-02", { tenant: "A" }).length, 1);
assert.equal(filterRows(rows, "2026-10-01", "", {}).length, 0);
assert.equal(groupRows(rows, "tenant", ratio).find(r => r.label === "B").value, null);
assert.equal(isAnalytics({ version: 1, datasets: [{}], warnings: [] }), false);
for (const name of ["resumen", "emision"]) {
  if (fs.existsSync(`.preview/${name}.json`)) {
    assert.ok(isAnalytics(JSON.parse(fs.readFileSync(`.preview/${name}.json`, "utf8"))._analytics));
  }
}
console.log("Agregados, ratios, filtros y contrato analítico: OK");
