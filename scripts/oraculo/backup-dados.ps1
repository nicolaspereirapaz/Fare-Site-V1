# Tarefa "FareFoto Backup" (a cada 3 horas). Desde 19/11/2026 o site roda na VPS (IP-DA-VPS, porta 63214).
# 1. Puxa o ponto de restauracao dos bancos da VPS (fare-sync backup-get) para D:\Backups\FareFoto\ponto-restauracao.
#    Sempre UM ponto so: o novo e montado ao lado e so troca o antigo se chegou inteiro.
# 2. Copia as midias novas das conversas (fare-sync midias-list/midias-get) para D:\Backups\FareFoto\atendimento-midias.
#    So baixa o que ainda nao veio (lista em C:\FareFoto\sync\midias-baixadas.txt); nunca apaga nada do backup.
# Log em C:\FareFoto\logs\backup.log.
$ErrorActionPreference = "Stop"
$dir = "C:\FareFoto\sync"
$dest = "D:\Backups\FareFoto"
$log = "C:\FareFoto\logs\backup.log"
$ssh = "C:\Windows\System32\OpenSSH\ssh.exe"
$remote = "fare-sync@IP-DA-VPS"
$opts = @("-p", "63214", "-i", "$dir\id_ed25519", "-o", "UserKnownHostsFile=$dir\known_hosts", "-o", "StrictHostKeyChecking=yes", "-o", "BatchMode=yes", "-o", "ConnectTimeout=20")
function Log($text) { Add-Content -Path $log -Value "$(Get-Date -Format s) $text" -Encoding UTF8 }
# ssh direto, com entrada e saida em arquivo: por cmd ou capturado pelo PowerShell, o ssh do Windows trava.
function Ssh($command, $inFile, $outFile) {
  if ($inFile -eq "NUL") { $inFile = "$dir\vazio-backup.txt"; Set-Content $inFile "" -NoNewline }
  $p = Start-Process -FilePath $ssh -ArgumentList ($opts + @($remote, $command)) -RedirectStandardInput $inFile `
    -RedirectStandardOutput $outFile -RedirectStandardError "$dir\ssh-erro-backup.txt" -NoNewWindow -PassThru
  $null = $p.Handle  # sem isso o PowerShell 5.1 nao entrega o ExitCode
  if (-not $p.WaitForExit(3600000)) { $p.Kill(); throw "ssh $command passou de 60 min" }
  if ($p.ExitCode -ne 0) { throw "ssh $command falhou ($($p.ExitCode)): $(Get-Content "$dir\ssh-erro-backup.txt" -Raw)" }
}

# 1. Bancos
try {
  $tar = "$dir\backup.tar"
  $novo = "$dest\ponto-restauracao.novo"
  $atual = "$dest\ponto-restauracao"
  $antigo = "$dest\ponto-restauracao.antigo"
  Ssh "backup-get" "NUL" $tar
  Remove-Item $novo -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force $novo | Out-Null
  & tar.exe -xf $tar -C $novo
  if ($LASTEXITCODE -ne 0) { throw "falha ao abrir o pacote ($LASTEXITCODE)" }
  if (-not (Get-ChildItem "$novo\ponto-restauracao\farefoto.sqlite" -ErrorAction SilentlyContinue)) { throw "pacote sem farefoto.sqlite" }
  Remove-Item $antigo -Recurse -Force -ErrorAction SilentlyContinue
  if (Test-Path $atual) { Rename-Item $atual $antigo }
  Move-Item "$novo\ponto-restauracao" $atual
  Remove-Item $novo, $antigo, $tar -Recurse -Force -ErrorAction SilentlyContinue
  Log "ponto de restauracao da VPS ok: $(Get-Content "$atual\feito-em.txt" -TotalCount 1)"
} catch {
  Log "BACKUP DOS BANCOS DA VPS FALHOU: $($_.Exception.Message)"
}

# 2. Midias das conversas
try {
  $mdest = "$dest\atendimento-midias"
  New-Item -ItemType Directory -Force $mdest | Out-Null
  Ssh "midias-list" "NUL" "$dir\midias-lista.txt"
  $state = "$dir\midias-baixadas.txt"
  $done = New-Object 'System.Collections.Generic.HashSet[string]'
  if (Test-Path $state) { foreach ($entry in [IO.File]::ReadAllLines($state, [Text.Encoding]::UTF8)) { [void]$done.Add($entry) } }
  $need = @([IO.File]::ReadAllLines("$dir\midias-lista.txt", [Text.Encoding]::UTF8) | Where-Object { $_ -and -not $done.Contains($_) })
  if ($need.Count) {
    $list = "$dir\midias-baixar.txt"
    [IO.File]::WriteAllText($list, (($need | ForEach-Object { ($_ -split "`t", 2)[1] }) -join "`n") + "`n", (New-Object Text.UTF8Encoding $false))
    $mtar = "$dir\midias.tar"
    Ssh "midias-get" $list $mtar
    & tar.exe -xf $mtar -C $mdest
    if ($LASTEXITCODE -ne 0) { throw "falha ao abrir o pacote de midias ($LASTEXITCODE)" }
    Remove-Item $mtar -ErrorAction SilentlyContinue
    [IO.File]::AppendAllLines($state, [string[]]$need, (New-Object Text.UTF8Encoding $false))
  }
  Log "midias do atendimento ok: $($need.Count) arquivo(s) novo(s) em $mdest"
} catch {
  Log "MIDIAS DA VPS FALHOU: $($_.Exception.Message)"
}
