# Centro de control

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
