/**
 * Preferencias de widgets por usuario: qué columnas/métricas elige ver en
 * cada dashboard al que ya tiene acceso. Mismo patrón que github-store.ts y
 * user-store.ts — un JSON en GitHub por usuario, en
 * data/preferences/<username>.json.
 *
 * La clave de cada entrada es "{user}/{project}" del dashboard (el mismo par
 * que ya usa `puedeVer`), y el valor es la lista de `Columna.key` habilitadas
 * (ver lib/dashboard-shape.ts). Sin entrada para un dashboard, se muestra
 * todo — la ausencia de preferencia es "no filtrar", nunca "ocultar todo",
 * para que nadie pierda widgets por no haber configurado nada.
 */

const GITHUB_API = "https://api.github.com";

export type PreferenciasUsuario = Record<string, { columnas: string[] }>;

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

function repoConfig() {
  return {
    repo: env("GITHUB_REPO"),
    branch: process.env.GITHUB_BRANCH || "master",
    token: env("GITHUB_TOKEN"),
  };
}

function rutaPreferencias(username: string): string {
  return `data/preferences/${username}.json`;
}

async function githubRequest(path: string, init?: RequestInit) {
  const { token } = repoConfig();
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  return res;
}

export async function leerPreferencias(username: string): Promise<PreferenciasUsuario> {
  const { repo, branch } = repoConfig();
  const path = rutaPreferencias(username);
  const res = await githubRequest(
    `/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`,
    { headers: { Accept: "application/vnd.github.raw+json" } }
  );
  if (res.status === 404) return {};
  if (!res.ok) {
    throw new Error(`No pude leer ${path}: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function currentSha(path: string): Promise<string | undefined> {
  const { repo, branch } = repoConfig();
  const res = await githubRequest(`/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`);
  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`No pude verificar ${path}: ${res.status}`);
  const body = (await res.json()) as { sha: string };
  return body.sha;
}

export async function guardarPreferenciaDashboard(
  username: string,
  dashboardKey: string,
  columnas: string[]
): Promise<PreferenciasUsuario> {
  const { repo, branch } = repoConfig();
  const path = rutaPreferencias(username);
  const actual = await leerPreferencias(username);
  const combinado: PreferenciasUsuario = { ...actual, [dashboardKey]: { columnas } };
  const sha = await currentSha(path);
  const content = Buffer.from(JSON.stringify(combinado, null, 2), "utf-8").toString("base64");

  const res = await githubRequest(`/repos/${repo}/contents/${path}`, {
    method: "PUT",
    body: JSON.stringify({
      message: `preferences(${username}): ${dashboardKey}`,
      content,
      branch,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) {
    throw new Error(`No pude escribir ${path}: ${res.status} ${await res.text()}`);
  }
  return combinado;
}

export async function borrarPreferenciaDashboard(
  username: string,
  dashboardKey: string
): Promise<PreferenciasUsuario> {
  const actual = await leerPreferencias(username);
  const { [dashboardKey]: _quitado, ...resto } = actual;
  const { repo, branch } = repoConfig();
  const path = rutaPreferencias(username);
  const sha = await currentSha(path);
  if (!sha) return resto;
  const content = Buffer.from(JSON.stringify(resto, null, 2), "utf-8").toString("base64");
  const res = await githubRequest(`/repos/${repo}/contents/${path}`, {
    method: "PUT",
    body: JSON.stringify({
      message: `preferences(${username}): volver a mostrar todo en ${dashboardKey}`,
      content,
      branch,
      sha,
    }),
  });
  if (!res.ok) {
    throw new Error(`No pude escribir ${path}: ${res.status} ${await res.text()}`);
  }
  return resto;
}
