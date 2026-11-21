#!/bin/bash
# Preparação base da VPS Fare Foto (Debian 13).
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
hostnamectl set-hostname fare-vps
sed -i 's/\bmudar-hostname\b/fare-vps/g' /etc/hosts
grep -q fare-vps /etc/hosts || echo "127.0.1.1 fare-vps" >> /etc/hosts
timedatectl set-timezone America/Sao_Paulo
# contrib (fontes da Microsoft para o PDF da NFS-e)
sed -i -E 's/^Components: main$/Components: main contrib non-free-firmware/; s/^Components: main non-free-firmware$/Components: main contrib non-free-firmware/' /etc/apt/sources.list.d/debian.sources 2>/dev/null || true
[ -f /etc/apt/sources.list ] && sed -i -E '/^deb /{/contrib/! s/ main/ main contrib/}' /etc/apt/sources.list || true
apt-get update -q
apt-get -yq full-upgrade
apt-get -yq install curl ca-certificates gnupg git rsync sqlite3 ffmpeg poppler-utils unattended-upgrades apt-listchanges nftables build-essential python3-venv python3-dev jq htop sudo tar zstd
echo "ttf-mscorefonts-installer msttcorefonts/accepted-mscorefonts-eula select true" | debconf-set-selections
apt-get -yq install ttf-mscorefonts-installer || echo "AVISO: mscorefonts falhou"
# Node 22 (NodeSource)
if ! node -v 2>/dev/null | grep -q '^v22'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get -yq install nodejs
fi
# cloudflared (repo oficial)
mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o /usr/share/keyrings/cloudflare-main.gpg
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" > /etc/apt/sources.list.d/cloudflared.list
apt-get update -q && apt-get -yq install cloudflared
# atualizações de segurança automáticas
dpkg-reconfigure -f noninteractive unattended-upgrades
# usuários
id fare >/dev/null 2>&1 || useradd -m -s /bin/bash fare
echo "fare ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/fare && chmod 440 /etc/sudoers.d/fare
id farefoto >/dev/null 2>&1 || useradd --system --home-dir /srv/fare --shell /usr/sbin/nologin farefoto
id fare-sync >/dev/null 2>&1 || useradd -m -s /bin/bash fare-sync
install -d -m 700 -o fare -g fare /home/fare/.ssh
cp /root/.ssh/authorized_keys /home/fare/.ssh/authorized_keys && chown fare:fare /home/fare/.ssh/authorized_keys && chmod 600 /home/fare/.ssh/authorized_keys
install -d -o farefoto -g farefoto /srv/fare /srv/fare/data /srv/fare/pedidos /srv/fare/impressao /srv/fare/backups /srv/fare/nfse /srv/fare/app
# SSH só com chave
cat > /etc/ssh/sshd_config.d/10-fare.conf <<'C'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
C
sshd -t && systemctl reload ssh
# firewall: só SSH 63214 e ping entram
cat > /etc/nftables.conf <<'C'
#!/usr/sbin/nft -f
flush ruleset
table inet filter {
  chain input {
    type filter hook input priority 0; policy drop;
    ct state established,related accept
    ct state invalid drop
    iif lo accept
    meta l4proto { icmp, ipv6-icmp } accept
    tcp dport 63214 accept
  }
  chain forward { type filter hook forward priority 0; policy drop; }
  chain output { type filter hook output priority 0; policy accept; }
}
C
nft -c -f /etc/nftables.conf && systemctl enable --now nftables && nft -f /etc/nftables.conf
echo "--- versões"; node -v; npm -v; cloudflared --version; ffmpeg -version | head -1; pdftoppm -v 2>&1 | head -1; python3 -V
sshd -T | grep -E '^(passwordauthentication|permitrootlogin|kbdinteractive)'
