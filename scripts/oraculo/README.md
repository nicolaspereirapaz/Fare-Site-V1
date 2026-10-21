# Scripts do oraculo (servidor da loja)

- `atualizar-site.ps1` — troca o site pelo pacote novo (`C:\FareFoto\app-novo.tgz`), com backup dos bancos antes. Nunca mexe em `data\` nem no `.env.local`.
- `backup-dados.mjs` + `backup-dados.ps1` — backup diário (tarefa "FareFoto Backup", 03:00) em `D:\Backups\FareFoto\AAAA-MM-DD`, guarda 14 dias. Ficam em `C:\FareFoto\backup\`.
- `ligar-dominio.ps1` — no dia de abrir na internet: login passa a usar `https://www.farefoto.com.br`.

Como rodar um script no oraculo a partir do morfeus:

```powershell
$enc = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes((Get-Content -Raw .\scripts\oraculo\atualizar-site.ps1)))
ssh Nicolas@100.72.77.69 "powershell -NoProfile -EncodedCommand $enc"
```

## Pedidos do site → D:\Digital (desde 21/10/2026)

O site roda no Azure. `puxar-pedidos.ps1` (no oraculo em `C:\FareFoto\sync\`) roda a cada minuto pela tarefa
"FareFoto Pedidos" (SYSTEM, funciona com a tela bloqueada) e baixa as pastas novas de `/srv/fare/pedidos` para `D:\Digital`.
- Acesso: chave `C:\FareFoto\sync\id_ed25519` (só SYSTEM/Administradores) → usuário `fare-sync` no Azure, que só pode listar e baixar (`/usr/local/bin/fare-sync-serve`), só pelo Tailscale.
- Já baixados ficam em `C:\FareFoto\sync\baixados.txt`: pasta movida ou apagada pela equipe não volta.
- Orçamento que virou pedido: a pasta "Nome - ORC-0001" sai quando a "Nome - PED-0001" chega.
- Log: `C:\FareFoto\logs\pedidos-sync.log` (só registra quando baixa algo ou dá erro).
- O site antigo do oraculo (tarefa "FareFoto Site") está desabilitado.
