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

Dos mecanismos separados, para dos consumidores distintos.

**Scripts y procesos (`/api/dashboards/*`, `/api/control`)**: un solo secreto
fijo, `INGEST_API_KEY`, cargado como variable de entorno en Vercel. Cualquier
`POST`/`PATCH`/`DELETE`/`GET` tiene que mandar `Authorization: Bearer <esa
key>` — si no matchea, `401` (`lib/auth.ts`, `checkApiKey`). Pensado para que
lo use un script (`scripts/sincronizar_resumen.py`, `transport_business.py`,
etc.), no una persona. Si `INGEST_API_KEY` no está configurada, la API
rechaza todo (fail closed) en vez de quedar abierta por un olvido.

**Personas viendo el dashboard en el navegador**: multi-usuario real, con
permisos por proyecto. `data/users.json` (leído/escrito vía GitHub Contents
API, mismo patrón que los dashboards — ver `lib/user-store.ts`) guarda por
usuario un `password_hash`, una lista `allowed` de patrones tipo
`"opentransit/*"` o `"*"`, y un flag `admin`. Al loguearse (`/api/login`) se
emite una cookie de sesión (`erick_session`, ver `lib/session.ts`) con el
username, los patrones permitidos y una firma HMAC-SHA256 — el middleware
valida la firma sin volver a pegarle a GitHub en cada request. `puedeVer()`
en `lib/session.ts` es la función que decide, dado un patrón de la sesión y
un `{user}/{project}`, si esa persona puede ver ese dashboard puntual. Un
usuario `admin: true` puede gestionar el resto vía `/api/users`
(`lib/admin-auth.ts`, que acepta tanto `INGEST_API_KEY` como una sesión de
admin — así el propio panel de administración puede llamar a la misma API
que un script). Se usa Web Crypto (`crypto.subtle`) y no `crypto`/`Buffer` de
Node porque el middleware corre en el runtime Edge.

`SESSION_SECRET` (o, si no está, el propio `INGEST_API_KEY`) es lo que firma
las sesiones — cambiarlo invalida todas las sesiones abiertas.

## Principio: reusar antes que reconstruir

Todo dato nuevo que entra a un dashboard tiene que salir de una de estas dos
fuentes — nunca de una conexión a base de datos nueva ni de reimplementar acá
una lógica de negocio que ya existe en otro proyecto del workspace:

1. **Un artifact que el proyecto dueño ya publica.** `scripts/sincronizar_resumen.py`
   junta el `business_summary.json` que opentransit ya calculó y lo empuja tal
   cual — no recalcula recaudación ni taps.
2. **La API que el proyecto dueño ya expone.** `scripts/transport_business.py`
   y `scripts/trip_baseline.py` piden datos a AlarmBot vía
   `POST {ERICK_ALARMBOT_URL}/api/queries/execute` (ver `fetch_query` en
   `transport_business.py`) en vez de conectarse directo a SQL Server o
   PostgreSQL desde acá.

Si un dato que hace falta no existe todavía como artifact ni como endpoint en
el proyecto dueño, el paso siguiente es pedir que lo exponga ahí — no armar
un atajo propio en erick que termine siendo la única fuente de esa lógica.

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
  login/, admin/                    login propio y panel de gestión de usuarios
  api/dashboards/route.ts           GET: listar todos
  api/dashboards/[user]/[project]/  GET/POST/PATCH/DELETE de un dashboard
  api/users/                        alta/baja/edición de usuarios (solo admin)
  api/preferences/                  qué widgets ve cada persona por dashboard (sesión propia)
  api/login/, api/logout/           sesión de personas
lib/
  github-store.ts                   leer/escribir JSON de dashboards como archivos en GitHub
  user-store.ts                     idem, para data/users.json
  preferences-store.ts              idem, para data/preferences/{username}.json
  auth.ts                           chequeo de INGEST_API_KEY (scripts)
  session.ts                        cookie de sesión firmada + puedeVer() + sesionDesdeRequest() (personas)
  admin-auth.ts                     autorización de /api/users (API key o sesión admin)
  dashboard-shape.ts                heurísticas de "cómo se arma solo" + aplicarPreferencia()
  analytics.ts                      contrato genérico de AnalyticsDashboard
  format.ts                         plata/número/porcentaje
components/
  AutoDashboard.tsx, BusinessDashboard.tsx, AnalyticsDashboard.tsx, ControlCenter.tsx
  WidgetPicker.tsx                  elegir qué columnas/tarjetas mostrar (client component)
data/
  dashboards/{user}/{project}.json  un archivo por dashboard (lo escribe la API)
  users.json                        usuarios, password_hash, allowed, admin
  preferences/{username}.json       por persona: columnas habilitadas por dashboard que ve
scripts/
  sincronizar_resumen.py            opentransit (artifact ya publicado) -> POST a la API
  transport_business.py            AlarmBot (API /api/queries/execute) -> snapshot
  trip_baseline.py                 idem, histórico horario de referencia
  sincronizar_emision.py           leandro/eventos -> POST a la API
ops/
  sincronizar_y_publicar.ps1, registrar_control.ps1   corren los syncs / registran la tarea
```

## Preferencia por widget (2026-09-12)

Además del permiso por proyecto entero (`allowed`), cada persona puede elegir
QUÉ columnas/tarjetas ver de un dashboard al que ya tiene acceso. Se guarda en
`data/preferences/{username}.json`, una entrada por `{user}/{project}` con la
lista de `Columna.key`/`StatCard.key` habilitadas (ver `dashboard-shape.ts`).

Sin entrada para un dashboard, se muestra todo — la ausencia de preferencia es
"no filtrar", nunca "ocultar todo", así que nadie pierde widgets por no haber
configurado nada. `AutoDashboard` calcula la forma completa, la filtra con
`aplicarPreferencia()`, y muestra el botón "Personalizar widgets"
(`WidgetPicker.tsx`) que lee/escribe contra `/api/preferences` con la cookie
de sesión propia — no `INGEST_API_KEY`, esa ruta es la única bajo `/api/*`
que autentica a una persona y no a un script. La tarjeta "Registros" nunca se
filtra: es un conteo estructural, no una métrica de negocio.

## Explícitamente fuera de esta versión

- Gráficos de tendencia en el tiempo: cada `POST` reemplaza el dashboard
  entero, no se guarda histórico. Si hace falta ver una serie temporal, hay
  que decidir primero cómo se acumula (¿un archivo por fecha? ¿un array
  dentro del mismo JSON?).
- Cualquier desglose fino de opentransit (`by_issuer`, `by_brand`, `by_line`,
  `by_payment_type`): el sync los descarta a propósito. Agregarlos cuando
  haya un dashboard que los use — las heurísticas de `dashboard-shape.ts`
  deberían bancarlos sin cambios si vienen como array de objetos u objeto de
  objetos.
