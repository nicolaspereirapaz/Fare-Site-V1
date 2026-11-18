# Chamado pela tarefa agendada "FareFoto Backup" (a cada 3 horas: 00, 03, 06 ... 21 h). Log em C:\FareFoto\logs\backup.log.
$log = "C:\FareFoto\logs\backup.log"
& "C:\Program Files\nodejs\node.exe" --no-warnings C:\FareFoto\backup\backup-dados.mjs *>> $log
if ($LASTEXITCODE -ne 0) { Add-Content $log "$(Get-Date -Format s) BACKUP FALHOU (codigo $LASTEXITCODE)" }
