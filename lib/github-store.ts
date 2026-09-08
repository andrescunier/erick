/**
 * Guarda y lee los datos de cada dashboard como archivos JSON commiteados en
 * este mismo repo de GitHub, usando la Contents API. No hay base de datos:
 * el archivo en `data/dashboards/<user>/<project>.json` es la fuente de
 * verdad, y cada escritura es un commit normal. Se elige esto en vez de un
 * producto de storage de Vercel para no atar el proyecto a esa plataforma —
 * el dato queda portable en git, con historial gratis via `git log`.
 */

const GITHUB_API = "https://api.github.com";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

function repoConfig() {
  return {
    repo: env("GITHUB_REPO"), // "owner/name"
    branch: process.env.GITHUB_BRANCH || "master",
    token: env("GITHUB_TOKEN"),
  };
}

function dashboardPath(user: string, project: string): string {
  return `data/dashboards/${user}/${project}.json`;
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

export type DashboardRef = { user: string; project: string };

export async function getDashboard(
  user: string,
  project: string
): Promise<Record<string, unknown> | null> {
  const { repo, branch } = repoConfig();
  const path = dashboardPath(user, project);
  const res = await githubRequest(
    `/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`No pude leer ${path}: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { content: string; encoding: string };
  const raw = Buffer.from(body.content, "base64").toString("utf-8");
  return JSON.parse(raw);
}

export async function listDashboards(): Promise<DashboardRef[]> {
  const { repo, branch } = repoConfig();
  const usersRes = await githubRequest(
    `/repos/${repo}/contents/data/dashboards?ref=${encodeURIComponent(branch)}`
  );
  if (usersRes.status === 404) return [];
  if (!usersRes.ok) {
    throw new Error(`No pude listar data/dashboards: ${usersRes.status}`);
  }
  const userEntries = (await usersRes.json()) as { name: string; type: string }[];
  const refs: DashboardRef[] = [];

  for (const entry of userEntries) {
    if (entry.type !== "dir") continue;
    const projectsRes = await githubRequest(
      `/repos/${repo}/contents/data/dashboards/${entry.name}?ref=${encodeURIComponent(
        branch
      )}`
    );
    if (!projectsRes.ok) continue;
    const projectEntries = (await projectsRes.json()) as { name: string; type: string }[];
    for (const project of projectEntries) {
      if (project.type !== "file" || !project.name.endsWith(".json")) continue;
      refs.push({ user: entry.name, project: project.name.replace(/\.json$/, "") });
    }
  }

  return refs;
}

async function currentSha(path: string): Promise<string | undefined> {
  const { repo, branch } = repoConfig();
  const res = await githubRequest(
    `/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`
  );
  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`No pude verificar ${path}: ${res.status}`);
  const body = (await res.json()) as { sha: string };
  return body.sha;
}

async function writeDashboard(
  user: string,
  project: string,
  data: Record<string, unknown>,
  message: string
): Promise<void> {
  const { repo, branch } = repoConfig();
  const path = dashboardPath(user, project);
  const sha = await currentSha(path);
  const content = Buffer.from(JSON.stringify(data, null, 2), "utf-8").toString("base64");

  const res = await githubRequest(`/repos/${repo}/contents/${path}`, {
    method: "PUT",
    body: JSON.stringify({
      message,
      content,
      branch,
      ...(sha ? { sha } : {}),
    }),
  });

  if (!res.ok) {
    throw new Error(`No pude escribir ${path}: ${res.status} ${await res.text()}`);
  }
}

export async function replaceDashboard(
  user: string,
  project: string,
  data: Record<string, unknown>
): Promise<void> {
  await writeDashboard(user, project, data, `dashboard(${user}/${project}): reemplazo via API`);
}

export async function mergeDashboard(
  user: string,
  project: string,
  patch: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const actual = (await getDashboard(user, project)) ?? {};
  const combinado = { ...actual, ...patch };
  await writeDashboard(user, project, combinado, `dashboard(${user}/${project}): patch via API`);
  return combinado;
}

export async function deleteDashboard(user: string, project: string): Promise<boolean> {
  const { repo, branch } = repoConfig();
  const path = dashboardPath(user, project);
  const sha = await currentSha(path);
  if (!sha) return false;
  const res = await githubRequest(`/repos/${repo}/contents/${path}`, {
    method: "DELETE",
    body: JSON.stringify({
      message: `dashboard(${user}/${project}): borrado via API`,
      sha,
      branch,
    }),
  });
  if (!res.ok) {
    throw new Error(`No pude borrar ${path}: ${res.status} ${await res.text()}`);
  }
  return true;
}
