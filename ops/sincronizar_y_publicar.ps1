# Corre el sync de opentransit -> data/resumen.json, lo commitea y lo pushea.
# Un push a la rama conectada en Vercel dispara un redeploy automatico: asi es
# como el dashboard se entera de datos nuevos (ver AGENTS.md, "Como se
# actualiza el dashboard").
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

py scripts\sincronizar_resumen.py

git add data\resumen.json

$hayCambios = git status --porcelain data\resumen.json
if (-not $hayCambios) {
    Write-Output "Sin cambios en data/resumen.json, no hay nada que publicar."
    exit 0
}

$momento = Get-Date -Format "yyyy-MM-dd HH:mm"
git commit -m "Actualizar resumen ($momento)" | Out-Null

try {
    git push
    Write-Output "Publicado. Vercel deberia redeployar solo."
} catch {
    Write-Output "Commit local hecho, pero el push fallo (¿hay un remoto 'origin' configurado?): $($_.Exception.Message)"
}
