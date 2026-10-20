# Scripts do oraculo (servidor da loja)

- `atualizar-site.ps1` — troca o site pelo pacote novo (`C:\FareFoto\app-novo.tgz`), com backup dos bancos antes. Nunca mexe em `data\` nem no `.env.local`.
- `backup-dados.mjs` + `backup-dados.ps1` — backup diário (tarefa "FareFoto Backup", 03:00) em `D:\Backups\FareFoto\AAAA-MM-DD`, guarda 14 dias. Ficam em `C:\FareFoto\backup\`.
- `ligar-dominio.ps1` — no dia de abrir na internet: login passa a usar `https://www.farefoto.com.br`.

Como rodar um script no oraculo a partir do morfeus:

```powershell
$enc = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes((Get-Content -Raw .\scripts\oraculo\atualizar-site.ps1)))
ssh Nicolas@100.72.77.69 "powershell -NoProfile -EncodedCommand $enc"
```
