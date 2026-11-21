# Copia os pedidos do site (Azure, /srv/fare/pedidos) para D:\Digital, a pasta da equipe.
# Tarefa "FareFoto Pedidos" (SYSTEM, funciona com a tela bloqueada) a cada minuto; cada rodada confere a cada 5 s por ~50 s.
# Só baixa arquivos novos ou com tamanho diferente; nunca apaga nada da equipe, exceto a pasta
# "Nome - ORC-0001" quando o site já a renomeou para "Nome - PED-0001" (orçamento virou pedido).
$ErrorActionPreference = "Stop"
$dir = "C:\FareFoto\sync"
$dest = "D:\Digital"
$log = "C:\FareFoto\logs\pedidos-sync.log"
$ssh = "C:\Windows\System32\OpenSSH\ssh.exe"
$remote = "fare-sync@IP-DA-VPS"
$opts = @("-p", "63214", "-i", "$dir\id_ed25519", "-o", "UserKnownHostsFile=$dir\known_hosts", "-o", "StrictHostKeyChecking=yes", "-o", "BatchMode=yes", "-o", "ConnectTimeout=20")
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
    # 0. Confirma para a VPS o que já está gravado no D:\Digital: a VPS só apaga (depois de 3 dias) o que foi confirmado.
    $ackFile = "$dir\confirmar.txt"
    if ((Test-Path $ackFile) -and (Get-Item $ackFile).Length) { Ssh "ack" $ackFile "$dir\ack-saida.txt"; Remove-Item $ackFile }

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
      # tar por Start-Process: o erro dele vai para arquivo (redirecionado no PowerShell 5.1 viraria exceção).
      $p = Start-Process -FilePath "$env:SystemRoot\System32\tar.exe" -ArgumentList @("-xf", $tarFile, "-C", $dest) `
        -RedirectStandardError "$dir\tar-erro.txt" -NoNewWindow -PassThru
      $null = $p.Handle
      $p.WaitForExit()
      $missing = @()
      if ($p.ExitCode -ne 0) {
        # Algum arquivo não foi gravado (ex.: emoji no nome, que o tar do Windows 10 não aceita). Anota o pacote
        # mesmo assim: senão toda rodada baixa tudo de novo (em nov/2026 isso gerou ~1,5 TB de tráfego pago no Google).
        # shortcut: arquivo que falhou não é tentado de novo; sai no log como ERRO para buscar à mão.
        $missing = @($need | Where-Object {
          try { (Get-Item -LiteralPath (Join-Path $dest ($_.Rel -replace "/", "\")) -ErrorAction Stop).Length -ne $_.Size } catch { $true }
        })
        $tarErr = (Get-Content "$dir\tar-erro.txt" -Raw -Encoding UTF8) -replace "\s+", " "
        Log "ERRO: tar ($($p.ExitCode)) não gravou $($missing.Count) arquivo(s): $(($missing | ForEach-Object { $_.Rel }) -join ', ') | $tarErr"
      }
      Remove-Item $tarFile -ErrorAction SilentlyContinue
      [IO.File]::AppendAllLines($stateFile, [string[]]($need | ForEach-Object { "$($_.Size)`t$($_.Rel)" }), (New-Object Text.UTF8Encoding $false))
      # Só confirma o que foi gravado de verdade (o que o tar não gravou continua na VPS para buscar à mão).
      $ok = @($need | Where-Object { $missing -notcontains $_ })
      if ($ok.Count) { [IO.File]::AppendAllLines($ackFile, [string[]]($ok | ForEach-Object { "$($_.Size)`t$($_.Rel)" }), (New-Object Text.UTF8Encoding $false)) }
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
