# Roda NO ORACULO depois de copiar o pacote para C:\FareFoto\app-novo.tgz (ver README.md).
$ErrorActionPreference = "Stop"
Set-Location C:\FareFoto
# 1. Para o site (a tarefa e o node do site).
schtasks /End /TN "FareFoto Site" | Out-Null
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'server\.js' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" | Where-Object { $_.CommandLine -match 'iniciar-site' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-Sleep 2
# 1b. Backup dos bancos (site parado = arquivos consistentes).
$stamp = Get-Date -Format "yyyyMMdd-HHmm"
$bk = "C:\FareFoto\backups\antes-deploy-$stamp"
New-Item -ItemType Directory -Force $bk | Out-Null
Copy-Item C:\FareFoto\app\data\*.sqlite* $bk
"backup: $bk ($((Get-ChildItem $bk).Count) arquivos)"
# 2. Troca os arquivos do app, sem tocar em data\ e .env.local.
if (Test-Path C:\FareFoto\novo) { Remove-Item -Recurse -Force C:\FareFoto\novo }
New-Item -ItemType Directory C:\FareFoto\novo | Out-Null
tar -xzf C:\FareFoto\app-novo.tgz -C C:\FareFoto\novo
robocopy C:\FareFoto\novo\app C:\FareFoto\app /MIR /XD data /XF .env.local /NFL /NDL /NJH /NJS /NP | Out-Null
Remove-Item -Recurse -Force C:\FareFoto\novo, C:\FareFoto\app-novo.tgz
"data ainda existe: $(Test-Path C:\FareFoto\app\data\farefoto.sqlite)"
# 3. Pedidos de fotos na pasta da equipe (D:\Digital\DD-MM\...).
$env = 'C:\FareFoto\app\.env.local'
if (-not (Select-String -Path $env -Pattern '^FARE_ORDERS_DIR=' -Quiet)) { Add-Content -Path $env -Value "FARE_ORDERS_DIR=D:\Digital" -Encoding ascii }
"FARE_ORDERS_DIR: $((Select-String -Path $env -Pattern '^FARE_ORDERS_DIR=').Line)"
# 3b. Google Analytics 4 e Meta Pixel (carregam só depois que o visitante aceita os cookies).
Copy-Item $env "$bk\env.local.bak"
$ids = @{ FARE_GA_ID = 'G-09RWJV1TMQ'; FARE_META_PIXEL_ID = '1573158924086279' }
$lines = @(Get-Content $env | Where-Object { $_ -notmatch '^(FARE_GA_ID|FARE_META_PIXEL_ID)=' })
foreach ($k in $ids.Keys) { $lines += "$k=$($ids[$k])" }
Set-Content -Path $env -Value $lines -Encoding ascii
"analytics: $((Select-String -Path $env -Pattern '^(FARE_GA_ID|FARE_META_PIXEL_ID)=').Line -join ' | ')"
# 4. Liga de novo.
schtasks /Run /TN "FareFoto Site" | Out-Null
"site religado"
