// Ejecuta los productores contra la misma ruta de ingesta de Next, alojada
// temporalmente en loopback. No depende de next dev, .next ni puertos expuestos.
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const Module = require("node:module");
const { spawn } = require("node:child_process");
const ts = require("typescript");
const ROOT = path.resolve(__dirname, "..");
const cache = new Map();

function loadTS(filename) {
  filename = path.resolve(filename);
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = new Module(filename, module);
  mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
  cache.set(filename, mod);
  const original = mod.require.bind(mod);
  mod.require = name => {
    const target = name.startsWith("@/") ? path.join(ROOT, name.slice(2) + ".ts") : name.startsWith(".") ? path.resolve(path.dirname(filename), name + ".ts") : null;
    return target && fs.existsSync(target) ? loadTS(target) : original(name);
  };
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, filename);
  return mod.exports;
}

function runPython(script, env) {
  return new Promise((resolve, reject) => {
    const child = spawn("py", ["-B", path.join(ROOT, "scripts", script)], { cwd: ROOT, env, windowsHide: true, stdio: ["ignore", "inherit", "inherit"] });
    const timeout = setTimeout(() => { child.kill(); reject(new Error(`${script}: excedió 120 segundos`)); }, 120000);
    child.on("error", e => { clearTimeout(timeout); reject(e); });
    child.on("close", code => { clearTimeout(timeout); code === 0 ? resolve() : reject(new Error(`${script}: salida ${code}`)); });
  });
}

async function sync() {
  process.chdir(ROOT);
  require("@next/env").loadEnvConfig(ROOT, false, { info() {}, error() {} });
  for (const key of ["INGEST_API_KEY", "GITHUB_TOKEN", "GITHUB_REPO"]) if (!process.env[key]) throw new Error(`Falta ${key}`);
  const directory = path.join(ROOT, ".sync"); fs.mkdirSync(directory, { recursive: true });
  const lock = path.join(directory, "running.lock");
  if (fs.existsSync(lock)) {
    if (Date.now() - fs.statSync(lock).mtimeMs < 300000) { console.log("Ya hay una sincronización en curso."); return; }
    fs.unlinkSync(lock);
  }
  const lockFd = fs.openSync(lock, "wx"); fs.closeSync(lockFd);
  let server;
  try {
    const handler = loadTS(path.join(ROOT, "app/api/dashboards/[user]/[project]/route.ts"));
    server = http.createServer(async (req, res) => {
      const match = req.url?.match(/^\/api\/dashboards\/(opentransit|leandro)\/(resumen|emision)$/);
      if (req.method !== "POST" || !match || !["opentransit/resumen", "leandro/emision"].includes(`${match[1]}/${match[2]}`)) { res.writeHead(404); res.end(); return; }
      try {
        const chunks = []; let bytes = 0;
        for await (const chunk of req) { bytes += chunk.length; if (bytes > 4500000) { res.writeHead(413); res.end(); return; } chunks.push(chunk); }
        const request = new Request(`http://127.0.0.1${req.url}`, { method: "POST", headers: {
          authorization: req.headers.authorization ?? "", "content-type": "application/json"
        }, body: Buffer.concat(chunks) });
        const response = await handler.POST(request, { params: { user: match[1], project: match[2] } });
        res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(await response.text());
      } catch { res.writeHead(500); res.end('{"error":"Fallo de ingesta local"}'); }
    });
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const cadence = process.argv.includes("--scheduled") ? String(Number(process.env.ERICK_SYNC_SECONDS) || 300) : "0";
    const env = { ...process.env, ERICK_API_URL: `http://127.0.0.1:${server.address().port}`, ERICK_API_KEY: process.env.INGEST_API_KEY,
      ERICK_USER: "opentransit", ERICK_PROJECT: "resumen", ERICK_SYNC_SECONDS: cadence };
    const errors = [];
    for (const script of ["sincronizar_resumen.py", "sincronizar_emision.py"]) {
      try { await runPython(script, env); } catch (e) { errors.push(e.message); console.error(e.message); }
    }
    fs.writeFileSync(path.join(directory, "last-run.json"), JSON.stringify({ finished_at: new Date().toISOString(), ok: !errors.length, errors, cadence_seconds: Number(cadence) }, null, 2));
    if (errors.length) throw new Error("Una o más fuentes no se pudieron sincronizar; las demás se publicaron.");
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    fs.unlinkSync(lock);
  }
}

module.exports = { loadTS };
if (require.main === module) sync().catch(e => { console.error(e.message); process.exitCode = 1; });
