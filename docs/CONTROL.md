# Centro de control

## Vista de negocio de transporte

La portada usa Alarmbot para consultar, cada cinco minutos, las 32 bases del
catálogo de buses y EMOVA. `Erick_Transporte_Horario[_Buses]` agrega por hora de
`sam_dt`, `ativo` y `estado`, deduplicando el token dentro de cada ventana diaria
y conservando la última fila. Usa `mtt_log.value` en centavos, sin multiplicarlo
por 100. No cruza pagos uno a muchos ni incorpora datos de pasajeros.

Reglas confirmadas por el responsable: `ativo = 1` indica cobrado; `estado IN
(0,255)` indica viaje/apertura. Los indicadores de cobros y pendientes de viajes
usan esa intersección. El resto queda en el detalle de taps excluidos.

Hoy, ayer y una semana antes se consultan hasta la misma hora/minuto/segundo.
Si una captura falló y se conserva una anterior, la comparación retrocede a la
última hora completa común. “Importe de viajes” compara actividad (cobrados más
pendientes) según los valores conocidos al consultar. “Avance de cobranza” usa
el dataset `transporte_cobranza_capturas`: exige una captura tomada EN cada día,
con no más de diez minutos de diferencia en la hora de corte. No utiliza el
estado actual de ayer como si fuera el de ayer. Sin captura, omite la comparación.
Las capturas comprimidas se conservan en `.sync/transporte/capturas`.

Una consulta exitosa agrega marcadores de cobertura: sólo entonces la ausencia de
filas puede interpretarse como cero. Una consulta fallida conserva su última fecha;
si no tiene captura previa, no muestra total como cero. Los montos faltantes no se
estiman y se informa su cantidad. La API se invoca con `notify: false`, timeout SQL
de 15 segundos y sin datos individuales en la salida.

“Cobros por día” utiliza el desglose de presentación del archivo de Opentransit:
PAID, UNPAID y ZERO, por fecha de proceso. Suma el mes observado, sin proyección;
la variación diaria compara sólo empresas presentes en ambos días. Esta fuente
no se suma a Alarmbot porque representa los mismos viajes con otro corte.

Pruebas: `node tests/business.cjs` y `tests/test_transport_business.py`.

`/control` reúne los proyectos autorizados del usuario. Ofrece curvas, variación
contra el período anterior de igual duración, fechas compartidas y comparación
entre proyectos con valores originales o índice 100. El explorador de cada
proyecto permite comparar con la semana anterior o fechas personalizadas.

Los huecos representan falta de datos, nunca ceros. Las tasas se calculan con
sus denominadores; las variaciones de tasas se expresan en puntos porcentuales.
Las fotos de estado no se presentan como historia de cambios. Si una serie sólo
tiene un día, se muestra un punto y se explica la cobertura insuficiente.

## Actualización

- El navegador consulta `/api/control` cada minuto mientras la pestaña está visible.
- La tarea Windows `\andybot\Erick Control Sync` publica ambos proyectos cada cinco
  minutos. Necesita esta máquina encendida y la sesión Windows abierta.
- Opentransit conserva la cadencia de sus exportaciones diarias, Alarmbot la de
  sus archivos y Leandro la llegada de notificaciones. La sincronización no genera
  nuevas mediciones ni convierte los históricos en datos en tiempo real.
- `_sync.checked_at` indica una publicación correcta y `_sync.cadence_seconds` la
  frecuencia configurada. Cada fuente conserva su fecha propia `updatedAt`.
  Tras dos intervalos sin publicación, el tablero marca sincronización atrasada.

Registrar o cambiar la frecuencia: `powershell -File ops/registrar_control.ps1 -Minutos 5`.
Ejecución manual: `node scripts/sincronizar_control.cjs`.
Estado y registro locales: `.sync/last-run.json` y `.sync/sync.log` (ignorados por Git).
El proceso usa las credenciales de `.env` y la misma ruta de ingesta del servidor,
alojada temporalmente en loopback; no necesita un servidor Next abierto.

La API de lectura del control valida la cookie firmada y filtra permisos antes de
leer archivos. No entrega las credenciales de ingesta al navegador. Un fallo de
una fuente no impide consultar las demás.

`vercel.json` omite builds que sólo cambian JSON de datos: las páginas dinámicas
leen GitHub directamente. Los cambios de código sí generan despliegue.

Validación: `node tests/control.cjs`, suites existentes y `npm run build`.
