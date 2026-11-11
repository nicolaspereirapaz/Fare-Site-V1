#!/usr/bin/env bash
# Libera o emissor de NFS-e da equipe em produção (notas reais), na VM do Google (fare-site).
# Roda uma vez, no PC da loja (Git Bash): bash scripts/azure/nfse-producao.sh
#  1. copia o certificado A1 para /srv/fare/nfse/certificado.pfx (só o usuário do site lê);
#  2. grava NFSE_* (senha, ambiente 1 = produção) em /srv/fare/.env.local, sem mostrar a senha;
#  3. instala as fontes da Microsoft (Arial) para o PDF da nota (aceita a licença das fontes);
#  4. publica o commit no GitHub: o deploy automático faz o build e reinicia o site em ~5 min.
set -euo pipefail
VM=fare@100.125.1.118
SSH="ssh -i $HOME/.ssh/fare_azure -o ConnectTimeout=15"
PFX="/z/Arquivos/Programas/Certificado Digital/FARE FOTO ARTIGOS FOTOGRAFICOS LTDA_50344377000136.pfx"
SENHA_DE=/c/Users/Nicolas/Fare-NFSe/.env.local
REPO=$(cd "$(dirname "$0")/../.." && pwd)

[ -f "$PFX" ] || { echo "Certificado não encontrado (o drive Z: está conectado?)"; exit 1; }
grep -q '^NFSE_PFX_SENHA=.' "$SENHA_DE" || { echo "Senha do certificado não encontrada em $SENHA_DE"; exit 1; }

echo "1/4 Enviando certificado e configuração..."
$SSH $VM 'umask 077; cat > ~/nfse-certificado.pfx' < "$PFX"
{
  echo
  echo "# NFS-e: emissor da equipe (/equipe/nfse). Ambiente 1 = produção (notas reais)."
  echo "NFSE_PFX_PATH=/srv/fare/nfse/certificado.pfx"
  grep '^NFSE_PFX_SENHA=' "$SENHA_DE"
  echo "NFSE_AMBIENTE=1"
  echo "NFSE_SERIE=1"
  echo "NFSE_PTOTTRIB_SN=3.69"
} | $SSH $VM 'umask 077; cat > ~/nfse.env'

echo "2/4 Instalando no servidor..."
$SSH $VM 'bash -s' <<'REMOTO'
set -euo pipefail
trap 'rm -f ~/nfse-certificado.pfx ~/nfse.env' EXIT
sudo -n true 2>/dev/null || { echo "ERRO: sudo pediu senha no servidor."; exit 1; }
sudo install -d -m 700 -o farefoto -g farefoto /srv/fare/nfse
sudo install -m 600 -o farefoto -g farefoto ~/nfse-certificado.pfx /srv/fare/nfse/certificado.pfx
# Rodou de novo: troca as linhas NFSE_ antigas em vez de duplicar.
sudo sed -i '/^NFSE_/d;/^# NFS-e: emissor da equipe/d' /srv/fare/.env.local
sudo tee -a /srv/fare/.env.local < ~/nfse.env > /dev/null
echo "   certificado e .env.local ok ($(sudo grep -c '^NFSE_' /srv/fare/.env.local) linhas NFSE_)"

echo "3/4 Fontes Arial..."
echo "ttf-mscorefonts-installer msttcorefonts/accepted-mscorefonts-eula select true" | sudo debconf-set-selections
if sudo apt-get update -qq && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ttf-mscorefonts-installer > /dev/null; then
  ls /usr/share/fonts/truetype/msttcorefonts/ | grep -qi '^arial' && echo "   Arial instalada" || echo "   AVISO: pacote instalado mas sem Arial"
else
  echo "   AVISO: não instalou as fontes; o PDF sai em Helvetica (mesmas medidas da Arial)."
fi
REMOTO

echo "4/4 Publicando no GitHub (deploy automático)..."
git -C "$REPO" push origin master
echo "Pronto. O site reinicia sozinho em ~5 min, já emitindo em PRODUÇÃO."
