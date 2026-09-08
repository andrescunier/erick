export function respuestaError(error: unknown): Response {
  const mensaje = error instanceof Error ? error.message : "Error inesperado.";
  return Response.json({ error: mensaje }, { status: 500 });
}
