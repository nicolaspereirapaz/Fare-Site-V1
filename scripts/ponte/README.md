# Ponte do WhatsApp, voz e IA do painel (extensão `fare_atendimento`)

Na VPS em `/home/fare/hermes-painel/extensions/fare_atendimento/`. Serviços em `scripts/servidor/systemd/`.

- `ponte_loja.mjs` (`farefoto-ponte`, porta 3002, só local): sobe o `bridge-loja/bridge.js` (Baileys) com o número da loja e entrega as
  mensagens ao Atendimento do site (`fare_painel.mjs`, rota `/api/atendimento/whatsapp/entrada`, cabeçalho `x-fare-token`).
  Rotas extras: `/fare/painel/enviar`, `/fare/painel/reenvio` (pede ao celular a mensagem pelo id), `/fare/painel/lacuna`.
  Mensagem que não decifra vai para `ilegiveis.json` e o celular é chamado de novo em 2, 5, 15 e 30 min.
  `shouldIgnoreJid` ignora `@broadcast` (status travava a fila do Baileys).
- `painel_voz.py` (`farefoto-voz`, porta 8652, só local): transcrição com faster-whisper large-v3-turbo. `voz_tamanhos.py` entende medidas faladas.
- `painel_ia.py` (`farefoto-ia`): IA do painel (desligada pelo site: `ia_ligada=0`). `business_rules.py`, `knowledge.py`, `campaign_classifier.py`.
- `campaign_delivery.mjs`, `interactive_menus.mjs`: campanha (DESLIGADA; o serviço `farefoto-campanha` fica mascarado).
- `retranscrever.mjs`: refaz os áudios que ficaram "falhou" (versão do oraculo; ajuste o caminho do token).

**Fora do repositório (segredos e dados de clientes):** `bridge-loja/fare-painel.json` (token, ver `.exemplo.json`),
`bridge/fare-runtime.json` (grupo e telefones, ver `.exemplo.json`), `painel_ia.token`, a sessão do WhatsApp
(`/home/fare/hermes-painel/whatsapp-loja`), `painel-chats.json`, filas e logs.

O `bridge.js` vem do `scripts/whatsapp-bridge/bridge.js` do Hermes Agent (Nous Research, licença MIT), com as mudanças da Fare Foto.
