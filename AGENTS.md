# Erick

## Ampliación analítica (septiembre 2026)

El sync ahora agrega `_analytics` con históricos de CSV de BI de opentransit y
las últimas fotos CSV de AlarmBot. `components/AnalyticsDashboard.tsx` permite
filtrar, graficar y exportar esos datasets mediante un contrato genérico en
`lib/analytics.ts`. Ver [docs/ANALYTICS.md](docs/ANALYTICS.md) para fuentes,
semántica, pruebas y vista previa local sin publicar.

Esto reemplaza la exclusión de gráficos temporales y de desgloses que figura
más abajo: el historial proviene de los CSV ya acumulados, no de sumar POSTs.
La lectura de GitHub usa contenido raw para soportar JSON mayores a 1 MB.

Emisión se publica por separado en `leandro/emision` con
`scripts/sincronizar_emision.py`. Lee eventos de Leandro y reutiliza su catálogo;
deduplica notificaciones y entidades antes de agregar. No mezcla monedas ni
publica datos personales. Ver [docs/EMISION.md](docs/EMISION.md) para la
diferencia entre actividad recibida, operaciones y tarjetas/cuentas observadas.

Dashboard genérico en Vercel: cada proyecto/usuario tiene su propio JSON,
cargado por API (`POST`/`PATCH`), y la pantalla se arma sola según la forma
de esos datos — no hay un esquema fijo tipo "tabla de tenants" hardcodeado.
La primera fuente real es `opentransit` (montos por tenant, taps,
validadores), pero cualquier otro proyecto puede empujar su propio dashboard
a su propia URL sin tocar código.

## Por qué esta arquitectura y no otra

Vercel aloja el frontend; los datos se generan en otra máquina (hoy, la
Windows donde corre `opentransit`, que es 100% basado en archivos — no tiene
base de datos ni API HTTP propia, ver `docs/API.md` de ese repo). Se
necesitaba una forma de llevar esos datos a Vercel sin (a) depender de que
esa máquina esté prendida y expuesta para que Vercel le pida datos en vivo, y
(b) sin sumar un producto de storage propietario de Vercel (Blob/KV/Postgres)
que ataría el proyecto a esa plataforma.

La solución: **push, no pull**. Quien tiene el dato lo empuja por API
(`POST`/`PATCH /api/dashboards/{user}/{project}`), y el propio endpoint lo
persiste como un archivo JSON commiteado en este mismo repo de GitHub (via la
Contents API — ver `lib/github-store.ts`). No hay base de datos: el archivo
en `data/dashboards/{user}/{project}.json` es la fuente de verdad, con
historial gratis vía `git log`. Las lecturas (la página del dashboard) también
van contra la API de GitHub en cada visita, así que un dato nuevo se ve
al toque — no hace falta esperar un redeploy de Vercel.

## Autenticación

Un solo secreto fijo, `INGEST_API_KEY`, cargado como variable de entorno en
Vercel. Cualquier `POST`/`PATCH`/`DELETE`/`GET` a `/api/dashboards/*` tiene
que mandar `Authorization: Bearer <esa key>` — si no matchea, `401`. No hay
login de usuario ni formulario: es autenticación máquina a máquina, pensada
para que la use un script (`scripts/sincronizar_resumen.py`) o cualquier otro
proceso que quiera publicar un dashboard. Si `INGEST_API_KEY` no está
configurada, la API rechaza todo (fail closed) en vez de quedar abierta por
un olvido.

Ver la página del dashboard en el navegador es otro mecanismo, separado del
API key: `middleware.ts` exige una cookie de sesión válida y si no la hay
redirige a `/login`, una pantalla propia con el estilo del dashboard. Se
empezó con Basic Auth (el cartel nativo del navegador) y se cambió porque es
feo y no se puede personalizar.

La sesión no necesita base de datos ni store: la cookie guarda
`sha256(VIEWER_USER:VIEWER_PASSWORD:erick-session)` (ver `lib/session.ts`),
así el middleware recalcula el mismo valor desde las variables de entorno y
compara. Consecuencia a tener en cuenta: cambiar `VIEWER_PASSWORD` invalida
todas las sesiones abiertas, que es justo lo que uno quiere. Se usa Web
Crypto (`crypto.subtle`) y no `crypto`/`Buffer` de Node porque el middleware
corre en el runtime Edge, donde esos no existen.

`/api/*` queda afuera de esta puerta: esas rutas usan `INGEST_API_KEY`, no
tiene sentido mandar a un script a una pantalla de login.

Es intencionalmente un solo usuario compartido, no un sistema de cuentas —
si más adelante hace falta más de un viewer con permisos distintos, ahí
conviene pasar a algo real (NextAuth, Clerk, etc.), no antes.

