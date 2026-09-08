param([ValidateRange(1,60)][int]$Minutos = 5)
$ErrorActionPreference = "Stop"
$scriptPath = Join-Path $PSScriptRoot 'sincronizar_control.ps1'
if (-not (Test-Path -LiteralPath $scriptPath)) { throw "No existe $scriptPath" }
# Frecuencia incluida en el entorno del proceso para el estado publicado.
$arguments = '-NoProfile -NonInteractive -WindowStyle Hidden -Command "' + '$env:ERICK_SYNC_SECONDS=''' + ($Minutos * 60) + '''; & ''' + $scriptPath + '''"'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $Minutos)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'Erick Control Sync' -TaskPath '\andybot\' -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Publica agregados de transporte y emisión; no ejecuta consultas ni notifica.' -Force | Out-Null
Start-ScheduledTask -TaskPath '\andybot\' -TaskName 'Erick Control Sync'
Write-Output "Sincronización registrada cada $Minutos minutos mientras la sesión de Windows esté abierta."
