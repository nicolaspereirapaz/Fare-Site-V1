// Modo painel da ponte: cada mensagem de cliente vai para o painel do site (não para o Hermes),
// e o site manda as respostas (IA e vendedores) de volta por POST /fare/painel/enviar.
// Sem o arquivo fare-painel.json, o modo painel fica desligado e a ponte funciona como antes.
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Pix com o botão "Copiar chave Pix" do WhatsApp: a mesma mensagem payment_info que o WhatsApp Web
 * (e o sistema antigo, via wa-js sendPixKeyMessage) manda. Enviar com relayMessage + PIX_BIZ_NODE.
 */
export function pixPaymentContent({ key, keyType, name }, newId = () => randomBytes(6).toString('hex').toUpperCase()) {
  const params = {
    order: {
      items: [{ name: '', retailer_id: `custom-item-${newId()}`, amount: { offset: 1, value: 0 }, quantity: 0 }],
      order_type: 'ORDER_WITHOUT_AMOUNT',
      status: 'payment_requested',
      subtotal: { value: 0, offset: 1 },
    },
    total_amount: { value: 0, offset: 1 },
    reference_id: newId(),
    payment_settings: [
      { type: 'pix_static_code', pix_static_code: { key_type: keyType, merchant_name: name, key } },
      { type: 'cards', cards: { enabled: false } },
    ],
    external_payment_configurations: [{ payment_instruction: '', type: 'payment_instruction' }],
    additional_note: '',
    currency: 'BRL',
    type: 'physical-goods',
  };
  return {
    messageContextInfo: { messageSecret: randomBytes(32) },
    interactiveMessage: { nativeFlowMessage: { buttons: [{ name: 'payment_info', buttonParamsJson: JSON.stringify(params) }], messageVersion: 1 } },
  };
}

/** Nó "biz" que o WhatsApp exige para mostrar o cartão de pagamento (o Baileys não põe sozinho). */
export const PIX_BIZ_NODE = { tag: 'biz', attrs: { native_flow_name: 'payment_info' } };

/** Read-only menu text. Never invent numeric choices or expose opaque internal IDs. */
function painelMenuText(content) {
  const template=content.templateMessage;
  if(template?.interactiveMessageTemplate)return painelMenuText({interactiveMessage:template.interactiveMessageTemplate});
  const reply=content.listResponseMessage || content.buttonsResponseMessage || content.templateButtonReplyMessage || content.interactiveResponseMessage;
  const menu=content.listMessage || content.buttonsMessage || content.interactiveMessage || template || reply;
  if (!menu) return '';
  const clean=value=>typeof value==='string'?value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').trim().slice(0,4000):'';
  if(reply)return ['[Seleção no WhatsApp]',clean(reply.selectedDisplayText || reply.title || reply.body?.text) || '[Opção sem texto legível]'].join('\n').slice(0,4000);
  const array=value=>Array.isArray(value)?value.slice(0,50):[];
  const lines=['[Menu do WhatsApp]'];
  const add=value=>{const text=clean(value);if(text)lines.push(text);};
  let count=0;
  const option=(name,detail)=>{
    const title=clean(name),description=clean(detail);
    if(count<50 && (title || description)){lines.push('• '+[title,description].filter(Boolean).join(' — '));count++;}
  };
  const sections=value=>{for(const section of array(value)){
    if(!section || typeof section!=='object')continue;
    add(section.title);
    for(const row of array(section.rows)){
      if(count>=50)break;
      if(!row || typeof row!=='object')continue;
      option(row.title,row.description);
    }
  }};
  if(content.listMessage){
    add(menu.title);add(menu.description);add(menu.buttonText);sections(menu.sections);add(menu.footerText);
  }else if(content.buttonsMessage){
    add(menu.contentText);for(const button of array(menu.buttons))option(button?.buttonText?.displayText);add(menu.footerText);
  }else if(template){
    const hydrated=template.hydratedTemplate || template.hydratedFourRowTemplate || {};
    add(hydrated.hydratedTitleText);add(hydrated.hydratedContentText);
    for(const button of array(hydrated.hydratedButtons)){
      if(button?.quickReplyButton)option(button.quickReplyButton.displayText);
      else if(button?.urlButton)option(button.urlButton.displayText,button.urlButton.url);
      else if(button?.callButton)option(button.callButton.displayText,button.callButton.phoneNumber);
    }
    add(hydrated.hydratedFooterText);
  }else{
    add(menu.header?.title);add(menu.header?.subtitle);add(menu.body?.text);
    for(const button of array(menu.nativeFlowMessage?.buttons)){
      let params;
      try{if(typeof button?.buttonParamsJson!=='string' || button.buttonParamsJson.length>32000)continue;params=JSON.parse(button.buttonParamsJson);}catch{continue;}
      if(!params || typeof params!=='object' || Array.isArray(params))continue;
      if(button.name==='single_select'){add(params.title);sections(params.sections);}
      else option(params.display_text || params.title,button.name==='cta_url'?params.url:button.name==='cta_call'?params.phone_number:undefined);
    }
    add(menu.footer?.text);
  }
  lines.push('[Opções apenas para leitura; selecione pelo WhatsApp.]');
  const result=lines.join('\n');const suffix='\n[menu truncado]';
  return result.length>4000?result.slice(0,4000-suffix.length)+suffix:result;
}

