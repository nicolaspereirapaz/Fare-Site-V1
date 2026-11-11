# Site no Google Cloud (VM fare-site, 35.198.55.16; Tailscale 100.125.1.118)

Desde 06/11/2026 o site roda no Google Cloud. A chave SSH continua com o nome antigo (`fare_azure`).

**Deploy automático:** todo commit no `master` do GitHub entra no ar sozinho em até ~5 min
(a VM confere a cada 2 min, faz o build e só troca o site se o build passar).

- Script: `auto-deploy.sh` (na VM em `/home/fare/auto-deploy.sh`), timer `farefoto-deploy.timer`.
- Log: `ssh -i ~/.ssh/fare_azure fare@100.125.1.118 tail -20 deploy.log`
- Forçar: `ssh -i ~/.ssh/fare_azure fare@100.125.1.118 FORCE=1 ./auto-deploy.sh`
- Acesso ao GitHub: chave de deploy **só leitura** ("fare-azure").
- Mudou o script? Copie de novo para a VM: `scp -i ~/.ssh/fare_azure scripts/servidor/auto-deploy.sh fare@100.125.1.118:`
- Emissor de NFS-e em produção: `nfse-producao.sh` (roda uma vez; copia o certificado e grava NFSE_* no `/srv/fare/.env.local`).
