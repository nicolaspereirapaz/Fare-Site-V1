# Site no Azure (VM fare-site, 20.195.184.250)

**Deploy automático:** todo commit no `master` do GitHub entra no ar sozinho em até ~5 min
(a VM confere a cada 2 min, faz o build e só troca o site se o build passar).

- Script: `auto-deploy.sh` (na VM em `/home/fare/auto-deploy.sh`), timer `farefoto-deploy.timer`.
- Log: `ssh -i ~/.ssh/fare_azure fare@20.195.184.250 tail -20 deploy.log`
- Forçar: `ssh -i ~/.ssh/fare_azure fare@20.195.184.250 FORCE=1 ./auto-deploy.sh`
- Acesso ao GitHub: chave de deploy **só leitura** ("fare-azure").
- Mudou o script? Copie de novo para a VM: `scp -i ~/.ssh/fare_azure scripts/azure/auto-deploy.sh fare@20.195.184.250:`
