const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
function load(path, globals) {
  const context = { exports: {}, ...globals };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 }
  }).outputText, context);
  return context.exports;
}
(async () => {
  const big = { series: "x".repeat(1100000) };
  const store = load("lib/github-store.ts", {
    process: { env: { GITHUB_TOKEN: "test", GITHUB_REPO: "test/repo" } },
    fetch: async (url, options) => {
      assert.equal(options.headers.Accept, "application/vnd.github.raw+json");
      assert.equal(options.cache, "no-store");
      return { ok: true, status: 200, json: async () => big };
    }
  });
  assert.equal(await store.getDashboard("test", "series"), big);
  const { middleware } = load("middleware.ts", {
    Headers, URL,
    require: name => name === "next/server" ? {
      NextResponse: { next: options => options, redirect: url => ({ redirect: String(url) }) }
    } : {
      COOKIE_SESION: "session", verificarSesion: async () => ({ u: "viewer", admin: false, a: ["demo/*"] }),
      puedeVer: () => true
    }
  });
  const result = await middleware({
    cookies: { get: () => ({ value: "test-token" }) },
    headers: new Headers({ "x-erick-admin": "true", "x-erick-user": "forged" }),
    nextUrl: { pathname: "/demo/series" }, url: "http://localhost/demo/series"
  });
  assert.equal(result.request.headers.get("x-erick-admin"), "false");
  assert.equal(result.request.headers.get("x-erick-user"), "viewer");
  console.log("Lectura de históricos grandes y sesión en server components: OK");
})().catch(e => { console.error(e); process.exitCode = 1; });
