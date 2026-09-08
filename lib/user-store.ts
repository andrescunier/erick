/**
 * Store de usuarios en GitHub (data/users.json). Mismo patrón que
 * github-store.ts: el archivo JSON es la fuente de verdad.
 *
 * Cada usuario tiene: username, password_hash, allowed (dashboards que puede
 * ver), admin (puede gestionar usuarios).
 */

const GITHUB_API = "https://api.github.com";
const USERS_PATH = "data/users.json";

export type Usuario = {
  username: string;
  password_hash: string;
  allowed: string[];
  admin: boolean;
};

export type UsersData = {
  users: Usuario[];
};

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

async function readUsersFile(): Promise<{ data: UsersData; sha: string | undefined }> {
  const { repo, branch } = repoConfig();
  const res = await githubRequest(
    `/repos/${repo}/contents/${USERS_PATH}?ref=${encodeURIComponent(branch)}`
  );
  if (res.status === 404) {
    return { data: { users: [] }, sha: undefined };
  }
  if (!res.ok) {
    throw new Error(`No pude leer ${USERS_PATH}: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { content: string; encoding: string; sha: string };
  const raw = Buffer.from(body.content, "base64").toString("utf-8");
  return { data: JSON.parse(raw), sha: body.sha };
}

async function writeUsersFile(data: UsersData, sha: string | undefined, message: string): Promise<void> {
  const { repo, branch } = repoConfig();
  const content = Buffer.from(JSON.stringify(data, null, 2), "utf-8").toString("base64");
  const res = await githubRequest(`/repos/${repo}/contents/${USERS_PATH}`, {
    method: "PUT",
    body: JSON.stringify({
      message,
      content,
      branch,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) {
    throw new Error(`No pude escribir ${USERS_PATH}: ${res.status} ${await res.text()}`);
  }
}

export async function listarUsuarios(): Promise<Usuario[]> {
  const { data } = await readUsersFile();
  return data.users;
}

export async function obtenerUsuario(username: string): Promise<Usuario | null> {
  const { data } = await readUsersFile();
  return data.users.find((u) => u.username === username) ?? null;
}

export async function crearUsuario(usuario: Omit<Usuario, "username"> & { username: string }): Promise<Usuario> {
  const { data, sha } = await readUsersFile();
  if (data.users.some((u) => u.username === usuario.username)) {
    throw new Error(`Ya existe un usuario "${usuario.username}".`);
  }
  data.users.push(usuario);
  data.users.sort((a, b) => a.username.localeCompare(b.username));
  await writeUsersFile(data, sha, `users: crear ${usuario.username}`);
  return usuario;
}

export async function actualizarUsuario(
  username: string,
  patch: Partial<Pick<Usuario, "password_hash" | "allowed" | "admin">>
): Promise<Usuario | null> {
  const { data, sha } = await readUsersFile();
  const idx = data.users.findIndex((u) => u.username === username);
  if (idx === -1) return null;
  if (patch.password_hash !== undefined) data.users[idx].password_hash = patch.password_hash;
  if (patch.allowed !== undefined) data.users[idx].allowed = patch.allowed;
  if (patch.admin !== undefined) data.users[idx].admin = patch.admin;
  await writeUsersFile(data, sha, `users: actualizar ${username}`);
  return data.users[idx];
}

export async function borrarUsuario(username: string): Promise<boolean> {
  const { data, sha } = await readUsersFile();
  const idx = data.users.findIndex((u) => u.username === username);
  if (idx === -1) return false;
  data.users.splice(idx, 1);
  await writeUsersFile(data, sha, `users: borrar ${username}`);
  return true;
}
