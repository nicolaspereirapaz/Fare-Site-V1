#!/bin/bash
# Instala site + serviços da Fare Foto na VPS. Não liga nada (a troca liga).
set -euo pipefail
find /home/fare -group fare-sync -exec chgrp -h fare {} +
loginctl enable-linger fare
chmod 755 /srv/fare
# site (mesmos passos do auto-deploy.sh)
cd /home/fare/repo
APP=/srv/fare/app
rsync -a --delete --exclude data --exclude .env.local .next/standalone/ "$APP/"
rsync -a --delete .next/static/ "$APP/.next/static/"
rsync -a --delete public/ "$APP/public/"
ln -sfn /srv/fare/data "$APP/data"
ln -sfn /srv/fare/.env.local "$APP/.env.local"
chown -R farefoto:farefoto "$APP" /srv/fare/data /srv/fare/pedidos /srv/fare/impressao /srv/fare/backups /srv/fare/nfse
# pastas que o oraculo (fare-sync) lê e limpa
chmod 2775 /srv/fare/pedidos /srv/fare/impressao /srv/fare/backups
install -m 755 -o fare -g fare scripts/servidor/auto-deploy.sh /home/fare/auto-deploy.sh
sudo -u fare git rev-parse HEAD > /home/fare/deployed-commit; chown fare:fare /home/fare/deployed-commit
install -m 644 -o farefoto -g farefoto scripts/oraculo/backup-dados.mjs /srv/fare/backup-dados.mjs
# comando único do oraculo: pedidos, impressão e agora backup
cat > /usr/local/bin/fare-sync-serve <<'C'
#!/bin/sh
# Único comando que a chave do oraculo pode rodar.
#   list / get          : pedidos (/srv/fare/pedidos) para o D:\Digital
#   print-list / print-get NOME / print-done NOME : fila de impressão (/srv/fare/impressao)
#   backup-get          : último ponto de restauração dos bancos (/srv/fare/backups/ponto-restauracao), em tar
set -- $SSH_ORIGINAL_COMMAND
case "$1" in
  list) cd /srv/fare/pedidos && find . -type f -printf "%s\t%P\n" ;;
  get) cd /srv/fare/pedidos && grep -v -e "^/" -e "\.\./" | tar --format=pax -cf - --no-recursion -T - ;;
  print-list) cd /srv/fare/impressao && ls -1 -- *.png 2>/dev/null || true ;;
  print-get|print-done)
    case "$2" in ""|*/*|.*) echo "nome invalido" >&2; exit 1 ;; esac
    f="/srv/fare/impressao/$2"; [ -f "$f" ] || { echo "nao existe" >&2; exit 1; }
    if [ "$1" = print-get ]; then cat "$f"; else rm -f "$f"; fi ;;
  backup-get) cd /srv/fare/backups && tar --format=pax -cf - ponto-restauracao ;;
  *) echo "comando nao permitido" >&2; exit 1 ;;
esac
C
chmod 755 /usr/local/bin/fare-sync-serve
# serviços (do Google) + backup a cada 3 h + túnel; campanha NÃO é instalada
U=/etc/systemd/system
for f in farefoto.service farefoto-ponte.service farefoto-voz.service farefoto-ia.service hermes-gateway.service farefoto-deploy.service farefoto-deploy.timer; do
  install -m 644 /root/gcp-extra/units/$f $U/$f
done
cp /root/gcp-extra/units/farefoto-campanha.service.desativado-20261118 $U/ 2>/dev/null || true
cat > $U/farefoto-backup.service <<'C'
[Unit]
Description=Ponto de restauracao dos bancos do site Fare Foto (sempre um so, sobrescrito)
[Service]
Type=oneshot
User=farefoto
Environment=FARE_DATA_DIR=/srv/fare/data FARE_BACKUP_DIR=/srv/fare/backups
ExecStart=/usr/bin/node --no-warnings /srv/fare/backup-dados.mjs
# o oraculo (fare-sync, grupo farefoto) puxa a copia
ExecStartPost=/bin/chmod -R g+rX /srv/fare/backups
C
cat > $U/farefoto-backup.timer <<'C'
[Unit]
Description=Backup Fare Foto a cada 3 horas
[Timer]
OnCalendar=*-*-* 00/3:00:00
Persistent=true
[Install]
WantedBy=timers.target
C
systemctl mask farefoto-campanha.service
systemctl daemon-reload
systemctl enable farefoto-backup.timer
echo SERVICOS-OK
