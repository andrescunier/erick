# Corre el sync de opentransit y lo publica en el dashboard via API
# (POST /api/dashboards/{user}/{project}). Ya no toca git: el commit lo hace
# el propio endpoint en GitHub. Ver AGENTS.md, "Como se actualiza el
# dashboard".
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

foreach ($variable in @("ERICK_API_URL", "ERICK_API_KEY")) {
    if (-not (Get-Item "env:$variable" -ErrorAction SilentlyContinue)) {
        Write-Error "Falta la variable de entorno $variable. Configurala una vez con: setx $variable ""<valor>"""
        exit 1
    }
}

py scripts\sincronizar_resumen.py
exit $LASTEXITCODE
