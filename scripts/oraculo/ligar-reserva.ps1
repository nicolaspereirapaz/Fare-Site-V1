# Roda NO ORACULO quando o Google Cloud parar: liga o site reserva (atendido pelo Cloudflare Tunnel).
# Antes: copiar o pacote novo para C:\FareFoto\app-novo.tgz (opcional) e ter a pasta de dados em $Dados
# (sqlite + mockups + env.local de um backup do servidor, ex.: bancos-AAAA-MM-DD.tgz extraído).
# Guarda cópia de app\data e .env.local antes de trocar. Não apaga nada de D:\Digital.
param([string]$Dados = 'C:\FareFoto\reserva-0611\2026-11-06')
$ErrorActionPreference = 'Stop'
Set-Location C:\FareFoto
# 1. Para o site antigo, se estiver rodando.
schtasks /End /TN "FareFoto Site" 2>$null | Out-Null
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'server\.js' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" | Where-Object { $_.CommandLine -match 'iniciar-site' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-Sleep 2
# 2. Backup do que existe hoje.
$bk = "C:\FareFoto\backups\antes-reserva-$(Get-Date -Format yyyyMMdd-HHmm)"
New-Item -ItemType Directory -Force $bk | Out-Null
Copy-Item -Recurse C:\FareFoto\app\data $bk
Copy-Item C:\FareFoto\app\.env.local "$bk\env.local.bak"
"backup: $bk"
# 3. Código novo (se o pacote foi enviado).
if (Test-Path C:\FareFoto\app-novo.tgz) {
  if (Test-Path C:\FareFoto\novo) { Remove-Item -Recurse -Force C:\FareFoto\novo }
  New-Item -ItemType Directory C:\FareFoto\novo | Out-Null
  tar -xzf C:\FareFoto\app-novo.tgz -C C:\FareFoto\novo
  robocopy C:\FareFoto\novo\app C:\FareFoto\app /MIR /XD data /XF .env.local /NFL /NDL /NJH /NJS /NP | Out-Null
  Remove-Item -Recurse -Force C:\FareFoto\novo, C:\FareFoto\app-novo.tgz
  "codigo novo: $(Get-Content C:\FareFoto\app\.next\BUILD_ID)"
}
# 4. Bancos do backup do servidor no lugar dos antigos.
Remove-Item C:\FareFoto\app\data\*.sqlite-wal, C:\FareFoto\app\data\*.sqlite-shm -ErrorAction SilentlyContinue
Copy-Item "$Dados\*.sqlite" C:\FareFoto\app\data -Force
if (Test-Path "$Dados\mockups") { robocopy "$Dados\mockups" C:\FareFoto\app\data\mockups /E /NFL /NDL /NJH /NJS /NP | Out-Null }
# Pastas dos pedidos gravadas com caminho do Linux (/srv/fare/pedidos/...) passam para D:\Digital\...
$fix = @'
import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync("C:/FareFoto/app/data/farefoto.sqlite");
for (const t of ["fare_photo_orders", "fare_document_folders"]) {
  const r = db.prepare(`update ${t} set folder = replace(replace(folder, '/srv/fare/pedidos', 'D:\\Digital'), '/', '\\') where folder like '/srv/fare/%'`).run();
  console.log(t, "pastas corrigidas:", r.changes);
}
'@
[IO.File]::WriteAllText('C:\FareFoto\corrigir-pastas.mjs', $fix)
& 'C:\Program Files\nodejs\node.exe' --no-warnings C:\FareFoto\corrigir-pastas.mjs
# 5. .env.local do servidor com os caminhos do Windows; sem ponte/IA/voz/impressão (rodam só no servidor).
$tira = '^(AUTH_DATABASE_PATH|FARE_ORDERS_DIR|FFMPEG_PATH|HOSTNAME|FARE_PRINT_DIR|FARE_PONTE_URL|FARE_PONTE_TOKEN|FARE_IA_URL|FARE_IA_TOKEN|FARE_VOZ_URL|BETTER_AUTH_TRUSTED_ORIGINS)='
$lines = @(Get-Content "$Dados\env.local" | Where-Object { $_ -notmatch $tira })
$lines += 'AUTH_DATABASE_PATH=./data/farefoto.sqlite', 'FARE_ORDERS_DIR=D:\Digital', 'FFMPEG_PATH=C:\FareFoto\ffmpeg\ffmpeg.exe',
  'BETTER_AUTH_TRUSTED_ORIGINS=https://www.farefoto.com.br,https://farefoto.com.br,http://localhost:3000,http://oraculo.tail2a8722.ts.net:3000,http://100.72.77.69:3000'
[IO.File]::WriteAllLines('C:\FareFoto\app\.env.local', [string[]]$lines)
# 6. Liga o site (tarefa sobe sozinha quando o Windows liga).
schtasks /Change /TN "FareFoto Site" /ENABLE | Out-Null
schtasks /Run /TN "FareFoto Site" | Out-Null
Start-Sleep 15
try { "site local: $((Invoke-WebRequest -UseBasicParsing -TimeoutSec 30 http://localhost:3000/).StatusCode)" } catch { "site local: ERRO $($_.Exception.Message)" }
