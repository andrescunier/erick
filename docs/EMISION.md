# Emisión · Leandro

Dashboard independiente: `/leandro/emision`. Transporte continúa en
`/opentransit/resumen`. Se conserva la arquitectura push: Leandro guarda los
eventos, un script local genera agregados y la API de Erick los persiste en
GitHub. La página nunca depende de que Leandro esté encendido.

## Qué se incorporó

| Vista | Indicadores y filtros |
| --- | --- |
| Operaciones por moneda | Operaciones observadas, aprobadas, rechazadas, pendientes y rechazo sobre resueltas. En ARS, importes aprobados/rechazados. Filtros por distribuidor, tipo, sentido y estado |
| Rechazos | Operaciones rechazadas por código de respuesta, origen, tipo y distribuidor |
| Solicitudes de tarjeta | Solicitudes de titular/adicional, aprobaciones, rechazos, pendientes y tasa de rechazo |
| Tarjetas | Tarjetas distintas con notificaciones y último estado observado, tipo de tarjeta y condición de adicional |
| Cuentas | Cuentas observadas, altas notificadas y último estado observado |
| Préstamos | Solicitudes, aprobaciones, rechazos y pendientes; no se infiere desembolso |
| Actividad | Notificaciones únicas por hora, categoría, tipo, estado y distribuidor; excluye pings |

Todas las vistas usan el explorador genérico con gráficos, ranking, filtros y
exportación CSV. El bloque `_analytics` admite `title` y `notice` opcionales
para que cada dominio nombre su vista y destaque su cobertura.

## Semántica que no se debe perder

Leandro almacena un sobre con `recibido_en`, `tenant` y `evento`. Los eventos
reales vienen en `evento.body` con `id`, `type`, `created` y `data`.

1. Se deduplican notificaciones por `(tenant, body.id)`. Sin ID, se cuenta el
   archivo en actividad y se informa que no fue posible deduplicarlo.
2. Las entidades se identifican por `(tenant, familia del tipo, data.id)`. No
   se usa `rootTransactionNumber`: una operación puede originar movimientos
   diferentes, y no hay que colapsarlos por compartir una raíz.
3. Se elige el último evento por `body.created`, con recepción como respaldo y
   desempate. Un pendiente entregado tarde no revierte un rechazo posterior.
   Sin `data.id`, el evento queda sólo en actividad, no en entidades únicas.
4. Los gráficos de entidades agrupan la recepción del último evento elegido,
   en hora argentina. No reconstruyen un stock histórico ni el estado actual
   de todas las cuentas/tarjetas en BHUB.
5. Tasa de rechazo = rechazadas / (aprobadas + rechazadas) **del filtro**, no
   rechazadas / todas las notificaciones. Pendientes quedan fuera de esa tasa.
6. Los importes son montos brutos informados. No se suman crédito/débito para
   afirmar un saldo, ni se interpretan como liquidación o ingresos netos.
   ARS se convierte de pesos a centavos con Decimal. Otras monedas o moneda
   ausente mantienen conteos, sin mostrarse con el formato ARS de Erick.
7. `Confirmada` de préstamos se normaliza a `Aprobada`. La aprobación de una
   solicitud de tarjeta no prueba fabricación/entrega; `Normal`, `Delivered`
   e `InTransit` se preservan como estados notificados de tarjetas.

Revisado el 2026-09-08: las carpetas contienen un solo día de recepción y todos
los eventos están bajo `sin_tenant`. El distribuidor de
`data.account.holdingAccount` aparece en operaciones, pero no reemplaza al
tenant ni permite inferirlo para otras entidades. Las solicitudes de préstamo
observadas no declaran moneda; sus importes no se incorporan a ARS.

Se reutiliza `leandro/app/catalogo.py` para las categorías. No se consume su
`/resumen` porque combina notificaciones y entidades e incluye datos personales.
No se modifica la API ni la ingesta de Leandro.

## Privacidad y cobertura

Sólo se publican agregados. Los IDs se usan localmente para deduplicar, pero
no salen al JSON. No se publican nombres de personas, números de cuenta,
datos de tarjeta, mensajes de error libres, headers ni payloads del webhook.

El dashboard muestra período, última recepción, días con datos, pings,
duplicados, archivos inválidos y falta de identidades/tenant. Ausencia de
notificaciones no significa actividad cero. La ingesta y la retención de
Leandro determinan qué historia está disponible.

## Uso

```powershell
# Preparar y revisar sin publicar
py scripts/sincronizar_emision.py --output .preview/emision.json
npm run dev
# Abrir /preview?source=emision, con permisos sobre leandro/emision.

# Publicar por la API existente
py scripts/sincronizar_emision.py
# O
powershell ops/sincronizar_emision.ps1
```

Publicación: `ERICK_API_URL` y `ERICK_API_KEY`. Destino fijo
`leandro/emision`, independiente de las variables de transporte
`ERICK_USER`/`ERICK_PROJECT`. No se amplían permisos de viewers automáticamente.

Fuente por defecto: `C:\andybot\leandro\eventos`. Se puede cambiar con
`ERICK_LEANDRO_DIR` o `--eventos`. El catálogo se busca en
`<padre de eventos>/app/catalogo.py`. `--days` define el período desde el día
del sync (30 por defecto). Se necesita volver a ejecutar el sync para actualizar
la copia publicada; no se crea una tarea programada nueva.

Pruebas: `py -B -m unittest discover -s tests -p test_*.py`,
`node tests/analytics.cjs`, `node tests/server.cjs` y `npm run build`.
