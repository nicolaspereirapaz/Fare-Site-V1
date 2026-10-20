# Roda NO ORACULO no dia de abrir o site na internet (depois que o Cloudflare Tunnel estiver funcionando).
# Troca o endereço do login para o domínio https e religa o site. Guarda uma cópia do .env.local antes.
param([string]$Dominio = "https://www.farefoto.com.br")
$ErrorActionPreference = "Stop"
$env = 'C:\FareFoto\app\.env.local'
Copy-Item $env "$env.antes-dominio-$(Get-Date -Format yyyyMMdd-HHmm)"
$semWww = $Dominio -replace '://www\.', '://'
$lines = @(Get-Content $env | Where-Object { $_ -notmatch '^(BETTER_AUTH_URL|FARE_SITE_URL)=' })
$lines = $lines | ForEach-Object {
  if ($_ -match '^BETTER_AUTH_TRUSTED_ORIGINS=(.*)$') {
    $origens = @($Matches[1] -split ',' | Where-Object { $_ }) + $Dominio + $semWww | Select-Object -Unique
    "BETTER_AUTH_TRUSTED_ORIGINS=$($origens -join ',')"
  } else { $_ }
}
$lines += "BETTER_AUTH_URL=$Dominio", "FARE_SITE_URL=$Dominio"
Set-Content -Path $env -Value $lines -Encoding ascii
schtasks /End /TN "FareFoto Site" | Out-Null
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'server\.js' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-Sleep 2
schtasks /Run /TN "FareFoto Site" | Out-Null
"login agora em $Dominio (o acesso pelo endereço do Tailscale deixa de fazer login)"
