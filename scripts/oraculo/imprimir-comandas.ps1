# Imprime as comandas que a equipe manda pelo site ("Imprimir comanda") na WF-7840 da loja:
# gaveta 1 ("main"), 148,5 × 210 mm, papel comum ("stationery") — pedido direto à impressora por IPP.
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

# Pela rede (IPP), direto na impressora: o driver ignorava o tamanho personalizado e saía em A4.
Add-Type -AssemblyName System.Drawing
. "$dir\ipp.ps1"
$printerUri = "https://192.168.0.94:631/ipp/print"
function Print-Image($file, $title) {
  # PNG da fila → JPEG (a Epson não aceita PNG nem PDF por IPP)
  $image = [System.Drawing.Image]::FromFile($file)
  try {
    $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq "image/jpeg"
    $params = New-Object System.Drawing.Imaging.EncoderParameters 1
    $params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]92)
    $jpeg = New-Object IO.MemoryStream
    $image.Save($jpeg, $codec, $params)
  } finally { $image.Dispose() }
  $r = Send-IppDocument $printerUri $jpeg.ToArray() $title "image/jpeg" "main" 14850 21000 "stationery"
  if ($r.Status -notmatch '^0x000[0-2]$') { throw "impressora recusou ($($r.Status)): $($r.Attributes['status-message'] -join ' ')" }
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
