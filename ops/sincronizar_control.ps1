$ErrorActionPreference = "Stop"
$workspace = Split-Path -Parent $PSScriptRoot
Set-Location $workspace
$stateDirectory = Join-Path $workspace '.sync'
New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null
$logPath = Join-Path $stateDirectory 'sync.log'
if ((Test-Path -LiteralPath $logPath) -and (Get-Item -LiteralPath $logPath).Length -gt 2MB) {
    Move-Item -LiteralPath $logPath -Destination (Join-Path $stateDirectory 'sync.previous.log') -Force
}
& 'C:\Program Files\nodejs\node.exe' scripts\sincronizar_control.cjs --scheduled >> $logPath 2>&1
exit $LASTEXITCODE
