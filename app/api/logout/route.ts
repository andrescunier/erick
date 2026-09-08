import { COOKIE_SESION } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST() {
  return Response.json(
    { ok: true },
    {
      headers: {
        "Set-Cookie": `${COOKIE_SESION}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
      },
    }
  );
}
