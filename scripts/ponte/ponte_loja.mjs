// Ponte do NÚMERO PRÓPRIO do painel de Atendimento (bridge-loja).
// Roda separada do bot atual: outra sessão (whatsapp-loja/session), outra porta (3002), outro controle.
// Todo chat particular desse número vai para o painel do site; as respostas saem pelo painel.
//
//   node ponte_loja.mjs            liga a ponte (reinicia sozinha se cair)
//   Conectar o número: abrir bridge-loja/conectar.html no navegador e escanear o QR
//   (WhatsApp do celular > Configurações > Aparelhos conectados > Conectar um aparelho).
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROFILE = path.resolve(HERE, '..', '..');
const BRIDGE = path.join(HERE, 'bridge-loja', 'bridge.js');
const SESSION = path.join(PROFILE, 'whatsapp-loja', 'session');
const PORT = process.env.FARE_PONTE_LOJA_PORT || '3002';
const PAGE = path.join(HERE, 'bridge-loja', 'conectar.html');
const LOG = path.join(HERE, 'bridge-loja', 'ponte.log');
const require = createRequire(import.meta.url);
const QRCode = require('/home/fare/hermes-agent/scripts/whatsapp-bridge/node_modules/qrcode-terminal/vendor/QRCode/index.js');
const QRErrorCorrectLevel = require('/home/fare/hermes-agent/scripts/whatsapp-bridge/node_modules/qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel.js');

mkdirSync(SESSION, { recursive: true });

function log(line) {
  const stamped = `${new Date().toLocaleString('pt-BR')} ${line}`;
  console.log(stamped);
  try { appendFileSync(LOG, stamped + '\n'); } catch {}
}

/** QR em SVG (mesmo codificador do qrcode-terminal que a ponte usa). */
export function qrSvg(text) {
  const qr = new QRCode(-1, QRErrorCorrectLevel.L);
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  const cells = [];
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) if (qr.modules[row][col]) cells.push(`M${col + 4},${row + 4}h1v1h-1z`);
  }
  const size = count + 8;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="360" height="360" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${cells.join('')}" fill="#000"/></svg>`;
}

function page(title, body, refresh = 3) {
  writeFileSync(PAGE, `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta http-equiv="refresh" content="${refresh}">
<title>${title}</title><style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f2f2f3;color:#1d2447}
main{background:#fff;padding:28px 32px;border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,.08);text-align:center;max-width:460px}h1{font-size:1.3rem;margin:0 0 12px}p{line-height:1.5;color:#4b4d55}</style></head>
<body><main><h1>${title}</h1>${body}<p style="font-size:.8rem;color:#888">Atualizado ${new Date().toLocaleTimeString('pt-BR')} · esta página se atualiza sozinha</p></main></body></html>`);
}

let stopping = false;
function start() {
  page('Ligando a ponte do WhatsApp…', '<p>Aguarde alguns segundos.</p>');
  const child = spawn(process.execPath, [BRIDGE, '--port', PORT, '--session', SESSION, '--mode', 'bot', '--pair-json'], {
    cwd: path.dirname(BRIDGE),
    env: {
      ...process.env,
      WHATSAPP_MODE: 'bot',
      WHATSAPP_DM_POLICY: 'open',
      WHATSAPP_ALLOWED_USERS: '*',
      WHATSAPP_GROUP_POLICY: 'disabled',
      WHATSAPP_SEND_READ_RECEIPTS: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  log(`ponte da loja ligada (porta ${PORT}, sessão ${SESSION})`);
  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    let event = null;
    try { event = JSON.parse(line); } catch { /* texto comum */ }
    if (event?.event === 'qr') {
      page('Conectar o número da loja', `${qrSvg(event.qr)}<p><b>No celular do número da loja:</b> WhatsApp &gt; Configurações &gt; <b>Aparelhos conectados</b> &gt; <b>Conectar um aparelho</b> e aponte para este QR.<br>O QR muda a cada ~20 s; a página acompanha.</p>`);
      log('QR novo para conectar (abra bridge-loja/conectar.html)');
      return;
    }
    if (event?.event === 'connected') {
      const id = String(event.user?.id || '').replace(/:.*@/, '@').replace(/@.*/, '');
      page('✅ WhatsApp conectado', `<p>Número conectado: <b>${id || '?'}</b>${event.user?.name ? ` (${event.user.name})` : ''}.<br>As conversas aparecem no painel de Atendimento.</p>`, 30);
      log(`conectado: ${id}`);
      return;
    }
    if (event?.event === 'error' && event.error === 'logged_out') {
      page('Número desconectado', '<p>O aparelho foi removido no celular. Para conectar de novo, apague a pasta <code>whatsapp-loja/session</code> e ligue a ponte outra vez.</p>', 30);
      log('desconectado pelo celular (logged_out)');
      return;
    }
    if (event?.event === 'disconnected') { log(`conexão caiu (motivo ${event.reason}); reconectando`); return; }
    if (event?.event) return; // outros eventos internos (mensagens ignoradas etc.)
    if (line.trim()) log(line);
  });
  readline.createInterface({ input: child.stderr }).on('line', (line) => line.trim() && log(`[erro] ${line}`));
  child.on('exit', (code) => {
    log(`ponte parou (código ${code})`);
    if (stopping) return;
    page('Ponte parada', '<p>Religando em 5 segundos…</p>');
    setTimeout(start, 5000);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { stopping = true; child.kill(); process.exit(0); });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) start();