/** Texto que o painel mostra. Mídia ainda não passa: vira um aviso para o vendedor. */
export function painelText(content = {}) {
  const text = content.conversation || content.extendedTextMessage?.text || '';
  if (text.trim()) return text.trim();
  const menu=painelMenuText(content);
  if(menu)return menu;
  const caption = content.imageMessage?.caption || content.videoMessage?.caption || content.documentMessage?.caption || '';
  if (content.imageMessage) return `[imagem]${caption ? ' ' + caption : ''}`;
  if (content.videoMessage) return `[vídeo]${caption ? ' ' + caption : ''}`;
  if (content.audioMessage) return '[áudio — ouça no celular]';
  if (content.documentMessage || content.documentWithCaptionMessage) return `[documento]${caption ? ' ' + caption : ''}`;
  if (content.stickerMessage) return '[figurinha]';
  if (content.locationMessage) return '[localização]';
  if (content.contactMessage || content.contactsArrayMessage) {
    const cards = content.contactMessage ? [content.contactMessage] : (content.contactsArrayMessage.contacts || []);
    return cards.slice(0, 20).map((card) => {
      const lines = String(card.vcard || '').slice(0, 32000).replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
      const clean = (value) => String(value || '').replace(/\\[nN]/g, ' ').replace(/\\([,;\\])/g, '$1').replace(/[\r\n\x00-\x1f]/g, ' ').trim().slice(0, 250);
      const field = (key) => lines.filter((line) => new RegExp(`^(?:[\\w-]+\\.)?${key}(?:;[^:]*)?:`, 'i').test(line));
      const value = (line) => line.slice(line.indexOf(':') + 1);
      const name = clean(card.displayName || (field('FN')[0] && value(field('FN')[0])) || (field('N')[0] && value(field('N')[0]).split(';').filter(Boolean).join(' ')));
      const phones = [...new Set(field('TEL').map((line) => {
        const number = clean(value(line).replace(/^tel:/i, ''));
        return number || line.match(/;waid=(\d+)/i)?.[1] || '';
      }).filter(Boolean))];
      return ['[contato]', name && `Nome: ${name}`, ...phones.map((phone) => `Telefone: ${phone}`), ...field('EMAIL').map((line) => `E-mail: ${clean(value(line))}`)].filter(Boolean).join('\n');
    }).join('\n\n').slice(0, 4000) || '[contato]';
  }
  return '';
}

const MEDIA_KEYS = [
  ['imageMessage', 'imagem'],
  ['videoMessage', 'video'],
  ['audioMessage', 'audio'],
  ['documentMessage', 'documento'],
  ['stickerMessage', 'figurinha'],
];

/** Foto/vídeo/áudio/documento/figurinha da mensagem (null se for só texto). */
export function mediaInfo(content = {}) {
  for (const [key, kind] of MEDIA_KEYS) {
    const node = content[key] || (key === 'documentMessage' ? content.documentWithCaptionMessage?.message?.documentMessage : null);
    if (node) {
      return { kind, mime: String(node.mimetype || 'application/octet-stream').split(';')[0], fileName: node.fileName || '', caption: (node.caption || '').trim() };
    }
  }
  return null;
}

/** Id da mensagem que o cliente citou ao responder (contextInfo.stanzaId), se houver. */
export function quotedIdOf(content = {}) {
  for (const value of Object.values(content)) {
    if (value && typeof value === 'object' && value.contextInfo?.stanzaId) return String(value.contextInfo.stanzaId);
  }
  return '';
}

/**
 * Mensagem citada para o Baileys: a original guardada na memória da ponte ou, se a ponte reiniciou,
 * uma reconstruída com id + texto (o WhatsApp mostra a citação do mesmo jeito).
 */
export function quotedFor(quote, chatId, messageStore) {
  if (!quote?.id) return undefined;
  const stored = messageStore?.get(quote.id);
  if (stored?.key && stored?.message) return stored;
  return { key: { remoteJid: chatId, id: String(quote.id), fromMe: !!quote.fromMe }, message: { conversation: String(quote.text || '').slice(0, 300) } };
}

