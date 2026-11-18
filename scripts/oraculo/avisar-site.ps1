# Vigia do oraculo: quando www.farefoto.com.br abrir pela internet (Cloudflare), imprime um aviso na Epson da loja
# (gaveta 1, 148,5 × 210 mm, igual à comanda) uma vez e se desliga. Tarefa "FareFoto Aviso Site" (SYSTEM).
# Uso manual: -Teste grava só o JPEG em C:\FareFoto\logs\aviso-site-teste.jpg, sem imprimir.
# -Agora imprime o aviso na hora (usado no fim da troca Google -> oraculo), sem esperar nada.
param([switch]$Teste, [switch]$Agora)
$ErrorActionPreference = 'Continue'
$log = 'C:\FareFoto\logs\aviso-site.log'; $feito = 'C:\FareFoto\cloudflared\aviso-impresso.txt'
function Log($t) { Add-Content -Path $log -Value "$(Get-Date -Format s) $t" -Encoding UTF8 }
Add-Type -AssemblyName System.Drawing
. 'C:\FareFoto\sync\ipp.ps1'
$printerUri = 'https://192.168.0.94:631/ipp/print'

function New-AvisoJpeg {
  $bmp = New-Object System.Drawing.Bitmap 1754, 2480   # 148,5 × 210 mm a 300 dpi
  $bmp.SetResolution(300, 300)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::White); $g.TextRenderingHint = 'AntiAliasGridFit'
  $preto = [System.Drawing.Brushes]::Black
  $centro = New-Object System.Drawing.StringFormat; $centro.Alignment = 'Center'
  $y = 160
  foreach ($l in @(@('FARE FOTO', 20, 'Bold'), @('SITE NO AR NA LOJA', 30, 'Bold'), @('www.farefoto.com.br', 18, 'Regular'), @((Get-Date -Format 'dd/MM/yyyy HH:mm'), 16, 'Regular'))) {
    $f = New-Object System.Drawing.Font('Arial', $l[1], [System.Drawing.FontStyle]$l[2])
    $g.DrawString($l[0], $f, $preto, (New-Object System.Drawing.RectangleF(100, $y, 1554, 400)), $centro)
    $y += $f.GetHeight($g) + 50; $f.Dispose()
  }
  $g.DrawLine((New-Object System.Drawing.Pen($preto, 6)), 120, $y, 1634, $y); $y += 80
  $txt = "O site agora roda no computador oraculo, aqui na loja, pelo Cloudflare. O Google foi pausado.`n`nTodos os pedidos, clientes e conversas foram copiados do Google.`n`nEquipe: entre por www.farefoto.com.br/equipe.`n`nAinda NÃO funciona no oraculo:`n• WhatsApp no Atendimento e IA`n• Impressão da comanda pelo site`n• Emissão de NFS-e"
  $f = New-Object System.Drawing.Font('Arial', 13)
  $h = 2480 - $y - 120   # fora do New-Object: lá a vírgula vence o sinal de menos
  $g.DrawString($txt, $f, $preto, (New-Object System.Drawing.RectangleF(140, $y, 1474, $h)))
  $f.Dispose(); $g.Dispose()
  $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq 'image/jpeg'
  $p = New-Object System.Drawing.Imaging.EncoderParameters 1
  $p.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]92)
  $ms = New-Object IO.MemoryStream; $bmp.Save($ms, $codec, $p); $bmp.Dispose()
  , $ms.ToArray()
}

# Enquanto o domínio não volta, o login roda em http://192.168.0.13:3000 (cookies sem "Secure").
# Quando o www abre pela internet, o login volta para o https do domínio e o site reinicia.
function Set-LoginDominio {
  $env = 'C:\FareFoto\app\.env.local'
  if (Select-String -Path $env -Pattern '^BETTER_AUTH_URL=https://www\.farefoto\.com\.br$' -Quiet) { return }
  Copy-Item $env "C:\FareFoto\backups\env.local.antes-login-dominio-$(Get-Date -Format yyyyMMdd-HHmm)"
  $lines = @(Get-Content $env | Where-Object { $_ -notmatch '^BETTER_AUTH_URL=' }) + 'BETTER_AUTH_URL=https://www.farefoto.com.br'
  [IO.File]::WriteAllLines($env, [string[]]$lines)
  schtasks /End /TN "FareFoto Site" | Out-Null
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'server\.js' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" | Where-Object { $_.CommandLine -match 'iniciar-site' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Start-Sleep 2; schtasks /Run /TN "FareFoto Site" | Out-Null; Start-Sleep 20
  Log 'login voltou para https://www.farefoto.com.br (site reiniciado)'
}

if ($Teste) { [IO.File]::WriteAllBytes('C:\FareFoto\logs\aviso-site-teste.jpg', (New-AvisoJpeg)); exit 0 }
if ($Agora) {
  $r = Send-IppDocument $printerUri (New-AvisoJpeg) 'Aviso: site no ar na loja' 'image/jpeg' 'main' 14850 21000 'stationery'
  "impressora: $($r.Status) $($r.Attributes['status-message'] -join ' ')"; Log "aviso impresso na hora: $($r.Status)"; exit 0
}

$fim = (Get-Date).AddHours(72); $tentativas = 0
while (-not (Test-Path $feito) -and (Get-Date) -lt $fim -and $tentativas -lt 10) {
  $ns = (nslookup -type=NS farefoto.com.br a.dns.br 2>$null | Out-String) -match 'cloudflare'
  $ip = (Resolve-DnsName www.farefoto.com.br -Server 8.8.8.8 -DnsOnly -NoHostsFile -ErrorAction SilentlyContinue | Where-Object IPAddress | Select-Object -First 1).IPAddress
  $code = if ($ns -and $ip) { & curl.exe -s -o NUL -w '%{http_code}' --max-time 20 --resolve "www.farefoto.com.br:443:$ip" https://www.farefoto.com.br/ } else { '-' }
  if ($code -eq '200') {
    $tentativas++
    Set-LoginDominio
    try {
      $r = Send-IppDocument $printerUri (New-AvisoJpeg) 'Aviso: site no ar' 'image/jpeg' 'main' 14850 21000 'stationery'
      if ($r.Status -notmatch '^0x000[0-2]$') { throw "impressora recusou ($($r.Status)): $($r.Attributes['status-message'] -join ' ')" }
      "$(Get-Date -Format s) impresso (ip $ip)" | Set-Content $feito; Log "site no ar (ip $ip): aviso impresso"
    } catch { Log "site no ar, mas erro ao imprimir: $($_.Exception.Message)" }
  }
  Start-Sleep 60
}
schtasks /Change /TN "FareFoto Aviso Site" /DISABLE | Out-Null
