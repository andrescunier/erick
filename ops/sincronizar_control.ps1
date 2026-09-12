$ErrorActionPreference = "Stop"
$workspace = Split-Path -Parent $PSScriptRoot
Set-Location $workspace
$stateDirectory = Join-Path $workspace '.sync'
New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null
$logPath = Join-Path $stateDirectory 'sync.log'
if ((Test-Path -LiteralPath $logPath) -and (Get-Item -LiteralPath $logPath).Length -gt 2MB) {
    Move-Item -LiteralPath $logPath -Destination (Join-Path $stateDirectory 'sync.previous.log') -Force
}
$node = if ($env:NODE_BIN) { $env:NODE_BIN } else {
    $enPath = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($enPath) { $enPath.Source } else { 'C:\Program Files\nodejs\node.exe' }
}
& $node scripts\sincronizar_control.cjs --scheduled >> $logPath 2>&1
exit $LASTEXITCODE
