const { execFileSync } = require("node:child_process");
try {
  const previous = /^[a-f0-9]{40}$/i.test(process.env.VERCEL_GIT_PREVIOUS_SHA ?? "") ? process.env.VERCEL_GIT_PREVIOUS_SHA : "HEAD^";
  const changed = execFileSync("git", ["diff", "--name-only", previous, "HEAD", "--"], { encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean);
  const dataOnly = changed.length > 0 && changed.every(p => /^data\/(dashboards\/[^/]+\/[^/]+\.json|users\.json)$/.test(p));
  console.log(dataOnly ? "Sólo datos: se leen de GitHub sin reconstruir." : "Cambios de aplicación: construir.");
  process.exit(dataOnly ? 0 : 1);
} catch { process.exit(1); }
