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

// El log crudo (.sync/sync.log) no trae timestamp por línea: hoy solo se sabe "cuándo pasó
// algo" por el mtime del archivo. En vez de tocar cada console.log/console.error suelto,
// se parchea una sola vez acá para que toda la salida directa de este proceso quede
// prefijada con fecha/hora. Formato ASCII a propósito (ver relayTimestamped más abajo).
function timestampPrefix() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `[${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}]`;
}
const originalConsoleLog = console.log.bind(console);
const originalConsoleError = console.error.bind(console);
console.log = (...args) => originalConsoleLog(timestampPrefix(), ...args);
console.error = (...args) => originalConsoleError(timestampPrefix(), ...args);

// Relayea la salida de un proceso hijo (los productores Python) hacia el stdout/stderr de
// este proceso, agregando el mismo timestamp al principio de cada línea. La mayor parte del
// contenido real de sync.log viene de los print() de Python, no de console.log de acá, así
// que solo parchear console no alcanzaría. Se trabaja con Buffers crudos (no texto) y el
// prefijo se escribe siempre en ASCII para no arriesgar un mal decode/re-encode de acentos
// si Python no está imprimiendo en UTF-8 (la redirección de ops\sincronizar_control.ps1 ya
// re-codifica todo el stream igual, esto no lo empeora).
function relayTimestamped(source, destination) {
  let pending = Buffer.alloc(0);
  const NEWLINE = 0x0a;
  source.on("error", () => {}); // un error de lectura del pipe no debe tirar todo el proceso
  source.on("data", (chunk) => {
    try {
      pending = Buffer.concat([pending, chunk]);
      let index;
      while ((index = pending.indexOf(NEWLINE)) !== -1) {
        const line = pending.subarray(0, index);
        pending = pending.subarray(index + 1);
        destination.write(Buffer.concat([Buffer.from(timestampPrefix() + " ", "ascii"), line, Buffer.from("\n")]));
      }
    } catch {
      // Si el prefijo falla, mejor perder el timestamp de esa línea que perder el dato o
      // cortar la sincronización real.
      try { destination.write(chunk); } catch {}
    }
  });
  source.on("end", () => {
    if (pending.length) {
      try { destination.write(Buffer.concat([Buffer.from(timestampPrefix() + " ", "ascii"), pending])); } catch {}
      pending = Buffer.alloc(0);
    }
  });
}

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
    // stdio en "pipe" (antes "inherit") para poder timestampear la salida de Python línea
    // por línea vía relayTimestamped; sigue yendo a los mismos stdout/stderr de este
    // proceso, así que la redirección `>> $logPath 2>&1` del .ps1 sigue capturando todo igual.
    const child = spawn("py", ["-B", path.join(ROOT, "scripts", script)], { cwd: ROOT, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    relayTimestamped(child.stdout, process.stdout);
    relayTimestamped(child.stderr, process.stderr);
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
      const match = req.url?.match(/^\/api\/dashboards\/(opentransit|leandro)\/(resumen|emision|otmonitor)$/);
      if (req.method !== "POST" || !match || !["opentransit/resumen", "leandro/emision", "leandro/otmonitor"].includes(`${match[1]}/${match[2]}`)) { res.writeHead(404); res.end(); return; }
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
    for (const script of ["sincronizar_resumen.py", "sincronizar_emision.py", "sincronizar_otmonitor.py"]) {
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
