# Scripts do oraculo (PC da loja)

Desde 19/11/2026 o site roda na VPS (ver `scripts/servidor/`). O oraculo só puxa pedidos, comandas e backup da VPS;
as tarefas FareFoto Site/Ponte/Voz e o serviço cloudflared dele estão desabilitados. Nos scripts, `IP-DA-VPS` é o IP real da VPS
(fica só nas cópias do oraculo, não neste repositório público).

- `atualizar-site.ps1` — troca o site pelo pacote novo (`C:\FareFoto\app-novo.tgz`), com backup dos bancos antes. Nunca mexe em `data\` nem no `.env.local`.
- `backup-dados.ps1` — a cada 3 h (tarefa "FareFoto Backup") puxa da VPS o ponto de restauração dos bancos (`fare-sync backup-get`) para `D:\Backups\FareFoto\ponto-restauracao`: sempre um só; o novo só troca o antigo se chegou inteiro. Também baixa as mídias novas das conversas (`midias-list`/`midias-get`) para `D:\Backups\FareFoto\atendimento-midias` (nunca apaga). Fica em `C:\FareFoto\backup\`.
- `backup-dados.mjs` — backup do banco local, da época em que o site rodava no oraculo (hoje o da VPS é `scripts/servidor/backup-dados.mjs`).
- Voz no oraculo (19/11/2026, só até a troca; hoje a voz roda na VPS): `ligar-voz.ps1`, `iniciar-voz.cmd` e `voz/` ficaram só no PC.
- `ligar-dominio.ps1` — no dia de abrir na internet: login passa a usar `https://www.farefoto.com.br`.

Como rodar um script no oraculo a partir do morfeus:

```powershell
$enc = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes((Get-Content -Raw .\scripts\oraculo\atualizar-site.ps1)))
ssh Nicolas@100.72.77.69 "powershell -NoProfile -EncodedCommand $enc"
```

## Pedidos do site → D:\Digital (desde 21/10/2026; VPS desde 19/11/2026)

O site roda na VPS (pasta pronta até 5 s depois de salvar). `puxar-pedidos.ps1` (no oraculo em `C:\FareFoto\sync\`) roda a cada minuto pela tarefa
"FareFoto Pedidos" (SYSTEM, funciona com a tela bloqueada), confere a cada 5 s por ~50 s e baixa as pastas novas de `/srv/fare/pedidos` para `D:\Digital`.
- Acesso: chave `C:\FareFoto\sync\id_ed25519` (só SYSTEM/Administradores) → usuário `fare-sync` na VPS (porta 63214), que só pode rodar o `/usr/local/bin/fare-sync-serve` (listar, baixar, confirmar).
- Confirmação: o que foi gravado no `D:\Digital` vai para `confirmar.txt` e sobe com `ack` na rodada seguinte. A VPS só apaga (depois de 3 dias) o que foi confirmado.
- Já baixados ficam em `C:\FareFoto\sync\baixados.txt`: pasta movida ou apagada pela equipe não volta.
- Orçamento que virou pedido: a pasta "Nome - ORC-0001" sai quando a "Nome - PED-0001" chega.
- Log: `C:\FareFoto\logs\pedidos-sync.log` (só registra quando baixa algo ou dá erro).
- O site antigo do oraculo (tarefa "FareFoto Site") está desabilitado.

## Comandas → impressora (`imprimir-comandas.ps1` + `ipp.ps1`)

Tarefa "FareFoto Impressao" a cada minuto: puxa a fila da VPS (`print-list`/`print-get`), manda por IPP direto para a WF-7840
(JPEG 148,5 × 210 mm, gaveta 1) e confirma (`print-done`). Respostas IPP de 0x0000 a 0x00FF são sucesso. Log `C:\FareFoto\logs\impressao.log`.
