#!/bin/bash
# Troca oraculo -> VPS (19/11/2026). Uma etapa por vez: bash /root/troca-vps.sh <etapa>
#   preparar : desliga o site de teste e volta o .env.local de verdade
#   bancos   : instala os bancos de /root/troca/bancos (caminhos do Windows -> Linux, campanha e IA conferidas)
#   ponte    : instala a ponte do oraculo de /root/troca/ponte (sessão do WhatsApp + código com as correções de 19/11)
#   lista    : pastas da loja no lugar + lista do que já está no D:\Digital (oraculo não baixa de novo; VPS apaga em 3 dias)
#   ligar    : liga site, ponte, voz e IA e deixa tudo ligando no boot
#   tunel    : liga o cloudflared da VPS (só DEPOIS de parar o do oraculo)
#   testar   : confere tudo
set -euo pipefail
D=/srv/fare/data
H=/home/fare/hermes-painel
E=$H/extensions/fare_atendimento
BK=/home/fare/backups-migracao
mkdir -p $BK

case "${1:-}" in
preparar)
  systemctl stop farefoto farefoto-voz || true
  ln -sfn /srv/fare/.env.local /srv/fare/app/.env.local
  rm -f /srv/fare/.env.teste
  mkdir -p /root/troca/teste-antigo && mv $D/*.sqlite* /root/troca/teste-antigo/ 2>/dev/null || true
  echo "preparar ok"
  ;;
bancos)
  for f in farefoto.sqlite equipe.sqlite xbz-catalog.sqlite; do [ -s /root/troca/bancos/$f ] || { echo "falta $f"; exit 1; }; done
  for f in /root/troca/bancos/*.sqlite; do [ "$(sqlite3 $f 'pragma quick_check')" = ok ] || { echo "defeito em $f"; exit 1; }; done
  rm -f $D/*.sqlite $D/*.sqlite-wal $D/*.sqlite-shm $D/*.sqlite-journal
  cp /root/troca/bancos/*.sqlite $D/
  python3 /root/caminhos.py $D/farefoto.sqlite
  sqlite3 $D/farefoto.sqlite "update campaign_settings set enabled=0; update atd_meta set value='0' where key='ia_ligada';"
  echo "campanha enabled=$(sqlite3 $D/farefoto.sqlite 'select enabled from campaign_settings') ia_ligada=$(sqlite3 $D/farefoto.sqlite "select value from atd_meta where key='ia_ligada'") pedidos=$(sqlite3 $D/farefoto.sqlite 'select count(*) from fare_orders')"
  chown farefoto:farefoto $D/*.sqlite && chmod 640 $D/*.sqlite
  chown -R farefoto:farefoto $D
  echo "bancos ok"
  ;;
ponte)
  O=/root/troca/ponte
  [ -s $O/hermes-painel/whatsapp-loja/session/creds.json ] || { echo "sem creds.json da sessao"; exit 1; }
  tar -cf $BK/ponte-gcp-$(date +%H%M).tar -C /home/fare hermes-painel/whatsapp-loja hermes-painel/extensions/fare_atendimento/bridge-loja hermes-painel/extensions/fare_atendimento/ponte_loja.mjs
  rm -rf $H/whatsapp-loja.gcp && mv $H/whatsapp-loja $H/whatsapp-loja.gcp
  cp -a $O/hermes-painel/whatsapp-loja $H/whatsapp-loja
  rsync -a $O/hermes-painel/extensions/fare_atendimento/bridge-loja/ $E/bridge-loja/
  cp $O/hermes-painel/extensions/fare_atendimento/ponte_loja.mjs $E/ponte_loja.mjs
  sed -i 's#file:///C:/FareFoto/ponte/#file:///home/fare/#g; s#C:/FareFoto/ponte/#/home/fare/#g' $E/bridge-loja/bridge.js $E/bridge-loja/fare_painel.mjs $E/ponte_loja.mjs
  if grep -nE 'C:/|C:\\\\' $E/bridge-loja/bridge.js $E/bridge-loja/fare_painel.mjs $E/ponte_loja.mjs; then echo "ainda tem caminho do Windows"; exit 1; fi
  chown -R fare:fare $H/whatsapp-loja $E
  node --check $E/bridge-loja/bridge.js && node --check $E/ponte_loja.mjs
  echo "ponte ok"
  ;;
lista)
  # Antes de ligar o site: pastas que vieram da loja entram no lugar; tudo que está em /srv/fare/pedidos já está no
  # D:\Digital -> vai para o baixados.txt do oraculo (não baixa de novo) e para os confirmados (some da VPS em 3 dias).
  if [ -d /srv/fare/pedidos-chegando ]; then
    rsync -a --remove-source-files /srv/fare/pedidos-chegando/ /srv/fare/pedidos/
    find /srv/fare/pedidos-chegando -depth -type d -empty -delete
  fi
  chown -R farefoto:farefoto /srv/fare/pedidos
  find /srv/fare/pedidos -mindepth 1 -type d -exec chmod 2775 {} +
  (cd /srv/fare/pedidos && find . -type f -printf "%s\t%P\n") > /root/troca/baixados-vps.txt
  flock /var/lib/fare-sync/confirmados.lock sh -c 'cat /root/troca/baixados-vps.txt >> /var/lib/fare-sync/confirmados.txt'
  (cd /srv/fare/data/atendimento-midias && find . -type f -printf "%s\t%P\n") > /root/troca/midias-vps.txt
  echo "lista ok: $(wc -l < /root/troca/baixados-vps.txt) arquivo(s) de pedidos, $(wc -l < /root/troca/midias-vps.txt) mídia(s)"
  ;;
pastas-lista)
  # Pastas da loja copiadas DEPOIS da troca (em /srv/fare/pedidos-chegando): 1º a lista vai para o baixados.txt do
  # oraculo e para os confirmados; só então (pastas-juntar) entram no lugar, sem sobrescrever o que o site já gravou.
  (cd /srv/fare/pedidos-chegando && find . -type f -printf "%s\t%P\n") > /root/troca/baixados-tarde.txt
  flock /var/lib/fare-sync/confirmados.lock sh -c 'cat /root/troca/baixados-tarde.txt >> /var/lib/fare-sync/confirmados.txt'
  echo "pastas-lista ok: $(wc -l < /root/troca/baixados-tarde.txt) arquivo(s)"
  ;;
pastas-juntar)
  rsync -a --ignore-existing --remove-source-files /srv/fare/pedidos-chegando/ /srv/fare/pedidos/
  find /srv/fare/pedidos-chegando -mindepth 1 -depth -type d -empty -delete
  chown -R farefoto:farefoto /srv/fare/pedidos
  find /srv/fare/pedidos -mindepth 1 -type d -exec chmod 2775 {} +
  echo "pastas-juntar ok; sobrou em pedidos-chegando: $(find /srv/fare/pedidos-chegando -type f | wc -l) arquivo(s)"
  ;;
ligar)
  systemctl enable --now farefoto farefoto-ponte farefoto-voz farefoto-ia
  systemctl enable --now farefoto-deploy.timer farefoto-backup.timer fare-limpar-pedidos.timer
  echo "ligar ok"
  ;;
tunel)
  [ -f /etc/systemd/system/cloudflared.service ] || cloudflared --config /etc/cloudflared/config.yml service install
  systemctl enable --now cloudflared
  sleep 5; systemctl is-active cloudflared
  journalctl -u cloudflared --since "-1min" --no-pager | grep -iE "Registered tunnel connection|error" | tail -4
  ;;
testar)
  systemctl is-active farefoto farefoto-ponte farefoto-voz farefoto-ia hermes-gateway cloudflared farefoto-deploy.timer farefoto-backup.timer || true
  HDR=(-H "Host: www.farefoto.com.br" -H "X-Forwarded-Proto: https")
  for u in / /brindes /equipe/entrar /api/equipe/nfse; do printf "%-20s %s\n" "$u" "$(curl -s -o /dev/null -w '%{http_code}' "${HDR[@]}" http://127.0.0.1:3000$u)"; done
  echo "ponte: $(curl -s http://127.0.0.1:3002/health)"
  echo "ia: $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8651/)  voz: $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8652/saude)"
  echo "campanha: $(systemctl is-enabled farefoto-campanha 2>&1)  limpeza: $(systemctl is-active fare-limpar-pedidos.timer)"
  ;;
*) echo "uso: $0 preparar|bancos|ponte|ligar|tunel|testar"; exit 1 ;;
esac
