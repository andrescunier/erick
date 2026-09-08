# Erick

Dashboard de datos diarios de `opentransit`, pensado para vivir en Vercel.
Primera versión: una tabla por tenant (monto procesado, taps, validadores
activos, tarjetas únicas, variación 1d/7d/30d) — lo que ya calcula
`opentransit` en `business_summary.json`, sin agregar análisis nuevo.

## Por qué esta arquitectura y no otra

Vercel aloja el frontend en la nube; los datos de tránsito viven en esta
máquina Windows (local o tailnet), sin ninguna base de datos en la nube
conectada todavía. La solución más simple que funciona hoy sin depender de
exponer esta máquina a internet ni de dar de alta un servicio nuevo:

1. Un script local (`scripts/sincronizar_resumen.py`) lee el último
   `business_summary.json` de cada tenant desde
   `C:\andybot\opentransit\emova\tenants\artifacts\`, y escribe un solo
   consolidado en `data/resumen.json`.
2. Ese archivo se commitea al repo de git.
3. Vercel está conectado a ese repo: cada push a la rama de producción
   dispara un redeploy, y el dashboard (que importa `data/resumen.json`
   directamente en build time) sale con el dato nuevo.

Es decir: **el dashboard no le pide nada a nadie en vivo** — lee un JSON que
ya viene adentro del build. Esto cambia el día que haga falta actualizar más
seguido que "cada vez que alguien corre el sync a mano": ahí conviene una
base de datos real (Vercel Postgres, Supabase) y una API route que la
consulte, en vez de este archivo commiteado.

## Cómo se actualiza el dashboard

```
powershell ops\sincronizar_y_publicar.ps1
```

Corre el sync, commitea `data/resumen.json` si cambió, y hace `git push`. Sin
un remoto configurado, el commit queda local y el script avisa que el push
falló — no rompe nada, pero tampoco llega a Vercel hasta que se configure.

## Lo que falta para que esto quede publicado de verdad (pasos que tenés que hacer vos)

1. `git init` en esta carpeta si todavía no es un repo (ver más abajo).
2. Crear un repo en GitHub y agregarlo como remoto (`git remote add origin ...`).
3. En Vercel: "Add New Project" → importar ese repo de GitHub. Vercel detecta
   Next.js solo, no hace falta configurar nada más.
4. Correr `ops\sincronizar_y_publicar.ps1` para el primer push real.
5. Decidir cada cuánto correr el sync (¿una tarea programada diaria, como el
   resto del ecosistema? ¿a mano por ahora?) — no se armó ninguna tarea
   todavía porque no se definió la cadencia.

## Correr en local

```
npm install
npm run dev        # http://localhost:3000
```

## Estructura

```
app/
  layout.tsx / page.tsx / globals.css    el dashboard (Next.js App Router)
data/
  resumen.json                            snapshot commiteado, lo regenera el sync
scripts/
  sincronizar_resumen.py                  opentransit -> data/resumen.json
ops/
  sincronizar_y_publicar.ps1               sync + commit + push
```

## Explícitamente fuera de esta primera versión

- Fetch en vivo contra una API (Leandro, AlarmBot, o lo que sea): hoy es todo
  estático, generado en build time.
- Gráficos — por ahora es una tabla. Si hace falta ver una tendencia en el
  tiempo (no solo el snapshot del último día), hay que decidir primero si el
  sync guarda histórico o solo pisa el último — hoy pisa.
- Cualquier desglose fino (`by_issuer`, `by_brand`, `by_line`,
  `by_payment_type`): el sync los descarta a propósito para mantener el JSON
  chico. Agregarlos cuando haya una pantalla que los use.
- Autenticación en el dashboard: si esto va a Vercel público, cualquiera con
  el link ve los montos por tenant. Agregar auth de Vercel (o hacerlo privado)
  antes de compartir la URL ampliamente.
