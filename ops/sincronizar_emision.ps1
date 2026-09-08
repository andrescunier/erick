$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)
py scripts\sincronizar_emision.py
exit $LASTEXITCODE
