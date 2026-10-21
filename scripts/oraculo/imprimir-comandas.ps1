# Imprime as comandas que a equipe manda pelo site ("Imprimir comanda") na WF-7840 da loja:
# gaveta de papel 1, 148,5 × 210 mm (definido pelo usuário), papel comum (padrão do driver).
# Tarefa "FareFoto Impressao" (SYSTEM) a cada minuto; cada rodada confere a fila a cada 4 s por ~55 s.
$ErrorActionPreference = "Stop"
$dir = "C:\FareFoto\sync"
$work = "$dir\impressao"
$log = "C:\FareFoto\logs\impressao.log"
$ssh = "C:\Windows\System32\OpenSSH\ssh.exe"
$remote = "fare-sync@100.75.165.119"
$printer = "EPSON7C329C (WF-7840 Series)"
$opts = @("-i", "$dir\id_ed25519", "-o", "UserKnownHostsFile=$dir\known_hosts", "-o", "StrictHostKeyChecking=yes", "-o", "BatchMode=yes", "-o", "ConnectTimeout=20")
New-Item -ItemType Directory -Force $work | Out-Null
function Log($text) { Add-Content -Path $log -Value "$(Get-Date -Format s) $text" -Encoding UTF8 }
# ssh direto com entrada/saída em arquivo (capturado pelo PowerShell, o ssh do Windows trava).
function Ssh([string[]]$command, $outFile) {
  $in = "$work\vazio.txt"; Set-Content $in "" -NoNewline
  $p = Start-Process -FilePath $ssh -ArgumentList ($opts + @($remote) + $command) -RedirectStandardInput $in `
    -RedirectStandardOutput $outFile -RedirectStandardError "$work\ssh-erro.txt" -NoNewWindow -PassThru
  $null = $p.Handle
  if (-not $p.WaitForExit(120000)) { $p.Kill(); throw "ssh $command passou de 2 min" }
  if ($p.ExitCode -ne 0) { throw "ssh $command falhou ($($p.ExitCode)): $(Get-Content "$work\ssh-erro.txt" -Raw)" }
}

Add-Type -AssemblyName System.Drawing
function Print-Image($file, $title) {
  $doc = New-Object System.Drawing.Printing.PrintDocument
  $doc.PrinterSettings.PrinterName = $printer
  if (-not $doc.PrinterSettings.IsValid) { throw "impressora '$printer' não encontrada" }
  $doc.DocumentName = $title
  $tray = $doc.PrinterSettings.PaperSources | Where-Object { $_.SourceName -match '^Gaveta de papel 1$' } | Select-Object -First 1
  if (-not $tray) { throw "gaveta 1 não encontrada no driver" }
  $doc.DefaultPageSettings.PaperSource = $tray
  # 148,5 × 210 mm em centésimos de polegada
  $doc.DefaultPageSettings.PaperSize = New-Object System.Drawing.Printing.PaperSize("Comanda 148,5x210", 585, 827)
  $doc.DefaultPageSettings.Landscape = $false
  $doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
  $image = [System.Drawing.Image]::FromFile($file)
  try {
    $doc.add_PrintPage({
      param($sender, $e)
      # Área imprimível (a impressora não imprime na borda): imagem inteira, sem distorcer.
      $area = $e.Graphics.VisibleClipBounds
      $scale = [Math]::Min($area.Width / $image.Width, $area.Height / $image.Height)
      $w = $image.Width * $scale; $h = $image.Height * $scale
      $e.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $e.Graphics.DrawImage($image, [single]($area.X + ($area.Width - $w) / 2), [single]($area.Y + ($area.Height - $h) / 2), [single]$w, [single]$h)
      $e.HasMorePages = $false
    })
    $doc.PrintController = New-Object System.Drawing.Printing.StandardPrintController
    $doc.Print()
  } finally { $image.Dispose(); $doc.Dispose() }
}

$lock = "$work\rodando.lock"
if ((Test-Path $lock) -and ((Get-Item $lock).LastWriteTime -gt (Get-Date).AddMinutes(-5))) { exit 0 }
Set-Content $lock (Get-Date) -Encoding ascii
try {
  $until = (Get-Date).AddSeconds(55)
  while ((Get-Date) -lt $until) {
    try {
      Ssh @("print-list") "$work\fila.txt"
      foreach ($name in [IO.File]::ReadAllLines("$work\fila.txt") | Where-Object { $_ -match '^[\w.-]+\.png$' } | Sort-Object) {
        $file = Join-Path $work $name
        Ssh @("print-get", $name) $file
        Print-Image $file ($name -replace '^\d+-', '' -replace '\.png$', '')
        Ssh @("print-done", $name) "$work\saida.txt"
        Remove-Item $file -ErrorAction SilentlyContinue
        Log "impresso: $name"
      }
    } catch { Log "ERRO: $($_.Exception.Message)"; Start-Sleep 10 }
    Start-Sleep 4
  }
} finally { Remove-Item $lock -ErrorAction SilentlyContinue }
