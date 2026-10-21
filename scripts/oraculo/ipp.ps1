# Cliente IPP mínimo (RFC 8010) para imprimir direto na Epson pela rede, escolhendo gaveta, tamanho e papel.
# Uso: . .\ipp.ps1; Get-IppAttributes "http://192.168.0.94:631/ipp/print"; Send-IppDocument $uri $jpegBytes "Comanda PED-0001"

function New-IppWriter { New-Object System.IO.MemoryStream }
function Write-Bytes($ms, [byte[]]$b) { $ms.Write($b, 0, $b.Length) }
function Write-Short($ms, [int]$v) { Write-Bytes $ms ([byte[]]@((($v -shr 8) -band 255), ($v -band 255))) }
function Write-Attr($ms, [byte]$tag, [string]$name, [byte[]]$value) {
  $n = [Text.Encoding]::UTF8.GetBytes($name)
  Write-Bytes $ms ([byte[]]@($tag)); Write-Short $ms $n.Length; Write-Bytes $ms $n
  Write-Short $ms $value.Length; Write-Bytes $ms $value
}
function Text([string]$s) { [Text.Encoding]::UTF8.GetBytes($s) }
function Int32Bytes([int]$v) { [byte[]]@((($v -shr 24) -band 255), (($v -shr 16) -band 255), (($v -shr 8) -band 255), ($v -band 255)) }

function Write-Header($ms, [int]$operation, $uri) {
  Write-Bytes $ms ([byte[]](2, 0)); Write-Short $ms $operation; Write-Bytes $ms (Int32Bytes 1)
  Write-Bytes $ms ([byte[]]@(0x01))
  Write-Attr $ms 0x47 "attributes-charset" (Text "utf-8")
  Write-Attr $ms 0x48 "attributes-natural-language" (Text "pt-br")
  Write-Attr $ms 0x45 "printer-uri" (Text ($uri -replace '^http', 'ipp'))
}

# A Epson só aceita IPP com TLS e usa certificado próprio (sem autoridade): aceito só para o IP da impressora.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
function Invoke-Ipp($uri, [byte[]]$body) {
  $printerHost = ([Uri]$uri).Host
  [Net.ServicePointManager]::ServerCertificateValidationCallback = { param($s) $s -is [Net.HttpWebRequest] -and $s.RequestUri.Host -eq $printerHost }.GetNewClosure()
  $req = [Net.HttpWebRequest]::Create($uri)
  $req.Method = "POST"; $req.ContentType = "application/ipp"; $req.Timeout = 60000
  $s = $req.GetRequestStream(); $s.Write($body, 0, $body.Length); $s.Close()
  $resp = $req.GetResponse(); $rs = $resp.GetResponseStream(); $out = New-Object IO.MemoryStream; $rs.CopyTo($out); $resp.Close()
  ,$out.ToArray()
}

# Lê a resposta: devolve status e atributos (nome -> lista de valores em texto).
function Read-IppResponse([byte[]]$r) {
  $status = ($r[2] -shl 8) + $r[3]; $i = 8; $attrs = [ordered]@{}; $last = $null
  while ($i -lt $r.Length) {
    $tag = $r[$i]; $i++
    if ($tag -eq 0x03) { break }
    if ($tag -lt 0x10) { continue }
    $nl = ($r[$i] -shl 8) + $r[$i + 1]; $i += 2
    $name = [Text.Encoding]::UTF8.GetString($r, $i, $nl); $i += $nl
    $vl = ($r[$i] -shl 8) + $r[$i + 1]; $i += 2
    $v = $r[$i..($i + $vl - 1)]; $i += $vl
    if ($name) { $last = $name; if (-not $attrs.Contains($name)) { $attrs[$name] = New-Object Collections.ArrayList } }
    $text = switch ($tag) {
      { $_ -in 0x21, 0x23 } { if ($vl -eq 4) { [string](([int]$v[0] -shl 24) + ([int]$v[1] -shl 16) + ([int]$v[2] -shl 8) + [int]$v[3]) } }
      0x33 { "range" }
      0x34 { "{" } 0x37 { "}" } 0x4A { "." + [Text.Encoding]::UTF8.GetString([byte[]]$v) }
      default { if ($vl) { [Text.Encoding]::UTF8.GetString([byte[]]$v) } else { "" } }
    }
    if ($last) { [void]$attrs[$last].Add($text) }
  }
  [pscustomobject]@{ Status = ('0x{0:X4}' -f $status); Attributes = $attrs }
}

function Get-IppAttributes($uri) {
  $ms = New-IppWriter; Write-Header $ms 0x000B $uri
  Write-Attr $ms 0x44 "requested-attributes" (Text "all")
  Write-Bytes $ms ([byte[]]@(0x03))
  Read-IppResponse (Invoke-Ipp $uri $ms.ToArray())
}

# Imprime um documento (a Epson aceita image/jpeg, não PDF): gaveta (media-source: main = gaveta 1),
# tamanho em centésimos de mm, tipo de papel (stationery = papel comum).
function Send-IppDocument($uri, [byte[]]$data, [string]$jobName, [string]$format = "image/jpeg", [string]$source = "main", [int]$width = 14850, [int]$height = 21000, [string]$type = "stationery") {
  $ms = New-IppWriter; Write-Header $ms 0x0002 $uri
  Write-Attr $ms 0x42 "requesting-user-name" (Text "farefoto")
  Write-Attr $ms 0x42 "job-name" (Text $jobName)
  Write-Attr $ms 0x49 "document-format" (Text $format)
  Write-Bytes $ms ([byte[]]@(0x02))
  Write-Attr $ms 0x34 "media-col" ([byte[]]@())
  Write-Attr $ms 0x4A "" (Text "media-size"); Write-Attr $ms 0x34 "" ([byte[]]@())
  Write-Attr $ms 0x4A "" (Text "x-dimension"); Write-Attr $ms 0x21 "" (Int32Bytes $width)
  Write-Attr $ms 0x4A "" (Text "y-dimension"); Write-Attr $ms 0x21 "" (Int32Bytes $height)
  Write-Attr $ms 0x37 "" ([byte[]]@())
  Write-Attr $ms 0x4A "" (Text "media-source"); Write-Attr $ms 0x44 "" (Text $source)
  Write-Attr $ms 0x4A "" (Text "media-type"); Write-Attr $ms 0x44 "" (Text $type)
  Write-Attr $ms 0x37 "" ([byte[]]@())
  Write-Attr $ms 0x44 "print-scaling" (Text "fit")
  Write-Bytes $ms ([byte[]]@(0x03))
  Write-Bytes $ms $data
  Read-IppResponse (Invoke-Ipp $uri $ms.ToArray())
}
