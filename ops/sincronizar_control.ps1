$ErrorActionPreference = "Stop"
$workspace = Split-Path -Parent $PSScriptRoot
Set-Location $workspace
$stateDirectory = Join-Path $workspace '.sync'
New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null
$logPath = Join-Path $stateDirectory 'sync.log'
if ((Test-Path -LiteralPath $logPath) -and (Get-Item -LiteralPath $logPath).Length -gt 2MB) {
    # Antes esto pisaba siempre 'sync.previous.log', así que cada rotación borraba el
    # historial de la rotación anterior (ventana útil de un día o dos). Ahora cada backup
    # queda con su propia fecha para poder mirar varios días atrás, y se purgan los más
    # viejos para no acumular archivos sin límite.
    $backupName = 'sync.{0}.log' -f (Get-Date -Format 'yyyyMMdd_HHmmss')
    Move-Item -LiteralPath $logPath -Destination (Join-Path $stateDirectory $backupName) -Force
    try {
        Get-ChildItem -LiteralPath $stateDirectory -File -ErrorAction Stop |
            Where-Object { $_.Name -match '^sync\.\d{8}_\d{6}\.log$' } |
            Sort-Object LastWriteTime -Descending |
            Select-Object -Skip 15 |
            Remove-Item -Force -ErrorAction Stop
    } catch {
        # La purga es best-effort: si falla (permisos, archivo en uso, etc.) no debe
        # interrumpir la sincronización real que sigue después de este bloque.
    }
}
$node = if ($env:NODE_BIN) { $env:NODE_BIN } else {
    $enPath = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($enPath) { $enPath.Source } else { 'C:\Program Files\nodejs\node.exe' }
}
& $node scripts\sincronizar_control.cjs --scheduled >> $logPath 2>&1
exit $LASTEXITCODE
