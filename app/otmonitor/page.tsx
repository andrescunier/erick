import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * La pantalla vive en la ruta canonica /leandro/otmonitor -la misma a la que
 * apuntan los links del listado de dashboards y el centro de control-, asi
 * que aca solo queda la redireccion para que un link viejo a /otmonitor siga
 * funcionando. Tener la pantalla en dos URLs distintas fue justamente el
 * problema original: la navegacion normal caia en el renderizador generico.
 */
export default function OTMonitorAlias() {
  redirect("/leandro/otmonitor");
}
