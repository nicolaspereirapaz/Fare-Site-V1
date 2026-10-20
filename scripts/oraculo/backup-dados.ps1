# Chamado pela tarefa agendada "FareFoto Backup" (todo dia 03:00). Log em C:\FareFoto\logs\backup.log.
$log = "C:\FareFoto\logs\backup.log"
& "C:\Program Files\nodejs\node.exe" --no-warnings C:\FareFoto\backup\backup-dados.mjs *>> $log
if ($LASTEXITCODE -ne 0) { Add-Content $log "$(Get-Date -Format s) BACKUP FALHOU (codigo $LASTEXITCODE)" }