## Cómo se publica un dashboard

```
POST https://<tu-deploy>.vercel.app/api/dashboards/{user}/{project}
Authorization: Bearer <INGEST_API_KEY>
Content-Type: application/json

{ ...cualquier JSON... }
```

- `POST` reemplaza el dashboard entero.
- `PATCH` mergea (shallow, a nivel de las claves de primer nivel) sobre lo
  que ya había.
- `GET` devuelve el JSON tal cual está guardado.
- `DELETE` lo borra.
- `GET /api/dashboards` lista todos los `{user, project}` existentes.

El caso real hoy es `opentransit`:

```
powershell ops\sincronizar_y_publicar.ps1
```

Corre `scripts/sincronizar_resumen.py`, que junta el último
`business_summary.json` de cada tenant y hace el `POST` a
`opentransit/resumen`. Necesita `ERICK_API_URL` y `ERICK_API_KEY` en el
entorno (`setx` una vez, o Task Scheduler). Ya no toca git.

## Cómo se arma la pantalla sola (`lib/dashboard-shape.ts`)

Dado el JSON de un dashboard, se detecta:

1. **Meta**: los campos escalares de primer nivel (strings/números/booleanos)
   → se muestran como una tira arriba (ej. `generado_en`).
2. **Colección principal**: el primer campo que sea un array de objetos, o un
   objeto cuyos valores sean todos objetos (ej. `tenants: {...}`) → se
   convierte en la tabla central.
3. **Columnas**: se infieren del nombre del campo — `*_cents` es plata
   (formateada ARS), `*_pct`/`*variation*` es porcentaje (con color según
   signo), el resto de los números son cuentas, los strings son texto.
4. **Ventanas de comparación**: un campo cuyo valor es un mapa de objetos que
   a su vez tienen un `*_pct` (como `comparison_windows: {"1d": {...}}`) se
   detecta como tal y sale como columnas extra (`Var 1d`, `Var 7d`, ...), sin
   que el nombre `comparison_windows` esté hardcodeado en ningún lado.
5. **Tarjetas**: se suman las primeras columnas numéricas relevantes.
6. **Lo que no entra en ninguna regla** queda en un `<details>` con el JSON
   crudo, así nunca se pierde información aunque la heurística no la
   reconozca.

Esto es deliberadamente simple (reglas por nombre/tipo, no inferencia real):
si un proyecto nuevo manda una forma muy distinta, probablemente termine
mayormente en el fallback de JSON crudo hasta que se ajusten las heurísticas
o se le agregue una regla nueva.

## Variables de entorno (Vercel)

Ver `.env.example`. Hacen falta `INGEST_API_KEY`, `GITHUB_TOKEN` (fine-grained
PAT, scope "Contents: read and write" solo sobre este repo) y `GITHUB_REPO`.

## Correr en local

```
npm install
npm run dev        # http://localhost:3000
```

Necesita las mismas variables de entorno que Vercel (`.env` local, ver
`.env.example`) para poder leer/escribir contra GitHub.

## Estructura

```
app/
  page.tsx                          lista de dashboards (usuario -> proyectos)
  [user]/[project]/page.tsx         el dashboard, auto-armado
  api/dashboards/route.ts           GET: listar todos
  api/dashboards/[user]/[project]/  GET/POST/PATCH/DELETE de un dashboard
lib/
  github-store.ts                   leer/escribir JSON como archivos en GitHub
  auth.ts                           chequeo del API key
  dashboard-shape.ts                heurísticas de "cómo se arma solo"
  format.ts                         plata/número/porcentaje
components/
  AutoDashboard.tsx                 arma tarjetas + tabla + fallback JSON
data/dashboards/{user}/{project}.json   un archivo por dashboard (lo escribe la API)
scripts/
  sincronizar_resumen.py            opentransit -> POST a la API
ops/
  sincronizar_y_publicar.ps1        corre el sync
```

## Explícitamente fuera de esta versión

- Más de un usuario/rol para ver el dashboard (hoy es un solo usuario
  compartido vía Basic Auth). Ver sección "Autenticación" arriba.
- Gráficos de tendencia en el tiempo: cada `POST` reemplaza el dashboard
  entero, no se guarda histórico. Si hace falta ver una serie temporal, hay
  que decidir primero cómo se acumula (¿un archivo por fecha? ¿un array
  dentro del mismo JSON?).
- Cualquier desglose fino de opentransit (`by_issuer`, `by_brand`, `by_line`,
  `by_payment_type`): el sync los descarta a propósito. Agregarlos cuando
  haya un dashboard que los use — las heurísticas de `dashboard-shape.ts`
  deberían bancarlos sin cambios si vienen como array de objetos u objeto de
  objetos.
