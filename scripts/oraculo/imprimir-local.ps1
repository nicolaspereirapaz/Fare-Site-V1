# Imprime as comandas que a equipe manda pelo site ("Imprimir comanda") quando o SITE RODA NO ORACULO:
# o site grava PNG 300 dpi em C:\FareFoto\impressao (FARE_PRINT_DIR, via pdftoppm do Xpdf em C:\FareFoto\xpdf)
# e este script manda direto para a WF-7840 por IPP: gaveta 1 ("main"), 148,5 × 210 mm, papel comum.
# Tarefa "FareFoto Impressao" (SYSTEM) a cada minuto; cada rodada confere a pasta a cada 4 s por ~55 s.
# (Com o site no Google, a tarefa usa imprimir-comandas.ps1, que busca a fila pelo fare-sync.)
$ErrorActionPreference = "Stop"
$fila = "C:\FareFoto\impressao"
$log = "C:\FareFoto\logs\impressao.log"
New-Item -ItemType Directory -Force $fila | Out-Null
function Log($text) { Add-Content -Path $log -Value "$(Get-Date -Format s) $text" -Encoding UTF8 }

Add-Type -AssemblyName System.Drawing
. "C:\FareFoto\sync\ipp.ps1"
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

$lock = "$fila\.rodando.lock"
if ((Test-Path $lock) -and ((Get-Item $lock).LastWriteTime -gt (Get-Date).AddMinutes(-5))) { exit 0 }
Set-Content $lock (Get-Date) -Encoding ascii
try {
  $until = (Get-Date).AddSeconds(55)
  while ((Get-Date) -lt $until) {
    # Só PNG solto na pasta: o site monta cada comanda em .tmp-* e move pronta (nunca pega imagem pela metade).
    foreach ($png in Get-ChildItem $fila -File -Filter *.png | Sort-Object Name) {
      try {
        Print-Image $png.FullName ($png.BaseName -replace '^\d+-', '')
        Remove-Item $png.FullName
        Log "impresso: $($png.Name)"
      } catch { Log "ERRO $($png.Name): $($_.Exception.Message)"; Start-Sleep 10 }
    }
    Start-Sleep 4
  }
} finally { Remove-Item $lock -ErrorAction SilentlyContinue }
