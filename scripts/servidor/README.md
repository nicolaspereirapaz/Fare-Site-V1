# Servidor oficial: VPS Nitro (desde 19/11/2026)

Site, ponte do WhatsApp, voz, IA do painel e Omoney rodam na VPS (Debian 13, 4 vCPU, 7,8 GB, 120 GB).
O IP real e a porta SSH não ficam neste repositório público: nos scripts aparece `IP-DA-VPS`.
A chave SSH continua com o nome antigo (`fare_azure`). SSH só com chave; o firewall (`nftables.conf`) só deixa entrar SSH e ping.

**Entrada do público:** Cloudflare Tunnel (`cloudflared-config.yml`, serviço `cloudflared`). A VPS abre a conexão de saída
para o Cloudflare; `www`, a raiz e `reserva.farefoto.com.br` vão para `localhost:3000`. Nenhuma porta HTTP aberta.

**Deploy automático:** todo commit no `master` do GitHub entra no ar sozinho em até ~5 min
(a VPS confere a cada 2 min, faz o build numa cópia e só troca o site se o build passar).
Commit que só mexe em `scripts/servidor`, `scripts/oraculo` ou `scripts/ponte` é marcado como publicado sem build nem reinício.

- Script: `auto-deploy.sh` (na VPS em `/home/fare/auto-deploy.sh`), timer `farefoto-deploy.timer`. Log: `/home/fare/deploy.log`.
- Forçar: `ssh fare@IP-DA-VPS FORCE=1 ./auto-deploy.sh`
- Acesso ao GitHub: chave de deploy **só leitura**.
- Mudou um script daqui? Ele não se instala sozinho: copie para o lugar dele na VPS.

## Arquivos

| Arquivo | Na VPS | O que faz |
|---|---|---|
| `auto-deploy.sh` | `/home/fare/` | deploy do master (acima) |
| `backup-dados.mjs` | `/srv/fare/` | ponto de restauração a cada 3 h em `/srv/fare/backups` (`farefoto-backup.timer`); o oraculo puxa para o `D:\Backups` |
| `fare-sync-serve` | `/usr/local/bin/` | único comando do usuário `fare-sync` (chave do oraculo): pedidos, fila de impressão, backup, mídias e `ack` |
| `fare-limpar-pedidos` | `/usr/local/bin/` | de hora em hora: apaga arquivos de pedidos com mais de 3 dias **que o oraculo confirmou** (`ack`) |
| `limitar` | `/usr/local/bin/` | limita a taxa de um pipe (cópias grandes sem derrubar a internet da loja) |
| `systemd/` | `/etc/systemd/system/` | serviços: `farefoto` (site), `farefoto-ponte`, `farefoto-voz`, `farefoto-ia`, `hermes-gateway` (Omoney), timers; `farefoto-campanha` fica MASCARADA |
| `cloudflared-config.yml` | `/etc/cloudflared/config.yml` | túnel `fare-oraculo` (a credencial `.json` não vem para o repo) |
| `nftables.conf`, `sudoers-fare` | `/etc/` | firewall e sudo do usuário `fare` |
| `base.sh`, `servicos.sh` | `/root/` | preparação da VPS do zero (sistema base; site e serviços sem ligar) |
| `troca-vps.sh`, `caminhos.py` | `/root/` | roteiro da troca oraculo → VPS (19/11/2026), em etapas; `caminhos.py` troca `D:\Digital\...` por `/srv/fare/pedidos/...` no banco |
| `nfse-producao.sh` | — | da época do Google: grava NFSE_* no `.env.local` (o certificado na VPS fica em `/srv/fare/nfse/certificado.pfx`) |

O código da ponte, da voz e da IA do painel está em `scripts/ponte/`.

## Fotos ficam no oraculo

A VPS guarda os arquivos de pedidos só por 3 dias. O oraculo baixa para o `D:\Digital`, confirma (`fare-sync ack` →
`/var/lib/fare-sync/confirmados.txt`) e só então o `fare-limpar-pedidos` pode apagar. Oraculo fora do ar = nada é apagado.
