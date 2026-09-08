# Analítica desde archivos

El sync publica el resumen habitual y un bloque opcional `_analytics`. Erick
renderiza ese bloque por su contrato, sin identificar proyectos ni tenants en
el frontend. Un JSON sin el bloque válido conserva el dashboard automático.

## Generar y revisar

```powershell
py scripts/sincronizar_resumen.py --output .preview/resumen.json
npm run dev
# Abrir /preview con sesión de viewer. Esta ruta sólo existe en desarrollo.
```

La vista previa lee el archivo local y no escribe en GitHub. `.preview/` está
ignorada por git. El archivo contiene datos reales agregados, no datos ficticios.

```powershell
# Publicar resumen + analítica por la API existente
py scripts/sincronizar_resumen.py
# O usar el wrapper habitual
powershell ops/sincronizar_y_publicar.ps1
```

Necesita `ERICK_API_URL` y `ERICK_API_KEY` para publicar. Por defecto carga los
últimos 30 días respecto del día del sync. `--days 90` amplía la ventana; la
pantalla ofrece filtros sobre los datos efectivamente publicados, no pide más
historia al servidor. Las fuentes se pueden cambiar con `ERICK_BI_DIR` y
`ERICK_ALARMBOT_DIR`. Las rutas por defecto están en el script.

## Fuentes verificadas

| Vista | Archivo | Interpretación |
| --- | --- | --- |
| Recaudación y viajes | `datos_bi/resumen_diario.csv` | Monto procesado, taps, transacciones; ticket ponderado = suma de montos / suma de taps |
| Presentación | `detalle_estados.csv`, PRESENTACION | UNPAID sin cobrar, porcentaje sobre el monto filtrado, cantidad e importe por estado |
| Estados del tap | `detalle_estados.csv`, TAP | Otra clasificación de los mismos viajes; nunca sumar con presentación |
| Marcas | `detalle_marcas.csv` | Cantidad e importe por marca |
| Medios de pago | `detalle_medios_pago.csv` | Cantidad e importe por medio |
| Recuperos | `detalle_recovery.csv` | Importe informado en RECOVERY y desglose MIT/CIT; no implica liquidación bancaria |
| VQR | `detalle_vqr.csv` | Viajes, bruto, neto y proporción de viajes con neto cero |
| Operación buses | último `*_buses_main_control_ativo_48hs_buses.csv` | Registros por base, ativo y hora de `sam_dt` |
| Pendientes EMOVA | último `*_subte_main_control_ativo_48hs_emova.csv` | Sólo registros vinculados a `mtt_tap_confirmation_pend`, estados 0/255 |

Los montos BI están en pesos. El adaptador usa Decimal para convertirlos a
centavos. Las filas se deduplican por fecha, tenant y dimensión usando el último
reproceso del día completo. Ausencias y valores inválidos no se convierten en
ceros. Cada fuente muestra su propia actualización, cobertura y advertencias.

Las fotos de AlarmBot **no se acumulan**: sus ventanas se superponen. Se toma la
última exportación de cada query. La hora está como la informa la base, sin zona
declarada; no se asume que sea hora argentina. Los SQL admiten fechas como
parámetros y el CSV no conserva esos parámetros: el gráfico muestra rango
observado, no garantiza 48 horas completas. Buses y EMOVA usan poblaciones
distintas y no se cruzan por similitud de nombre.

Se revisaron `Emiliano/AGENTS.md`, `emiliano/mcp_negocio.py` y las consultas SQL
de AlarmBot para interpretar los estados. Este dashboard no ejecuta las sondas,
no modifica umbrales de Emiliano y no dispara notificaciones. Tampoco estima
dinero perdido multiplicando estados por un ticket promedio.

## Contrato para otros proyectos

`_analytics = { version: 1, datasets: [...], warnings: string[] }`.
Cada dataset declara `id`, `title`, `description`, `source`, `updatedAt`,
`columns`, `dimensions`, `metrics` y `rows`. `rows` son arrays de celdas en el
orden de `columns`, para no repetir miles de nombres de campos. La columna
`fecha` usa ISO `YYYY-MM-DD` o fecha/hora ISO.

Cada métrica declara `key`, `label`, `format` (`count`, `money_cents`, `percent`
o `variation`). Sin denominador se suma; con `denominator` se calcula
`sum(key) / sum(denominator) * scale`, donde `scale` vale 1 por defecto o 100
para porcentajes. Sólo agregar como sumables magnitudes aditivas. No publicar
conteos diarios de tarjetas únicas como si fueran únicos del mes.

Los filtros actualizan tarjetas, evolución, ranking, tabla y exportación. El
ranking muestra los 12 primeros y permite filtrar tocando una barra. La tabla
está paginada; la descarga incluye todas las filas del filtro, con centavos
explícitos en los nombres de campo.

GitHub se lee con el media type `application/vnd.github.raw+json`, que permite
archivos mayores a 1 MB. Ver [contrato de Contents API](https://docs.github.com/en/rest/repos/contents#get-repository-content).

## Verificación

```powershell
node tests/dashboard-shape.cjs
node tests/analytics.cjs
node tests/server.cjs
py -B -m unittest discover -s tests -p test_*.py
npm run build
```