/** O que mandar ao Baileys para enviar a foto/arquivo do painel. */
export function outboundPayload(buffer, { kind, mime, fileName, caption }) {
  const text = caption || undefined;
  if (kind === 'imagem' && mime.startsWith('image/')) return { image: buffer, caption: text, mimetype: mime };
  if (kind === 'video' && mime.startsWith('video/')) return { video: buffer, caption: text, mimetype: mime };
  // ogg/opus = mensagem de voz (aparece com a "bolinha" de voz no WhatsApp); outros áudios vão como arquivo de áudio.
  if (kind === 'audio' && mime === 'audio/ogg') return { audio: buffer, mimetype: 'audio/ogg; codecs=opus', ptt: true };
  if (kind === 'audio' && mime.startsWith('audio/')) return { audio: buffer, mimetype: mime };
  return { document: buffer, mimetype: mime || 'application/octet-stream', fileName: fileName || 'arquivo', caption: text };
}

/**
 * Telefone do contato a partir dos ids do WhatsApp (modo "todos os clientes"):
 * número do JID @s.whatsapp.net, ou o LID traduzido pelo mapa da sessão; sem tradução, o próprio número do LID.
 */
export function phoneFromIds(ids, lidToPhone = {}) {
  const clean = ids.filter(Boolean).map((id) => String(id).replace(/:\d+@/, '@'));
  for (const id of clean) if (id.endsWith('@s.whatsapp.net')) return id.replace(/@.*/, '');
  for (const id of clean) if (id.endsWith('@lid') && lidToPhone[id.replace(/@.*/, '')]) return String(lidToPhone[id.replace(/@.*/, '')]);
  for (const id of clean) if (id.endsWith('@lid')) return id.replace(/@.*/, '');
  return '';
}

const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'video/mp4': '.mp4', 'audio/ogg': '.ogg', 'audio/mpeg': '.mp3', 'application/pdf': '.pdf' };

export class FarePainel {
  /** dir: pasta com fare-painel.json ({"siteUrl": "...", "token": "..."}) e a fila em disco. */
  static fromDir(dir, options = {}) {
    const file = new URL('fare-painel.json', dir);
    if (!existsSync(file)) return new FarePainel(null, options);
    const config = JSON.parse(readFileSync(file, 'utf8'));
    return new FarePainel({ ...config, outbox: new URL('fare-painel-fila.jsonl', dir), mediaDir: fileURLToPath(new URL('midias-fila/', dir)), chatsFile: new URL('painel-chats.json', dir), rejectedFile: new URL('fare-painel-recusadas.jsonl', dir) }, options);
  }

