# Roda NO ORACULO na troca Google -> oraculo, com o site do Google já parado e a cópia final em $Final:
#   $Final\*.sqlite + $Final\env.local (cópia consistente, VACUUM INTO) e $Midias\{mockups,atendimento-midias,envios-fotos}.
# Guarda os bancos e o .env.local atuais antes de trocar. Não apaga nada de D:\Digital nem das mídias.
param([string]$Final = 'C:\FareFoto\gcp-final', [string]$Midias = 'C:\FareFoto\gcp-dados')
$ErrorActionPreference = 'Stop'
$app = 'C:\FareFoto\app'
# 1. Para o site do oraculo.
schtasks /End /TN "FareFoto Site" 2>$null | Out-Null
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'server\.js' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" | Where-Object { $_.CommandLine -match 'iniciar-site' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-Sleep 2
# 2. Backup só dos bancos e do .env.local (as mídias não são apagadas, então não precisam de cópia).
$bk = "C:\FareFoto\backups\antes-troca-$(Get-Date -Format yyyyMMdd-HHmm)"
New-Item -ItemType Directory -Force $bk | Out-Null
Copy-Item "$app\data\*.sqlite*" $bk
Copy-Item "$app\.env.local" "$bk\env.local.bak"
"backup: $bk"
# 3. Bancos do Google no lugar.
foreach ($f in Get-ChildItem "$Final\*.sqlite") { if ($f.Length -lt 1) { throw "banco vazio: $($f.Name)" } }
Remove-Item "$app\data\*.sqlite-wal", "$app\data\*.sqlite-shm" -ErrorAction SilentlyContinue
Copy-Item "$Final\*.sqlite" "$app\data" -Force
# 4. Mídias: junta (não apaga o que já existe).
foreach ($d in 'mockups', 'atendimento-midias', 'envios-fotos') {
  if (Test-Path "$Midias\$d") { robocopy "$Midias\$d" "$app\data\$d" /E /MOV /NFL /NDL /NJH /NJS /NP | Out-Null; "${d}: ok" }
}
# 5. Caminhos do Linux nas pastas dos pedidos -> D:\Digital; campanha continua desligada.
$fix = @'
import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync("C:/FareFoto/app/data/farefoto.sqlite");
for (const t of ["fare_photo_orders", "fare_document_folders"]) {
  const r = db.prepare(`update ${t} set folder = replace(replace(folder, '/srv/fare/pedidos', 'D:\\Digital'), '/', '\\') where folder like '/srv/fare/%'`).run();
  console.log(t, "pastas corrigidas:", r.changes);
}
const has = db.prepare("select 1 from sqlite_master where name='campaign_settings'").get();
if (has) { db.prepare("update campaign_settings set enabled=0 where id=1").run(); console.log("campanha enabled:", db.prepare("select enabled from campaign_settings where id=1").get().enabled); }
'@
[IO.File]::WriteAllText('C:\FareFoto\corrigir-pastas.mjs', $fix)
& 'C:\Program Files\nodejs\node.exe' --no-warnings C:\FareFoto\corrigir-pastas.mjs
# 6. .env.local do Google com caminhos do Windows; sem ponte/IA/voz/impressão/NFS-e (só existem no Google).
$tira = '^(AUTH_DATABASE_PATH|FARE_ORDERS_DIR|FFMPEG_PATH|HOSTNAME|FARE_PRINT_DIR|FARE_PONTE_URL|FARE_PONTE_TOKEN|FARE_IA_URL|FARE_IA_TOKEN|FARE_VOZ_URL|BETTER_AUTH_URL|BETTER_AUTH_TRUSTED_ORIGINS|NFSE_PFX_PATH)='
$lines = @(Get-Content "$Final\env.local" | Where-Object { $_ -notmatch $tira })
$lines += 'AUTH_DATABASE_PATH=./data/farefoto.sqlite', 'FARE_ORDERS_DIR=D:\Digital', 'FFMPEG_PATH=C:\FareFoto\ffmpeg\ffmpeg.exe',
  'BETTER_AUTH_URL=https://www.farefoto.com.br',
  'BETTER_AUTH_TRUSTED_ORIGINS=https://www.farefoto.com.br,https://farefoto.com.br,https://reserva.farefoto.com.br,http://localhost:3000'
[IO.File]::WriteAllLines("$app\.env.local", [string[]]$lines)
# 7. Liga o site.
schtasks /Change /TN "FareFoto Site" /ENABLE | Out-Null
schtasks /Run /TN "FareFoto Site" | Out-Null
Start-Sleep 20
try { "site local: $((Invoke-WebRequest -UseBasicParsing -TimeoutSec 60 http://localhost:3000/).StatusCode)" } catch { "site local: ERRO $($_.Exception.Message)" }
