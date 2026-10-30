# Copia os pedidos do site (Azure, /srv/fare/pedidos) para D:\Digital, a pasta da equipe.
# Tarefa "FareFoto Pedidos" (SYSTEM, funciona com a tela bloqueada) a cada minuto; cada rodada confere a cada 5 s por ~50 s.
# Só baixa arquivos novos ou com tamanho diferente; nunca apaga nada da equipe, exceto a pasta
# "Nome - ORC-0001" quando o site já a renomeou para "Nome - PED-0001" (orçamento virou pedido).
$ErrorActionPreference = "Stop"
$dir = "C:\FareFoto\sync"
$dest = "D:\Digital"
$log = "C:\FareFoto\logs\pedidos-sync.log"
$ssh = "C:\Windows\System32\OpenSSH\ssh.exe"
$remote = "fare-sync@100.75.165.119"
$opts = @("-i", "$dir\id_ed25519", "-o", "UserKnownHostsFile=$dir\known_hosts", "-o", "StrictHostKeyChecking=yes", "-o", "BatchMode=yes", "-o", "ConnectTimeout=20")
function Log($text) { Add-Content -Path $log -Value "$(Get-Date -Format s) $text" -Encoding UTF8 }
# ssh direto, com entrada e saída em arquivo: por cmd ou capturado pelo PowerShell, o ssh do Windows trava.
function Ssh($command, $inFile, $outFile) {
  if ($inFile -eq "NUL") { $inFile = "$dir\vazio.txt"; Set-Content $inFile "" -NoNewline }
  $p = Start-Process -FilePath $ssh -ArgumentList ($opts + @($remote, $command)) -RedirectStandardInput $inFile `
    -RedirectStandardOutput $outFile -RedirectStandardError "$dir\ssh-erro.txt" -NoNewWindow -PassThru
  $null = $p.Handle  # sem isso o PowerShell 5.1 não entrega o ExitCode
  if (-not $p.WaitForExit(600000)) { $p.Kill(); throw "ssh $command passou de 10 min" }
  if ($p.ExitCode -ne 0) { throw "ssh $command falhou ($($p.ExitCode)): $(Get-Content "$dir\ssh-erro.txt" -Raw)" }
}

$lock = "$dir\rodando.lock"
if ((Test-Path $lock) -and ((Get-Item $lock).LastWriteTime -gt (Get-Date).AddMinutes(-30))) { exit 0 }
Set-Content $lock (Get-Date) -Encoding ascii
try {
  # Pasta nova chega em segundos, não no minuto seguinte. Erro encerra a rodada (1 aviso por minuto no log).
  $until = (Get-Date).AddSeconds(50)
  do {
    # 1. O que existe no site: "tamanho<TAB>dia/pasta/arquivo". Saída do ssh sempre para arquivo:
    #    capturada direto pelo PowerShell, o ssh do Windows trava.
    Ssh "list" "NUL" "$dir\lista.txt"
    $lines = [IO.File]::ReadAllLines("$dir\lista.txt", [Text.Encoding]::UTF8)
    $files = foreach ($line in $lines) { $size, $rel = $line -split "`t", 2; if ($rel) { [pscustomobject]@{ Size = [int64]$size; Rel = $rel } } }

    # 2. Ainda não baixado (ou mudou de tamanho). Guarda o que já veio: se a equipe mover ou apagar a pasta
    #    depois de imprimir, ela não volta.
    $stateFile = "$dir\baixados.txt"
    $done = New-Object 'System.Collections.Generic.HashSet[string]'
    if (Test-Path $stateFile) { foreach ($entry in [IO.File]::ReadAllLines($stateFile, [Text.Encoding]::UTF8)) { [void]$done.Add($entry) } }
    $need = @($files | Where-Object { -not $done.Contains("$($_.Size)`t$($_.Rel)") })
    if ($need.Count) {
      $list = "$dir\baixar.txt"
      [IO.File]::WriteAllText($list, (($need | ForEach-Object { $_.Rel }) -join "`n") + "`n", (New-Object Text.UTF8Encoding $false))
      $tarFile = "$dir\baixar.tar"
      Ssh "get" $list $tarFile
      & tar.exe -xf $tarFile -C $dest
      if ($LASTEXITCODE -ne 0) { throw "falha ao abrir o pacote ($LASTEXITCODE)" }
      Remove-Item $tarFile -ErrorAction SilentlyContinue
      [IO.File]::AppendAllLines($stateFile, [string[]]($need | ForEach-Object { "$($_.Size)`t$($_.Rel)" }), (New-Object Text.UTF8Encoding $false))
      Log "baixados $($need.Count) arquivo(s): $((($need | ForEach-Object { ($_.Rel -split '/')[0..1] -join '/' }) | Select-Object -Unique) -join ', ')"
    }

    # 3. Orçamento que virou pedido: a pasta ORC antiga sai quando a PED com o mesmo número já chegou.
    $folders = @($files | ForEach-Object { ($_.Rel -split "/")[0..1] -join "/" } | Select-Object -Unique)
    foreach ($day in @($folders | ForEach-Object { ($_ -split "/")[0] } | Select-Object -Unique)) {
      $dayDir = Join-Path $dest $day
      if (-not (Test-Path -LiteralPath $dayDir)) { continue }
      foreach ($old in Get-ChildItem -LiteralPath $dayDir -Directory) {
        if ($old.Name -notmatch '^(.*) - ORC-(\d{4,})(.*)$') { continue }
        $pedName = "$($Matches[1]) - PED-$($Matches[2])$($Matches[3])"
        if (($folders -notcontains "$day/$($old.Name)") -and ($folders -contains "$day/$pedName") -and (Test-Path -LiteralPath (Join-Path $dayDir $pedName))) {
          Remove-Item -LiteralPath $old.FullName -Recurse -Force
          Log "orçamento virou pedido: $day/$($old.Name) -> $pedName"
        }
      }
    }
    if ((Get-Date) -lt $until) { Start-Sleep -Seconds 5 }
  } while ((Get-Date) -lt $until)
} catch {
  Log "ERRO: $($_.Exception.Message)"
} finally {
  Remove-Item $lock -ErrorAction SilentlyContinue
}