  constructor(config, { fetchImpl = fetch, log = console, retryMs = 5000 } = {}) {
    this.enabled = !!(config?.siteUrl && config?.token);
    this.siteUrl = this.enabled ? String(config.siteUrl).replace(/\/$/, '') : '';
    this.token = this.enabled ? String(config.token) : '';
    this.outbox = config?.outbox || null;
    this.mediaDir = config?.mediaDir || null;
    this.fetch = fetchImpl;
    this.log = log;
    this.retryMs = retryMs;
    this.queue = [];
    this.flushing = null;
    // "todosClientes": todo chat particular vai para o painel (número próprio da loja), não só a lista autorizada.
    this.allCustomers = this.enabled && config?.todosClientes === true;
    this.chatsFile = config?.chatsFile || null;
    // Rede (Tailscale): endereço extra para ouvir e IPs que podem chamar as rotas /fare/painel (o servidor do site).
    this.listenHost = this.enabled ? String(config?.rede || '') : '';
    this.allowedIps = new Set(this.enabled && Array.isArray(config?.permitidos) ? config.permitidos.map(String) : []);
    this.rejectedFile = config?.rejectedFile || null;
    this.chats = new Map();
    if (this.chatsFile && existsSync(this.chatsFile)) {
      try {
        this.chats = new Map(Object.entries(JSON.parse(readFileSync(this.chatsFile, 'utf8'))));
      } catch {
        this.chats = new Map();
      }
    }
    if (this.enabled && this.outbox && existsSync(this.outbox)) {
      // Mensagens que não chegaram ao site antes de a ponte desligar.
      this.queue = readFileSync(this.outbox, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
    }
  }

  authorized(received) {
    if (!this.enabled || typeof received !== 'string') return false;
    const a = Buffer.from(received);
    const b = Buffer.from(this.token);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /** Guarda a mídia baixada até o site receber (sobrevive a reinício da ponte). */
  storeMedia(buffer, externalId, info) {
    if (!this.mediaDir) throw new Error('sem pasta de mídias');
    mkdirSync(this.mediaDir, { recursive: true });
    const ext = path.extname(info.fileName || '') || EXT[info.mime] || '';
    const file = path.join(this.mediaDir, String(externalId).replace(/[^A-Za-z0-9_-]/g, '_') + ext);
    writeFileSync(file, buffer);
    // Foto/vídeo/áudio do WhatsApp não têm nome: vira "foto.jpg", "video.mp4"... (no ZIP o número e a data vêm antes).
    const fallback = { imagem: 'foto', video: 'video', audio: 'audio', figurinha: 'figurinha' }[info.kind] || 'arquivo';
    return { path: file, kind: info.kind, mime: info.mime, fileName: info.fileName || fallback + ext };
  }

  save() {
    if (this.outbox) writeFileSync(this.outbox, this.queue.map((item) => JSON.stringify(item)).join('\n') + (this.queue.length ? '\n' : ''));
  }

  /** Guarda na fila (em disco) e tenta entregar já; na falha, tenta de novo a cada retryMs, na ordem. */
  forward(event) {
    if (!this.enabled) return Promise.resolve();
    this.queue.push(event);
    if (this.outbox) appendFileSync(this.outbox, JSON.stringify(event) + '\n');
    return this.flush();
  }

  flush() {
    if (!this.flushing) this.flushing = this.drain().finally(() => { this.flushing = null; });
    return this.flushing;
  }

  async drain() {
    while (this.queue.length) {
      const event = this.queue[0];
      let status = 0;
      let response = null;
      try {
        response = await this.post(event);
        status = response.status;
      } catch (error) {
        this.log.warn?.('[painel] site fora do ar; a mensagem fica na fila:', error?.message || error);
      }
      if (status >= 200 && status < 300) {
        this.queue.shift();
        this.dropMedia(event);
      } else if (status === 400) {
        // Recusada pelo site: guarda (com a mídia) em fare-painel-recusadas.jsonl para conferir/reenviar; não trava a fila.
        const reason = await response.text().catch(() => '');
        this.log.warn?.('[painel] mensagem recusada pelo site:', event.externalId, reason.slice(0, 300));
        this.queue.shift();
        if (this.rejectedFile) appendFileSync(this.rejectedFile, JSON.stringify({ at: new Date().toISOString(), reason: reason.slice(0, 500), event }) + '\n');
        else this.dropMedia(event);
      } else {
        if (status) this.log.warn?.('[painel] site respondeu', status, '- nova tentativa em', this.retryMs, 'ms');
        this.save();
        this.scheduleRetry();
        return;
      }
    }
    this.save();
  }

  /** Texto vai em JSON; foto/arquivo vai como corpo bruto, com os dados no cabeçalho x-fare-meta. */
  post(event) {
    const headers = { 'x-fare-token': this.token };
    if (event.media) {
      const { media, ...rest } = event;
      let body;
      try {
        body = readFileSync(media.path);
      } catch {
        // Arquivo sumiu do disco: avisa o vendedor em texto para não perder a mensagem.
        return this.post({ ...rest, text: `${rest.text ? rest.text + ' ' : ''}[${media.kind} perdida na ponte; veja no celular]` });
      }
      const meta = encodeURIComponent(JSON.stringify({ ...rest, kind: media.kind, mime: media.mime, fileName: media.fileName }));
      return this.fetch(`${this.siteUrl}/api/atendimento/upload/whatsapp`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/octet-stream', 'x-fare-meta': meta },
        body,
        signal: AbortSignal.timeout(120000),
      });
    }
    return this.fetch(`${this.siteUrl}/api/atendimento/whatsapp/entrada`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(15000),
    });
  }

  dropMedia(event) {
    if (event.media?.path) rmSync(event.media.path, { force: true });
  }

  scheduleRetry() {
    if (this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; void this.flush(); }, this.retryMs);
    this.timer.unref?.();
  }

  /** Ids das mensagens que o painel enviou: o eco delas não volta como "resposta do celular". */
  markOwn(id) {
    if (!id) return;
    this.own ??= new Set();
    this.own.add(id);
    if (this.own.size > 500) this.own.delete(this.own.values().next().value);
  }

  isOwn(id) { return !!id && !!this.own?.has(id); }

  /** Chat (particular ou grupo) que já falou com a loja: só para esses o painel pode enviar. O grupo interno nunca é anotado (bridge.js). */
  noteChat(chatId, phone) {
    if (!chatId || this.chats.get(chatId) === phone) return;
    this.chats.set(chatId, phone);
    if (this.chatsFile) writeFileSync(this.chatsFile, JSON.stringify(Object.fromEntries(this.chats)));
  }

  knowsChat(chatId) { return this.allCustomers && !!chatId && this.chats.has(chatId); }

  get pending() { return this.queue.length; }
}
