/**
 * Autenticación de máquina a máquina para /api/dashboards/*: un solo API key
 * fijo (INGEST_API_KEY), sin login de usuario. Si la variable no está
 * configurada, se rechaza todo (fail closed) en vez de dejar la API abierta
 * por un olvido de configuración.
 */

export function checkApiKey(req: Request): Response | null {
  const expected = process.env.INGEST_API_KEY;
  if (!expected) {
    return Response.json(
      { error: "INGEST_API_KEY no está configurada en el servidor." },
      { status: 500 }
    );
  }

  const header = req.headers.get("authorization") ?? "";
  const provisto = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (provisto !== expected) {
    return Response.json({ error: "API key inválida o ausente." }, { status: 401 });
  }

  return null;
}
