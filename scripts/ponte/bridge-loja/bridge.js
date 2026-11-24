#!/usr/bin/env node
/**
 * Hermes Agent WhatsApp Bridge
 *
 * Standalone Node.js process that connects to WhatsApp via Baileys
 * and exposes HTTP endpoints for the Python gateway adapter.
 *
 * Endpoints (matches gateway/platforms/whatsapp.py expectations):
 *   GET  /messages       - Long-poll for new incoming messages
 *   POST /send           - Send a message { chatId, message, replyTo?, mentions? }
 *   POST /edit           - Edit a sent message { chatId, messageId, message }
 *   POST /send-media     - Send media natively { chatId, filePath, mediaType?, caption?, fileName?, mentions? }
 *   POST /send-location  - Send location pin { chatId, latitude, longitude, name?, address? }
 *   POST /typing         - Send typing indicator { chatId }
 *   GET  /chat/:id       - Get chat info
 *   GET  /health         - Health check
 *
 * Usage:
 *   node bridge.js --port 3000 --session ~/.hermes/whatsapp/session
 */

import { createMenuRegistry } from './interactive_menus.mjs';
import { createCampaignDelivery, createFileStore, registerCampaignRoutes } from './campaign_delivery.mjs';
import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage, getAggregateVotesInPollMessage, decryptPollVote, getKeyAuthor, jidNormalizedUser, generateWAMessageFromContent, proto } from 'file:///home/fare/hermes-agent/scripts/whatsapp-bridge/node_modules/%40whiskeysockets/baileys/lib/index.js';
import { FareControl } from 'file:///home/fare/hermes-painel/extensions/fare_atendimento/bridge/fare_control.mjs';
import { FarePainel, mediaInfo, outboundPayload, painelText, phoneFromIds, quotedFor, quotedIdOf, pixPaymentContent, PIX_BIZ_NODE } from './fare_painel.mjs';
import express from 'file:///home/fare/hermes-agent/scripts/whatsapp-bridge/node_modules/express/index.js';
import { Boom } from 'file:///home/fare/hermes-agent/scripts/whatsapp-bridge/node_modules/%40hapi/boom/lib/index.js';
import pino from 'file:///home/fare/hermes-agent/scripts/whatsapp-bridge/node_modules/pino/pino.js';
import path from 'path';
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { randomBytes, createHash } from 'crypto';
import { execFileSync } from 'child_process';
import { tmpdir } from 'os';
import qrcode from 'file:///home/fare/hermes-agent/scripts/whatsapp-bridge/node_modules/qrcode-terminal/lib/main.js';
import { matchesAllowedSender, matchesAllowedUser, matchesInboundWhatsAppGroup, parseAllowedUsers } from 'file:///home/fare/hermes-agent/scripts/whatsapp-bridge/allowlist.js';
import { createOutboundIdTracker } from 'file:///home/fare/hermes-agent/scripts/whatsapp-bridge/outbound_ids.js';
import { classifyOwnerMessageGate } from 'file:///home/fare/hermes-agent/scripts/whatsapp-bridge/owner_message_gate.js';
import {
  addMentions,
  buildPollPayload,
  createReconnectScheduler,
  createVersionResolver,
  installConsoleStamps,
  buildLocationPayload,
  buildTextSendPayload,
  createBoundedMessageStore,
  createQuotedMediaCache,
  extractBridgeEvent,
  getMessageContent,
  inboundReadReceiptKeys,
  inferMediaType,
  mediaPayloadForFile,
  normalizeWhatsAppId,
  pollCreationMessageFromPayload,
  pollUpdateForAggregation,
  writeJsonLine,
} from 'file:///home/fare/hermes-agent/scripts/whatsapp-bridge/bridge_helpers.js';

// First statement: helpers capture console.log as a default at call time below.
installConsoleStamps();

// Parse CLI args
const args = process.argv.slice(2);
function getArg(name, defaultVal) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultVal;
}

const WHATSAPP_DEBUG =
  typeof process !== 'undefined' &&
  process.env &&
  typeof process.env.WHATSAPP_DEBUG === 'string' &&
  ['1', 'true', 'yes', 'on'].includes(process.env.WHATSAPP_DEBUG.toLowerCase());

// Opt-in: when true (and WHATSAPP_MODE === 'bot'), fromMe inbound messages
// that are NOT echoes of our own /send or /send-media calls are forwarded
// to the Python adapter with `fromOwner: true`. This lets plugins detect
// "owner just typed in this customer chat" — needed for handover / sliding
// TTL flows. Default OFF: existing deployments see no behavior change.
//
// Heuristic limitation: we distinguish bot-API-sent from owner-typed by
// looking up `key.id` in `recentlySentIds` (populated when /send returns).
// On bridge restart that set is empty, so a few in-flight bot replies may
// briefly look like owner-typed until they age out. Acceptable; we don't
// persist the set.
const FORWARD_OWNER_MESSAGES =
  typeof process !== 'undefined' &&
  process.env &&
  typeof process.env.WHATSAPP_FORWARD_OWNER_MESSAGES === 'string' &&
  ['1', 'true', 'yes', 'on'].includes(process.env.WHATSAPP_FORWARD_OWNER_MESSAGES.toLowerCase());

const SEND_READ_RECEIPTS =
  typeof process !== 'undefined' &&
  process.env &&
  typeof process.env.WHATSAPP_SEND_READ_RECEIPTS === 'string' &&
  ['1', 'true', 'yes', 'on'].includes(process.env.WHATSAPP_SEND_READ_RECEIPTS.toLowerCase());

const PORT = parseInt(getArg('port', '3000'), 10);
const SESSION_DIR = getArg('session', path.join(process.env.HOME || '~', '.hermes', 'whatsapp', 'session'));
// Cache directories: the Python gateway passes the profile-aware paths via
// env (HERMES_HOME-aware, new cache/ layout).  Fall back to the legacy
// hardcoded locations for bridges launched outside the gateway.
const IMAGE_CACHE_DIR = process.env.HERMES_IMAGE_CACHE_DIR
  || path.join(process.env.HOME || '~', '.hermes', 'image_cache');
const DOCUMENT_CACHE_DIR = process.env.HERMES_DOCUMENT_CACHE_DIR
  || path.join(process.env.HOME || '~', '.hermes', 'document_cache');
const AUDIO_CACHE_DIR = process.env.HERMES_AUDIO_CACHE_DIR
  || path.join(process.env.HOME || '~', '.hermes', 'audio_cache');

// Self-hash of this script file.  Reported in /health so the Python gateway
// can detect a running bridge that predates the current bridge.js and
// restart it instead of silently reusing stale code (stale-bridge trap:
// `hermes update` updates bridge.js on disk but a long-lived bridge process
// keeps serving the old behavior forever).
let SCRIPT_HASH = '';
try {
  SCRIPT_HASH = createHash('sha256')
    .update(readFileSync(fileURLToPath(import.meta.url)))
    .digest('hex')
    .slice(0, 16);
} catch {}
const FARE_BYPASS = Symbol('operator-system-send');
const FARE_CAMPAIGN = Symbol('campaign-send');
const fareConfig = JSON.parse(readFileSync(new URL('file:///home/fare/hermes-painel/extensions/fare_atendimento/bridge/fare-runtime.json'), 'utf8'));
const fare = new FareControl(path.join(SESSION_DIR, '..', 'fare-control.sqlite'), fareConfig);
const painel = FarePainel.fromDir(new URL('./', import.meta.url));
const menuRegistry = createMenuRegistry({file: new URL('./campaign-ledger/interactive-menus.json', import.meta.url)});
if (painel.enabled) { console.log('[painel] MODO PAINEL: clientes vão para', painel.siteUrl, '(pendentes:', painel.pending + ')'); void painel.flush(); }
/** Grupo que vai para o painel (número da loja): qualquer grupo, menos o interno de comandos (fareConfig.staffGroup). */
const painelGroup = (chatId) => painel.allCustomers && chatId.endsWith('@g.us') && chatId !== fareConfig.staffGroup;
/** Destino que o painel pode usar: chat que já falou com a loja (particular ou grupo), nunca o grupo interno. */
const painelTarget = (chatId) => typeof chatId === 'string' && !!chatId && chatId !== fareConfig.staffGroup && !!(fare.row(chatId) || painel.knowsChat(chatId));
/** Nome do grupo (vira o nome da conversa no painel); guardado por 10 min. */
const groupNames = new Map();
async function groupName(chatId) {
  const cached = groupNames.get(chatId);
  if (cached && Date.now() - cached.at < 600000) return cached.name;
  try {
    const name = String((await sock.groupMetadata(chatId))?.subject || '');
    groupNames.set(chatId, { name, at: Date.now() });
    return name;
  } catch {
    return cached?.name || '';
  }
}
/** Mensagem -> evento do painel; foto/arquivo é baixado (qualidade original) e guardado até o site receber. */
async function painelEvent(msg, base) {
  const content = getMessageContent(msg);
  // Reação (emoji) numa mensagem: o painel mostra no balão; emoji vazio = tirou. Histórico antigo não traz reações.
  const reaction = content.reactionMessage;
  if (reaction) return base.historico || !reaction.key?.id ? null : { ...base, reaction: { id: String(reaction.key.id), emoji: String(reaction.text || '') } };
  const media = mediaInfo(content);
  // Para o painel poder citar esta mensagem depois (histórico antigo não entra: tiraria as recentes da memória).
  if (!base.historico) messageStore.remember(msg);
  const quotedId = quotedIdOf(content);
  if (quotedId) base = { ...base, quotedId };
  // Synchronous durable registration precedes forwarding: a site click cannot race receipt.
  // Historical/own messages remain read-only; failed registration never exposes actions.
  try {
    const interactive = menuRegistry.receive(content, base);
    if (interactive) base = { ...base, interactive };
  } catch { console.warn('[painel] menu não registrado; mantido apenas para leitura'); }
  if (!media) {
    const text = painelText(content);
    return text ? { ...base, text } : null;
  }
  try {
    const download = downloadMediaMessage(msg, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage });
    // Mídia antiga pode depender do celular reenviar: no histórico, desiste depois de 90 s.
    const buffer = base.historico
      ? await Promise.race([download, sleep(90000).then(() => { throw new Error('tempo esgotado'); })])
      : await download;
    return { ...base, text: media.caption, media: painel.storeMedia(buffer, base.externalId, media) };
  } catch (error) {
    console.warn('[painel] não consegui baixar a mídia:', error?.message || error);
    return { ...base, text: `${painelText(content)} (não foi possível baixar; veja no celular)` };
  }
}
// ---------- Histórico antigo: pedido ao celular, de 50 em 50, voltando até a primeira mensagem ----------
// Começa da mensagem mais antiga que o site conhece de cada contato (GET {site}/api/atendimento/whatsapp/historico).
// Reiniciar a ponte no meio não perde nada: o site passa a conhecer as importadas e a próxima rodada continua dali.
const HISTORY_BATCH = 50;
const HISTORY_WAIT_MS = 60000;
const HISTORY_PAUSE_MS = 3000;
const historyRun = { running: false, chats: 0, chatsDone: 0, imported: 0, current: '', error: '', startedAt: '', finishedAt: '' };
let historyWaiter = null;
function onHistorySet({ messages, syncType }) {
  if (syncType === proto.HistorySync.HistorySyncType.ON_DEMAND && historyWaiter) historyWaiter(messages || []);
}
const historyTime = (msg) => Number(msg.messageTimestamp?.toNumber?.() ?? msg.messageTimestamp ?? 0) * 1000;
/** Pede ao celular as mensagens anteriores a `key`; null se ele não responder a tempo. */
function askHistory(key, timestampMs) {
  return new Promise((resolve) => {
    const done = (messages) => { clearTimeout(timer); historyWaiter = null; resolve(messages); };
    const timer = setTimeout(() => done(null), HISTORY_WAIT_MS);
    historyWaiter = done;
    sock.fetchMessageHistory(HISTORY_BATCH, key, timestampMs).catch((error) => {
      console.warn('[historico] pedido falhou:', error?.message || error);
      done(null);
    });
  });
}
async function runHistory(anchors) {
  Object.assign(historyRun, { running: true, chats: anchors.length, chatsDone: 0, imported: 0, current: '', error: '', startedAt: new Date().toISOString(), finishedAt: '' });
  try {
    for (const anchor of anchors) {
      historyRun.current = anchor.phone;
      let key = { remoteJid: anchor.chatId, id: anchor.externalId, fromMe: !!anchor.fromMe };
      let at = Number(anchor.timestampMs) || Date.now();
      const seen = new Set([anchor.externalId]);
      // Limite de segurança: 2000 x 50 = 100 mil mensagens por contato.
      for (let round = 0; round < 2000; round += 1) {
        while (!sock || connectionState !== 'connected') await sleep(5000);
        const batch = (await askHistory(key, at)) ?? (await askHistory(key, at));
        const older = (batch || [])
          .filter((msg) => msg.key?.id && msg.message && !seen.has(msg.key.id) && !String(msg.key.remoteJid || '').endsWith('@g.us'))
          .sort((a, b) => historyTime(a) - historyTime(b));
        if (!older.length) break;
        for (const msg of older) {
          seen.add(msg.key.id);
          const event = await painelEvent(msg, {
            externalId: msg.key.id, chatId: anchor.chatId, phone: anchor.phone, fromPhone: !!msg.key.fromMe,
            historico: true, sentAt: new Date(historyTime(msg)).toISOString(),
          });
          if (event) { await painel.forward(event); historyRun.imported += 1; }
        }
        key = older[0].key;
        at = historyTime(older[0]);
        await sleep(HISTORY_PAUSE_MS);
      }
      historyRun.chatsDone += 1;
    }
  } catch (error) {
    historyRun.error = String(error?.message || error).slice(0, 300);
    console.warn('[historico] parou:', historyRun.error);
  } finally {
    Object.assign(historyRun, { running: false, current: '', finishedAt: new Date().toISOString() });
    console.log('[historico] fim:', historyRun.imported, 'mensagens de', historyRun.chatsDone, 'contatos');
  }
}
function fareSystemSend(chatId, message) {
  return sendWithTimeout(chatId, {text: message}, {[FARE_BYPASS]: true});
}
function farePhone(primary, alternate, permitted) {
  const ids = [alternate, primary].filter(Boolean);
  for (const id of ids) {
    const clean = normalizeWhatsAppId(id);
    if (clean.endsWith('@s.whatsapp.net')) {
      const pn = clean.replace(/@.*/, '');
      if (permitted.includes(pn)) return pn;
    }
    for (const pn of permitted) if (matchesAllowedUser(id, new Set([pn]), SESSION_DIR)) return pn;
  }
  return '';
}
const PAIR_ONLY = args.includes('--pair-only');
const PAIR_JSON = args.includes('--pair-json');
const WHATSAPP_MODE = getArg('mode', process.env.WHATSAPP_MODE || 'self-chat'); // "bot" or "self-chat"
const WHATSAPP_DM_POLICY = String(process.env.WHATSAPP_DM_POLICY || 'open').trim().toLowerCase();
const WHATSAPP_GROUP_POLICY = String(process.env.WHATSAPP_GROUP_POLICY || 'pairing').trim().toLowerCase();
const ALLOWED_USERS = parseAllowedUsers(process.env.WHATSAPP_ALLOWED_USERS || '');
// Group authorization is by group JID, not by every participant's JID.  The
// Python adapter still applies group policy and mention rules after intake.
const GROUP_ALLOWED_USERS = parseAllowedUsers(process.env.WHATSAPP_GROUP_ALLOWED_USERS || '');
const DEFAULT_REPLY_PREFIX = '☤ *Hermes Agent*\n────────────\n';
const REPLY_PREFIX = process.env.WHATSAPP_REPLY_PREFIX === undefined
  ? DEFAULT_REPLY_PREFIX
  : process.env.WHATSAPP_REPLY_PREFIX.replace(/\\n/g, '\n');
const MAX_MESSAGE_LENGTH = parseInt(process.env.WHATSAPP_MAX_MESSAGE_LENGTH || '4096', 10);
const CHUNK_DELAY_MS = parseInt(process.env.WHATSAPP_CHUNK_DELAY_MS || '300', 10);
// Per-call timeout for sock.sendMessage(). Baileys occasionally hangs forever
// when uploading media to WhatsApp servers (and, less often, on text sends),
// which pins the bridge's HTTP handler until the upstream aiohttp timeout
// fires. Fail fast instead so the gateway can surface a real error and retry.
const SEND_TIMEOUT_MS = parseInt(process.env.WHATSAPP_SEND_TIMEOUT_MS || '60000', 10);

// --- Send queue: serialise all sock.sendMessage() calls across concurrent
//     HTTP handlers so a single Baileys socket never has overlapping sends.
//     Overlapping sends are the root cause of cross-chat contamination
//     (#33360) — the WhatsApp protocol-level routing can misdeliver when
//     two sendMessage() Promises race on the same socket. ---
let _sendQueue = Promise.resolve();

function enqueueSend(fn) {
  const task = _sendQueue.then(() => fn(), () => fn());
  _sendQueue = task.catch(() => {});
  return task;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sendWithTimeout(chatId, payload, options = {}, timeoutMs = SEND_TIMEOUT_MS) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`sendMessage timed out after ${timeoutMs / 1000}s`)),
      timeoutMs,
    );
  });
  const {[FARE_BYPASS]: systemSend, [FARE_CAMPAIGN]: campaignSend, ...socketOptions} = options;
  return enqueueSend(async () => {
    try {
      if (campaignSend && (fare.globalPaused() || !sock || connectionState !== 'connected'
          || !/^\d+@(s\.whatsapp\.net|lid)$/.test(chatId))) {
        throw new Error('CAMPAIGN_BLOCKED');
      }
      if (!systemSend && (fare.isPaused(chatId) || chatId.endsWith('@g.us'))) {
        throw new Error('FARE_PAUSED: saída automática bloqueada');
      }
      return await Promise.race([sock.sendMessage(chatId, payload, socketOptions), timeoutPromise]);
    } finally { clearTimeout(timer); }
  });
}

function sendSelectionWithTimeout(chatId, content, options = {}, timeoutMs = SEND_TIMEOUT_MS) {
  const {[FARE_BYPASS]: systemSend, [FARE_CAMPAIGN]: campaignSend} = options;
  return enqueueSend(async () => {
    // Recheck inside the shared queue; no signature, text conversion, or fallback.
    if (!campaignSend || !systemSend || fare.globalPaused() || !sock || connectionState !== 'connected'
        || !/^\d+@(s\.whatsapp\.net|lid)$/.test(chatId)) throw new Error('CAMPAIGN_BLOCKED');
    const message = generateWAMessageFromContent(chatId, content, {userJid: sock.user?.id});
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('native selection timed out')), timeoutMs);
    });
    try {
      await Promise.race([sock.relayMessage(chatId, message.message, {messageId: message.key.id}), timeout]);
      return message;
    } finally { clearTimeout(timer); }
  });
}

function formatOutgoingMessage(message) {
  // In bot mode, messages come from a different number so the prefix is
  // redundant — the sender identity is already clear.  Only prepend in
  // self-chat mode where bot and user share the same number.
  if (WHATSAPP_MODE !== 'self-chat') return message;
  return REPLY_PREFIX ? `${REPLY_PREFIX}${message}` : message;
}

function splitLongMessage(message, maxLength = MAX_MESSAGE_LENGTH) {
  const text = String(message || '');
  if (!text) return [];
  if (!Number.isFinite(maxLength) || maxLength < 1 || text.length <= maxLength) {
    return [text];
  }

  const chunks = [];
  let remaining = text;
  while (remaining.length > maxLength) {
    let splitAt = remaining.lastIndexOf('\n', maxLength);
    if (splitAt < Math.floor(maxLength / 2)) {
      splitAt = remaining.lastIndexOf(' ', maxLength);
    }
    if (splitAt < 1) splitAt = maxLength;

    chunks.push(remaining.slice(0, splitAt).trimEnd());
    remaining = remaining.slice(splitAt).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function rememberSentMessage(sent, payload) {
  if (!sent?.key?.id) return;
  if (sent.message) {
    messageStore.remember(sent);
    return;
  }
  const syntheticMessage = pollCreationMessageFromPayload(payload);
  if (syntheticMessage) {
    messageStore.remember({ ...sent, message: syntheticMessage });
  }
}

function trackSentMessageId(sent) {
  rememberSentId(sent?.key?.id);
}

function redactWhatsAppId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const [userPart, domainPart = ''] = raw.split('@', 2);
  const bare = userPart.split(':', 1)[0];
  const digits = bare.replace(/\D/g, '');
  const suffix = digits ? digits.slice(-4) : bare.slice(-4);
  return `${suffix ? `…${suffix}` : '…'}${domainPart ? `@${domainPart}` : ''}`;
}

function emitDebugEvent(payload) {
  if (!WHATSAPP_DEBUG) return;
  try {
    writeJsonLine({ event: 'debug', ...payload });
  } catch {}
}

mkdirSync(SESSION_DIR, { recursive: true });

// Build LID → phone reverse map from session files (lid-mapping-{phone}.json)
function buildLidMap() {
  const map = {};
  try {
    for (const f of readdirSync(SESSION_DIR)) {
      const m = f.match(/^lid-mapping-(\d+)\.json$/);
      if (!m) continue;
      const phone = m[1];
      const lid = JSON.parse(readFileSync(path.join(SESSION_DIR, f), 'utf8'));
      if (lid) map[String(lid)] = phone;
    }
  } catch {}
  return map;
}
let lidToPhone = buildLidMap();

const logger = pino({ level: 'warn' });

// Message queue for polling
const messageQueue = [];
const MAX_QUEUE_SIZE = 100;

// Track recently sent message IDs.  Two purposes:
//   1. Prevent echo-back loops with media in self-chat mode.
//   2. (When WHATSAPP_FORWARD_OWNER_MESSAGES=true) distinguish our own
//      bot-API outbound messages from owner-typed messages on the linked
//      device so we can forward only the latter.
// Capacity bounded (see outbound_ids.js) to keep memory flat under
// sustained sending.
const recentlySentIds = createOutboundIdTracker(512);
const recentlyProcessedPollUpdates = createOutboundIdTracker(512);
const messageStore = createBoundedMessageStore(512);
// Bounded cache of already-downloaded inbound media, so a later reply to an
// uncaptioned photo/video/document/voice note can still surface the original
// file — see createQuotedMediaCache's doc comment in bridge_helpers.js.
const quotedMediaCache = createQuotedMediaCache(512);

function normalizePollUpdateOptions(aggregation, pollUpdateMessage, meId) {
  const selected = [];
  for (const option of aggregation || []) {
    if ((option.voters || []).length > 0 && option.name && option.name !== 'Unknown') {
      selected.push(option.name);
    }
  }
  if (selected.length > 0) return selected;

  // Fallback for already-decrypted pollUpdateMessage payloads where Baileys did
  // not have the creation message available. This may only yield hashes, but
  // keeping them in metadata is still better than dropping the vote entirely.
  const raw = pollUpdateMessage?.vote?.selectedOptions || [];
  return raw.map(option => String(option)).filter(Boolean);
}

function pollAggregationSummary(aggregation) {
  return (aggregation || []).map(option => ({
    name: option?.name || '',
    voterCount: (option?.voters || []).length,
  }));
}

function logPollUpdateDiagnostic({ sourcePath, pollId, pollCreation, pollUpdates, selectedOptions, aggregation }) {
  const firstUpdate = pollUpdates?.[0] || {};
  try {
    writeJsonLine({
      event: 'poll_update_decode',
      sourcePath,
      pollId: pollId || '',
      pollCreationFound: !!pollCreation,
      updateKeys: Object.keys(firstUpdate),
      hasVote: !!firstUpdate.vote,
      selectedOptionsLength: selectedOptions?.length || 0,
      aggregation: pollAggregationSummary(aggregation),
    });
  } catch {}
}

function enqueuePollUpdateEvent({ key, update, selectedOptions, aggregation }) {
  const chatId = normalizeWhatsAppId(key?.remoteJid || update?.pollUpdates?.[0]?.pollUpdateMessageKey?.remoteJid || '');
  const senderId = normalizeWhatsAppId(
    key?.participant
    || update?.pollUpdates?.[0]?.pollUpdateMessageKey?.participant
    || chatId
  );
  const pollId = key?.id
    || update?.pollUpdates?.[0]?.pollCreationMessageKey?.id
    || update?.pollUpdates?.[0]?.pollUpdateMessageKey?.id
    || '';
  // Only surface votes on polls Hermes itself created (tracked when
  // /send-poll returns). Arbitrary human polls in a group chat must not
  // inject agent-visible messages on every vote.
  if (!pollId || !recentlySentIds.has(pollId)) {
    if (WHATSAPP_DEBUG) {
      try { writeJsonLine({ event: 'ignored', reason: 'foreign_poll_update', pollId }); } catch {}
    }
    return;
  }
  const chosenText = selectedOptions.length ? selectedOptions.join(', ') : `[Poll update${pollId ? `: ${pollId}` : ''}]`;
  const dedupeId = `poll:${pollId}:${senderId}:${selectedOptions.join('|')}`;
  if (recentlyProcessedPollUpdates.has(dedupeId)) return;
  recentlyProcessedPollUpdates.remember(dedupeId);
  const event = {
    messageId: `${pollId || 'poll'}:update:${Date.now()}`,
    chatId,
    senderId,
    senderName: senderId.replace(/@.*/, ''),
    chatName: chatId.replace(/@.*/, ''),
    isGroup: chatId.endsWith('@g.us'),
    body: chosenText,
    hasMedia: false,
    mediaType: 'poll_update',
    mime: '',
    fileName: '',
    nativeType: 'pollUpdateMessage',
    nativeMetadata: {
      pollUpdate: {
        pollId,
        selectedOptions,
        aggregation,
      },
    },
    mediaUrls: [],
    mentionedIds: [],
    quotedMessageId: pollId,
    quotedParticipant: '',
    quotedRemoteJid: chatId,
    quotedText: '',
    hasQuotedMessage: !!pollId,
    botIds: [],
    timestamp: Math.floor(Date.now() / 1000),
  };
  messageQueue.push(event);
  if (messageQueue.length > MAX_QUEUE_SIZE) {
    messageQueue.shift();
  }
}

function rememberSentId(id) {
  recentlySentIds.remember(id);
}

let sock = null;
let connectionState = 'disconnected';

function emitPairEvent(event) {
  if (!PAIR_JSON) return;
  try {
    writeJsonLine({ ts: Date.now(), ...event });
  } catch {}
}

const scheduleReconnect = createReconnectScheduler(() => startSocket());
const getWAVersion = createVersionResolver(fetchLatestBaileysVersion);

// ---------- Mensagem de cliente que não deu para decifrar (Bad MAC etc.), 19/11/2026 ----------
// O Baileys pede uma vez ao celular da loja o conteúdo; se a conexão cai nessa hora, a mensagem some do painel.
// Aqui ela fica guardada em disco (sobrevive a reinício), o pedido ao celular se repete 2, 5, 15 e 30 min depois e,
// se nada vier, o painel recebe um aviso (id próprio: a mensagem verdadeira ainda entra se chegar depois).
const UNREADABLE_FILE = new URL('./ilegiveis.json', import.meta.url);
const UNREADABLE_RETRY_MIN = [2, 5, 15, 30];
const unreadable = new Map((() => { try { return Object.entries(JSON.parse(readFileSync(UNREADABLE_FILE, 'utf8'))); } catch { return []; } })());
const saveUnreadable = () => {
  try { writeFileSync(UNREADABLE_FILE, JSON.stringify(Object.fromEntries(unreadable))); } catch (error) { console.warn('[ilegivel] não gravei a lista:', error?.message || error); }
};
function noteUnreadable(msg, phone) {
  const id = msg.key?.id;
  if (!id || unreadable.has(id)) return;
  unreadable.set(id, { key: { remoteJid: msg.key.remoteJid, id, fromMe: false }, phone, pushName: msg.pushName || '', at: Date.now(), tries: 0 });
  saveUnreadable();
  console.log('[ilegivel] não decifrou, vou pedir ao celular:', phone, id);
}
function resolveUnreadable(id) {
  if (!id || !unreadable.delete(id)) return;
  saveUnreadable();
  console.log('[ilegivel] chegou:', id);
}
let unreadableBusy = false;
setInterval(async () => {
  if (unreadableBusy || !sock || connectionState !== 'connected' || !unreadable.size) return;
  unreadableBusy = true;
  try {
    const now = Date.now();
    for (const [id, item] of unreadable) {
      if (connectionState !== 'connected') break;
      if (item.tries < UNREADABLE_RETRY_MIN.length) {
        if (now - item.at < UNREADABLE_RETRY_MIN[item.tries] * 60000) continue;
        item.tries += 1;
        saveUnreadable();
        try { await sock.requestPlaceholderResend(item.key); } catch (error) { console.warn('[ilegivel] pedido ao celular falhou:', id, error?.message || error); }
        console.log(`[ilegivel] pedi ao celular (${item.tries}/${UNREADABLE_RETRY_MIN.length}):`, item.phone, id);
      } else if (now - item.at >= (UNREADABLE_RETRY_MIN.at(-1) + 5) * 60000) {
        unreadable.delete(id);
        saveUnreadable();
        const hora = new Date(item.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
        if (painel.enabled) void painel.forward({ externalId: `${id}-ilegivel`, chatId: item.key.remoteJid, phone: item.phone, pushName: item.pushName,
          text: `⚠️ O cliente mandou uma mensagem às ${hora} que o sistema não conseguiu ler (falha do WhatsApp). Veja no celular da loja.` });
        console.log('[ilegivel] não veio; avisei no painel:', item.phone, id);
      }
    }
  } finally {
    unreadableBusy = false;
  }
}, 60000);

async function startSocket() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const version = await getWAVersion();

  sock = makeWASocket({
    ...(version ? { version } : {}),
    auth: state,
    logger,
    printQRInTerminal: false,
    browser: ['Hermes Agent', 'Chrome', '120.0'],
    syncFullHistory: false,
    markOnlineOnConnect: false,
    // Status (status@broadcast) e listas de transmissão não entram no Atendimento. Descartar na entrada evita que a
    // decifragem deles faça consultas USync que, sem resposta, travam a fila de mensagens por 60 s cada (19/11/2026).
    shouldIgnoreJid: (jid) => String(jid || '').endsWith('@broadcast'),
    // Required for Baileys 7.x: without this, incoming messages that need
    // E2EE session re-establishment are silently dropped (msg.message === null)
    getMessage: async (key) => {
      // We don't maintain a message store, so return a placeholder.
      // This is enough for Baileys to complete the retry handshake.
      return { conversation: '' };
    },
  });

  sock.ev.on('creds.update', () => { saveCreds(); lidToPhone = buildLidMap(); });
  sock.ev.on('messaging-history.set', onHistorySet);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      if (PAIR_JSON) {
        emitPairEvent({ event: 'qr', qr });
      } else {
        console.log('\n📱 Scan this QR code with WhatsApp on your phone:\n');
        // The QR block is multi-line art; a stamp on its first row would skew it.
        qrcode.generate(qr, { small: true }, (code) => process.stdout.write(`${code}\n`));
        console.log('\nWaiting for scan...\n');
      }
    }

    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      connectionState = 'disconnected';

      if (reason === DisconnectReason.loggedOut) {
        emitPairEvent({ event: 'error', error: 'logged_out', reason });
        if (!PAIR_JSON) {
          console.log('❌ Logged out. Delete session and restart to re-authenticate.');
        }
        process.exit(1);
      } else {
        // 515 = restart requested (common after pairing). Always reconnect.
        emitPairEvent({ event: 'disconnected', reason });
        if (!PAIR_JSON) {
          if (reason === 515) {
            console.log('↻ WhatsApp requested restart (code 515). Reconnecting...');
          } else {
            console.log(`⚠️  Connection closed (reason: ${reason}). Reconnecting in 3s...`);
          }
        }
        scheduleReconnect(reason === 515 ? 1000 : 3000);
      }
    } else if (connection === 'open') {
      connectionState = 'connected';
      const connectedUser = sock?.user
        ? {
            id: sock.user.id || null,
            name: sock.user.name || sock.user.verifiedName || null,
          }
        : null;
      emitPairEvent({ event: 'connected', user: connectedUser });
      if (!PAIR_JSON) {
        console.log('✅ WhatsApp connected!');
      }
      if (PAIR_ONLY) {
        if (!PAIR_JSON) {
          console.log('✅ Pairing complete. Credentials saved.');
        }
        // Give Baileys a moment to flush creds, then exit cleanly
        setTimeout(() => process.exit(0), 2000);
      }
    }
  });

  sock.ev.on('messages.update', async (updates) => {
    for (const { key, update } of updates || []) {
      if (!update?.pollUpdates) continue;
      const pollCreationId = key?.id || update.pollUpdates?.[0]?.pollCreationMessageKey?.id;
      const pollCreation = messageStore.get(pollCreationId);
      let aggregation = [];
      let pollUpdates = update.pollUpdates;
      try {
        if (pollCreation) {
          const meId = jidNormalizedUser(sock.user?.id || 'me');
          pollUpdates = update.pollUpdates.map(pollUpdate => (
            pollUpdateForAggregation({
              pollUpdateMessage: pollUpdate,
              pollUpdateMessageKey: pollUpdate.pollUpdateMessageKey,
              pollCreation,
              decryptPollVote,
              getKeyAuthor,
              meId,
              pollCreatorJids: [
                jidNormalizedUser(sock.user?.lid || ''),
                jidNormalizedUser(sock.user?.id || ''),
                getKeyAuthor(pollUpdate.pollCreationMessageKey || key, jidNormalizedUser(sock.user?.lid || '')),
                getKeyAuthor(pollUpdate.pollCreationMessageKey || key, jidNormalizedUser(sock.user?.id || '')),
              ],
              voterJids: [
                normalizeWhatsAppId(pollUpdate.pollUpdateMessageKey?.participant || ''),
                normalizeWhatsAppId(pollUpdate.pollUpdateMessageKey?.remoteJid || key?.remoteJid || ''),
              ],
            }) || pollUpdate
          ));
          aggregation = getAggregateVotesInPollMessage({
            message: pollCreation.message,
            pollUpdates,
          });
        }
      } catch (err) {
        console.warn('[bridge] failed to aggregate poll update:', err.message);
      }
      const selectedOptions = normalizePollUpdateOptions(aggregation, pollUpdates?.[0]);
      logPollUpdateDiagnostic({
        sourcePath: 'messages.update',
        pollId: pollCreationId,
        pollCreation,
        pollUpdates,
        selectedOptions,
        aggregation,
      });
      enqueuePollUpdateEvent({ key, update: { ...update, pollUpdates }, selectedOptions, aggregation });
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    // In self-chat mode, your own messages commonly arrive as 'append' rather
    // than 'notify'. Accept both and filter agent echo-backs below.
    if (type !== 'notify' && type !== 'append') return;

    const botIds = Array.from(new Set([
      normalizeWhatsAppId(sock.user?.id),
      normalizeWhatsAppId(sock.user?.lid),
    ].filter(Boolean)));

    for (const msg of messages) {
      if (!msg.message) {
        // Não decifrou (CIPHERTEXT): só conversa particular de cliente entra na lista de pedidos ao celular.
        if (painel.allCustomers && msg.messageStubType === proto.WebMessageInfo.StubType.CIPHERTEXT && !msg.key?.fromMe
          && /@(s\.whatsapp\.net|lid)$/.test(msg.key?.remoteJid || '')) {
          const phone = phoneFromIds([msg.key.remoteJidAlt, msg.key.remoteJid], lidToPhone);
          if (/^\d{10,15}$/.test(phone)) noteUnreadable(msg, phone);
        }
        continue;
      }
      resolveUnreadable(msg.key?.id);

      const chatId = msg.key.remoteJid;
      const senderId = msg.key.participant || chatId;
      // Baileys v7 carries the other form of the sender here (group: key.participantAlt,
      // DM: key.remoteJidAlt). A LID sender's phone twin makes a phone allowlist match with no
      // lid-mapping file yet (#63415, #72529) and is the identity Python sees, so first
      // contacts key the same session they will once the mapping exists.
      const senderAltId = normalizeWhatsAppId(msg.key.participantAlt || msg.key.remoteJidAlt || '');
      const resolvedSenderId = senderAltId.endsWith('@s.whatsapp.net') ? senderAltId : senderId;
      const isGroup = chatId.endsWith('@g.us');
      const senderNumber = resolvedSenderId.replace(/@.*/, '');
      emitDebugEvent({
        stage: 'upsert',
        type,
        fromMe: !!msg.key.fromMe,
        chatId: redactWhatsAppId(chatId),
        senderId: redactWhatsAppId(senderId),
        messageKeys: Object.keys(msg.message || {}),
      });

      // Handle fromMe messages based on mode
      let fromOwner = false;
      if (msg.key.fromMe) {
        // Grupo (menos o interno): o que a loja digitou no celular aparece no painel como "Celular".
        if (painelGroup(chatId)) {
          painel.noteChat(chatId, chatId.replace(/@.*/, ''));
          const ownId = msg.key.id;
          setTimeout(async () => {
            if (recentlySentIds.has(ownId) || painel.isOwn(ownId)) return;
            const ownEvent = await painelEvent(msg, { externalId: ownId, chatId, phone: '', fromPhone: true, groupName: await groupName(chatId) });
            if (ownEvent) void painel.forward(ownEvent);
          }, 2000);
          continue;
        }
        if (isGroup || chatId.includes('status')) {
          emitDebugEvent({
            stage: 'ignored',
            reason: isGroup ? 'from_me_group' : 'from_me_status',
            chatId: redactWhatsAppId(chatId),
          });
          continue;
        }

        if (WHATSAPP_MODE === 'bot') {
          // Bot mode: separate bot number. fromMe inbound is either
          //   (a) an echo of our own /send (recentlySentIds will catch it), or
          //   (b) a message the owner typed from their own phone using the
          //       linked-device session.
          //
          // We always drop (a). We drop (b) too unless the operator opts in
          // via WHATSAPP_FORWARD_OWNER_MESSAGES so existing deployments see
          // no behavior change. When opted in, we still gate on the
          // customer chatId allowlist — without that gate, any contact
          // the owner replied to would leak into Hermes and trigger
          // implicit handover. See `owner_message_gate.js`.
          if (painel.enabled) {
            const ownId = msg.key.id;
            const ownPhone = farePhone(chatId, msg.key.remoteJidAlt || '', fareConfig.customers)
              || (painel.allCustomers ? phoneFromIds([msg.key.remoteJidAlt, chatId], lidToPhone) : '');
            if (ownPhone && (fare.row(chatId) || (painel.allCustomers && /@(s\.whatsapp\.net|lid)$/.test(chatId)))) {
              if (painel.allCustomers) painel.noteChat(chatId, ownPhone);
              setTimeout(async () => {
                if (recentlySentIds.has(ownId) || painel.isOwn(ownId)) return;
                const ownEvent = await painelEvent(msg, { externalId: ownId, chatId, phone: ownPhone, fromPhone: true });
                if (ownEvent) void painel.forward(ownEvent);
              }, 2000);
            }
            continue;
          }
          const decision = classifyOwnerMessageGate({
            fromMe: true,
            fromOwnerEnabled: FORWARD_OWNER_MESSAGES,
            recentlySent: recentlySentIds,
            allowlistMatches: (id) => matchesAllowedUser(id, ALLOWED_USERS, SESSION_DIR),
            messageId: msg.key.id,
            chatId,
          });
          if (decision.action === 'drop_echo') continue;
          if (decision.action === 'drop_disabled') continue;
          if (decision.action === 'drop_allowlist') {
            try {
              writeJsonLine({
                event: 'ignored',
                reason: 'allowlist_mismatch_owner_chat',
                chatId,
                senderId,
              });
            } catch {}
            continue;
          }
          fromOwner = true;
        } else {
          // Self-chat mode: only allow messages in the user's own self-chat.
          // WhatsApp now uses LID (Linked Identity Device) format: 67427329167522@lid
          // AND classic format: 34652029134@s.whatsapp.net
          // sock.user has both: { id: "number:10@s.whatsapp.net", lid: "lid_number:10@lid" }
          const myNumber = (sock.user?.id || '').replace(/:.*@/, '@').replace(/@.*/, '');
          const myLid = (sock.user?.lid || '').replace(/:.*@/, '@').replace(/@.*/, '');
          const chatNumber = chatId.replace(/@.*/, '');
          const isSelfChat = (myNumber && chatNumber === myNumber) || (myLid && chatNumber === myLid);
          emitDebugEvent({
            stage: 'self_chat_check',
            matched: !!isSelfChat,
            chatId: redactWhatsAppId(chatId),
            accountId: redactWhatsAppId(sock.user?.id),
            accountLid: redactWhatsAppId(sock.user?.lid),
          });
          if (!isSelfChat) {
            emitDebugEvent({
              stage: 'ignored',
              reason: 'self_chat_mismatch',
              chatId: redactWhatsAppId(chatId),
              senderId: redactWhatsAppId(senderId),
            });
            continue;
          }
        }
      }

      // Demais grupos (número da loja): vão para o painel, com quem mandou e o nome do grupo. A IA do site nunca responde em grupo.
      if (isGroup && !msg.key.fromMe && painelGroup(chatId)) {
        painel.noteChat(chatId, chatId.replace(/@.*/, ''));
        const painelItem = await painelEvent(msg, {
          externalId: msg.key.id, chatId, phone: phoneFromIds([senderAltId, senderId], lidToPhone), pushName: msg.pushName || '', groupName: await groupName(chatId),
        });
        if (painelItem) void painel.forward(painelItem);
        continue;
      }
      // Grupo interno: somente controle autenticado, nunca encaminhado ao modelo.
      if (isGroup && !msg.key.fromMe) {
        const content = getMessageContent(msg);
        const commandText = content.conversation || content.extendedTextMessage?.text || '';
        const operator = farePhone(senderId, senderAltId, fareConfig.operators);
        await fare.command(chatId, operator, commandText, msg.key.id, fareSystemSend);
        continue;
      }
      // Handle !fromMe messages (from other people) based on mode.
      // Self-chat mode only responds to the user's own messages to
      // themselves — stranger DMs / group pings must never reach the
      // Python gateway, otherwise a pairing-code reply fires in response
      // to arbitrary incoming messages (#8389).
      if (!msg.key.fromMe) {
        if (WHATSAPP_MODE === 'self-chat') {
          try {
            writeJsonLine({
              event: 'ignored',
              reason: 'self_chat_mode_rejects_non_self',
              chatId,
              senderId,
            });
          } catch {}
          continue;
        }
        const intakeAllowed = isGroup
          ? matchesInboundWhatsAppGroup({
              chatId,
              groupPolicy: WHATSAPP_GROUP_POLICY,
              groupAllowedUsers: GROUP_ALLOWED_USERS,
              sessionDir: SESSION_DIR,
            })
          : WHATSAPP_DM_POLICY === 'pairing'
            || matchesAllowedSender(senderId, senderAltId, ALLOWED_USERS, SESSION_DIR);
        if (!intakeAllowed) {
          try {
            writeJsonLine({
              event: 'ignored',
              reason: isGroup ? 'group_policy_rejected' : 'allowlist_mismatch',
              chatId,
              senderId,
              senderAltId,
            });
          } catch {}
          continue;
        }
      }

      const phone = farePhone(senderId, senderAltId, fareConfig.customers);
      // Número próprio da loja ("todosClientes"): todo chat particular vai para o painel.
      if (painel.allCustomers && !isGroup) {
        // Só conversa particular: Status (status@broadcast), canais e listas de transmissão ficam de fora.
        if (msg.key.fromMe || !/@(s\.whatsapp\.net|lid)$/.test(chatId)) continue;
        const anyPhone = phone || phoneFromIds([senderAltId, senderId, msg.key.remoteJidAlt, chatId], lidToPhone);
        if (!anyPhone) continue;
        painel.noteChat(chatId, anyPhone);
        const painelItem = await painelEvent(msg, { externalId: msg.key.id, chatId, phone: anyPhone, pushName: msg.pushName || '' });
        if (painelItem) void painel.forward(painelItem);
        continue;
      }
      if (!fare.noteInbound(chatId, phone)) continue;
      if (painel.enabled) {
        if (msg.key.fromMe) continue;
        const painelItem = await painelEvent(msg, { externalId: msg.key.id, chatId, phone, pushName: msg.pushName || '' });
        if (painelItem) void painel.forward(painelItem);
        continue;
      }
      if (fare.isPaused(chatId)) {
        const content=getMessageContent(msg);
        fare.notePausedMessage(chatId,content.conversation || content.extendedTextMessage?.text || '',msg.key.id);
        continue;
      }
      const messageContent = getMessageContent(msg);
      if (messageContent.pollUpdateMessage) {
        const pollUpdateMessage = messageContent.pollUpdateMessage;
        const pollKey = pollUpdateMessage.pollCreationMessageKey || {
          id: pollUpdateMessage.key?.id || msg.key.id,
          remoteJid: chatId,
          participant: senderId,
        };
        const pollCreation = messageStore.get(pollKey.id);
        let aggregation = [];
        let pollUpdates = [pollUpdateMessage];
        try {
          if (pollCreation) {
            const meId = jidNormalizedUser(sock.user?.id || 'me');
            const pollUpdate = pollUpdateForAggregation({
              pollUpdateMessage,
              pollUpdateMessageKey: msg.key,
              pollCreation,
              decryptPollVote,
              getKeyAuthor,
              meId,
              pollCreatorJids: [
                jidNormalizedUser(sock.user?.lid || ''),
                jidNormalizedUser(sock.user?.id || ''),
                getKeyAuthor(pollUpdateMessage.pollCreationMessageKey || pollKey, jidNormalizedUser(sock.user?.lid || '')),
                getKeyAuthor(pollUpdateMessage.pollCreationMessageKey || pollKey, jidNormalizedUser(sock.user?.id || '')),
              ],
              voterJids: [
                normalizeWhatsAppId(msg.key?.participant || ''),
                normalizeWhatsAppId(msg.key?.remoteJid || chatId || ''),
                normalizeWhatsAppId(senderId || ''),
              ],
            });
            if (pollUpdate) pollUpdates = [pollUpdate];
            aggregation = getAggregateVotesInPollMessage({
              message: pollCreation.message,
              pollUpdates,
            });
          }
        } catch (err) {
          console.warn('[bridge] failed to aggregate poll upsert:', err.message);
        }
        const selectedOptions = normalizePollUpdateOptions(aggregation, pollUpdates[0]);
        logPollUpdateDiagnostic({
          sourcePath: 'messages.upsert',
          pollId: pollKey.id,
          pollCreation,
          pollUpdates,
          selectedOptions,
          aggregation,
        });
        enqueuePollUpdateEvent({
          key: { ...pollKey, remoteJid: pollKey.remoteJid || chatId, participant: pollKey.participant || senderId },
          update: { pollUpdates },
          selectedOptions,
          aggregation,
        });
        continue;
      }

      const event = await extractBridgeEvent({
        msg,
        chatId,
        senderId: resolvedSenderId,
        senderNumber,
        botIds,
        isGroup,
        downloadMedia: async (mediaMsg) => downloadMediaMessage(mediaMsg, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage }),
        cacheDirs: {
          image: IMAGE_CACHE_DIR,
          document: DOCUMENT_CACHE_DIR,
          audio: AUDIO_CACHE_DIR,
        },
        lookupQuotedMedia: (quotedChatId, quotedMessageId) => quotedMediaCache.get(quotedChatId, quotedMessageId),
      });
      event.fromOwner = fromOwner;

      // Ignore Hermes' own reply messages in self-chat mode to avoid loops.
      if (msg.key.fromMe && ((REPLY_PREFIX && event.body.startsWith(REPLY_PREFIX)) || recentlySentIds.has(msg.key.id))) {
        if (WHATSAPP_DEBUG) {
          emitDebugEvent({
            stage: 'ignored',
            reason: 'agent_echo',
            chatId: redactWhatsAppId(chatId),
            messageId: msg.key.id,
          });
        }
        continue;
      }

      // Skip empty messages (but not a bare quote-reply whose own text/media
      // is empty when the quoted message resolved to cached media).
      if (!event.body && !event.hasMedia && !event.quotedMediaUrls.length) {
        emitDebugEvent({
          stage: 'ignored',
          reason: 'empty',
          chatId: redactWhatsAppId(chatId),
          messageKeys: Object.keys(msg.message || {}),
        });
        continue;
      }

      messageStore.remember(msg);
      // Remember this message's already-downloaded media/text so a later
      // reply to it (even uncaptioned media) can resolve the original
      // content instead of seeing only a stripped-down quoted-message stub.
      quotedMediaCache.remember(chatId, msg.key.id, {
        body: event.body,
        hasMedia: event.hasMedia,
        mediaType: event.mediaType,
        mediaUrls: event.mediaUrls,
      });
      const testCommand=fare.profileTestCommand(chatId,event.body,msg.key.id);
      if (testCommand?.handled) {
        if (testCommand.reply) await fareSystemSend(chatId,testCommand.reply);
        continue;
      }
      if (testCommand?.reset) {
        for (let i=messageQueue.length-1;i>=0;i--) if (messageQueue[i].chatId===chatId) messageQueue.splice(i,1);
        event.body='/new';
      }
      if (/\b(?:quero|preciso|posso|chame|chamar|falar|atendimento)\b[\s\S]{0,100}\b(?:vendedor|atendente|humano|pessoa)\b/i.test(event.body || '')) {
        await fare.escalate(chatId, event.body, fareSystemSend);
        continue;
      }
      messageQueue.push(event);
      emitDebugEvent({
        stage: 'queued',
        chatId: redactWhatsAppId(chatId),
        senderId: redactWhatsAppId(senderId),
        fromOwner: !!fromOwner,
        bodyLength: event.body.length,
        hasMedia: event.hasMedia,
        mediaType: event.mediaType,
        queueLength: messageQueue.length,
      });
      if (messageQueue.length > MAX_QUEUE_SIZE) {
        messageQueue.shift();
      }
    }
  });
}

// HTTP server
const app = express();
app.use((req, res, next) => {
  const ip = String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  if (ip === '127.0.0.1' || ip === '::1') return next();
  if (painel.allowedIps.has(ip) && req.path.startsWith('/fare/painel/')) return next();
  return res.status(403).json({ error: 'Acesso negado' });
});
app.use(express.json());

// Host-header validation — defends against DNS rebinding.
// The bridge binds loopback-only (127.0.0.1) but a victim browser on
// the same machine could be tricked into fetching from an attacker
// hostname that TTL-flips to 127.0.0.1. Reject any request whose Host
// header doesn't resolve to a loopback alias.
// See GHSA-ppp5-vxwm-4cf7.
const _ACCEPTED_HOST_VALUES = new Set([
  'localhost',
  '127.0.0.1',
  '[::1]',
  '::1',
]);

app.use((req, res, next) => {
  const raw = (req.headers.host || '').trim();
  if (!raw) {
    return res.status(400).json({ error: 'Missing Host header' });
  }
  // Strip port suffix: "localhost:3000" → "localhost"
  const hostOnly = (raw.includes(':')
    ? raw.substring(0, raw.lastIndexOf(':'))
    : raw
  ).replace(/^\[|\]$/g, '').toLowerCase();
  if (!_ACCEPTED_HOST_VALUES.has(hostOnly) && !(painel.listenHost && hostOnly === painel.listenHost)) {
    return res.status(400).json({
      error: 'Invalid Host header. Bridge accepts loopback hosts only.',
    });
  }
  next();
});

// Barreira de transporte: cobre respostas, busy ACKs, edições, mídia e typing.
app.use((req, res, next) => {
  const id = req.body?.chatId;
  if (req.method === 'POST' && !req.path.startsWith('/fare/') && id &&
      (fare.isPaused(id) || id.endsWith('@g.us'))) {
    return res.status(423).json({error: 'FARE_PAUSED: conversa sob atendimento humano ou grupo interno'});
  }
  next();
});
app.post('/fare/profile-read', (req, res) => {
  const profile=typeof req.body?.chatId==='string'?fare.profile(req.body.chatId):null;
  if (!profile) return res.status(403).json({error:'Origem não comprovada'});
  return res.json(profile);
});
app.post('/fare/name', (req, res) => {
  const {chatId, name, profile_id, profile} = req.body || {};
  if (typeof chatId !== 'string' || !fare.row(chatId)) return res.status(403).json({error:'Origem não comprovada'});
  if (fare.profile(chatId).profile_id !== profile_id) return res.status(409).json({error:'Perfil foi alterado; resultado antigo descartado'});
  fare.updateName(chatId, name, profile_id);
  if (profile && typeof profile==='object') fare.saveProfile(chatId,profile,profile_id);
  return res.json({saved:true});
});
app.post('/fare/handoff', async (req, res) => {
  try {
    const {chatId, name, subject, profile_id, profile} = req.body || {};
    if (typeof chatId !== 'string' || !fare.row(chatId)) return res.status(403).json({error:'Origem não comprovada'});
    if (fare.profile(chatId).profile_id !== profile_id) return res.status(409).json({error:'Perfil foi alterado; resultado antigo descartado'});
    fare.updateName(chatId, name, profile_id);
    if (profile && typeof profile==='object') fare.saveProfile(chatId,profile,profile_id);
    const result = await fare.escalate(chatId, subject, fareSystemSend);
    return res.json(result);
  } catch (e) { return res.status(500).json({error:'Falha de intervenção; verificar operador'}); }
});
// Isolated campaign ledger lives beside this session's bridge module, never in site state.
const campaignDelivery = createCampaignDelivery({
  store: createFileStore(new URL('./campaign-ledger/delivery.json', import.meta.url)),
  validateSelection: input => menuRegistry.validate(input),
  sendSelection: async ({chatId}, content) => {
    const sent = await sendSelectionWithTimeout(chatId, content, {[FARE_BYPASS]: true, [FARE_CAMPAIGN]: true});
    trackSentMessageId(sent);
    messageStore.remember(sent);
    painel.markOwn(sent?.key?.id);
    return {messageId: sent?.key?.id};
  },
  send: async ({chatId, text}) => {
    const sent = await sendWithTimeout(chatId, {text}, {[FARE_BYPASS]: true, [FARE_CAMPAIGN]: true});
    trackSentMessageId(sent);
    messageStore.remember(sent);
    painel.markOwn(sent?.key?.id);
    return {messageId: sent?.key?.id};
  },
});
registerCampaignRoutes(app, {
  service: campaignDelivery,
  enabled: () => painel.enabled,
  authorized: token => painel.authorized(token),
  known: painelTarget,
  paused: () => fare.globalPaused(),
  connected: () => !!sock && connectionState === 'connected',
});
app.post('/fare/painel/enviar', async (req, res) => {
  if (!painel.enabled) return res.status(404).json({ error: 'Modo painel desligado' });
  if (!painel.authorized(req.get('x-fare-token'))) return res.status(401).json({ error: 'AUTH' });
  const { chatId, text: body, quote } = req.body || {};
  if (!painelTarget(chatId)) return res.status(403).json({ error: 'Destino não autorizado' });
  if (typeof body !== 'string' || !body.trim() || body.length > 4200) return res.status(400).json({ error: 'Texto inválido' });
  if (!sock || connectionState !== 'connected') return res.status(503).json({ error: 'Not connected to WhatsApp' });
  try {
    const chunks = splitLongMessage(body);
    let last = null;
    const quoted = quotedFor(quote, chatId, messageStore);
    for (let i = 0; i < chunks.length; i += 1) {
      // Só o 1º pedaço sai "citando" (igual ao /send da ponte).
      last = await sendWithTimeout(chatId, { text: chunks[i] }, { [FARE_BYPASS]: true, ...(i === 0 && quoted ? { quoted } : {}) });
      trackSentMessageId(last);
      messageStore.remember(last);
      painel.markOwn(last?.key?.id);
      if (i < chunks.length - 1) await sleep(CHUNK_DELAY_MS);
    }
    return res.json({ success: true, messageId: last?.key?.id || null });
  } catch (error) {
    return res.status(502).json({ error: String(error?.message || error).slice(0, 200) });
  }
});
// Reação do painel numa mensagem (emoji vazio tira a reação).
app.post('/fare/painel/reagir', async (req, res) => {
  if (!painel.enabled) return res.status(404).json({ error: 'Modo painel desligado' });
  if (!painel.authorized(req.get('x-fare-token'))) return res.status(401).json({ error: 'AUTH' });
  const { chatId, messageId, fromMe, emoji } = req.body || {};
  if (!painelTarget(chatId)) return res.status(403).json({ error: 'Destino não autorizado' });
  if (typeof messageId !== 'string' || !messageId || messageId.length > 200 || typeof emoji !== 'string' || emoji.length > 32) return res.status(400).json({ error: 'Reação inválida' });
  if (!sock || connectionState !== 'connected') return res.status(503).json({ error: 'Not connected to WhatsApp' });
  try {
    // Chave original guardada (no grupo ela traz quem mandou); senão, montada com o id.
    // shortcut: grupo sem a mensagem na memória da ponte fica sem participant e o WhatsApp pode ignorar; guardar o participant no site se precisar.
    const key = messageStore.get(messageId)?.key || { remoteJid: chatId, id: messageId, fromMe: !!fromMe };
    const sent = await sendWithTimeout(chatId, { react: { text: emoji, key } }, { [FARE_BYPASS]: true });
    trackSentMessageId(sent);
    painel.markOwn(sent?.key?.id);
    return res.json({ success: true });
  } catch (error) {
    return res.status(502).json({ error: String(error?.message || error).slice(0, 200) });
  }
});
// Editar (texto) ou apagar para todos uma mensagem que a loja mandou. O site confere os prazos do WhatsApp.
for (const action of ['editar', 'apagar']) {
  app.post(`/fare/painel/${action}`, async (req, res) => {
    if (!painel.enabled) return res.status(404).json({ error: 'Modo painel desligado' });
    if (!painel.authorized(req.get('x-fare-token'))) return res.status(401).json({ error: 'AUTH' });
    const { chatId, messageId, text: body } = req.body || {};
    if (!painelTarget(chatId)) return res.status(403).json({ error: 'Destino não autorizado' });
    if (typeof messageId !== 'string' || !messageId || messageId.length > 200) return res.status(400).json({ error: 'Mensagem inválida' });
    if (action === 'editar' && (typeof body !== 'string' || !body.trim() || body.length > MAX_MESSAGE_LENGTH)) return res.status(400).json({ error: 'Texto inválido' });
    if (!sock || connectionState !== 'connected') return res.status(503).json({ error: 'Not connected to WhatsApp' });
    try {
      // Chave original guardada (no grupo ela traz o participant); senão, montada com o id.
      const key = messageStore.get(messageId)?.key || { remoteJid: chatId, id: messageId, fromMe: true };
      const sent = await sendWithTimeout(chatId, action === 'editar' ? { text: body, edit: key } : { delete: key }, { [FARE_BYPASS]: true });
      trackSentMessageId(sent);
      painel.markOwn(sent?.key?.id);
      return res.json({ success: true });
    } catch (error) {
      return res.status(502).json({ error: String(error?.message || error).slice(0, 200) });
    }
  });
}
// Pix do painel com o botão "Copiar chave Pix" (mensagem payment_info, igual ao WhatsApp Web).
app.post('/fare/painel/enviar-pix', async (req, res) => {
  if (!painel.enabled) return res.status(404).json({ error: 'Modo painel desligado' });
  if (!painel.authorized(req.get('x-fare-token'))) return res.status(401).json({ error: 'AUTH' });
  const { chatId, key, keyType, name } = req.body || {};
  if (!painelTarget(chatId)) return res.status(403).json({ error: 'Destino não autorizado' });
  if (![key, keyType, name].every((value) => typeof value === 'string' && value.trim() && value.length <= 100)) return res.status(400).json({ error: 'Pix inválido' });
  if (!sock || connectionState !== 'connected') return res.status(503).json({ error: 'Not connected to WhatsApp' });
  try {
    // Na mesma fila dos outros envios (#33360), com o mesmo limite de tempo.
    const sent = await enqueueSend(async () => {
      const message = generateWAMessageFromContent(chatId, pixPaymentContent({ key, keyType, name }), { userJid: sock.user?.id });
      let timer;
      const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`sendMessage timed out after ${SEND_TIMEOUT_MS / 1000}s`)), SEND_TIMEOUT_MS); });
      try {
        await Promise.race([sock.relayMessage(chatId, message.message, { messageId: message.key.id, additionalNodes: [PIX_BIZ_NODE] }), timeout]);
      } finally { clearTimeout(timer); }
      return message;
    });
    trackSentMessageId(sent);
    messageStore.remember(sent);
    painel.markOwn(sent?.key?.id);
    return res.json({ success: true, messageId: sent?.key?.id || null });
  } catch (error) {
    return res.status(502).json({ error: String(error?.message || error).slice(0, 200) });
  }
});
// Foto/arquivo do painel: corpo bruto; destino e dados nos cabeçalhos (legenda e nome codificados).
app.post('/fare/painel/enviar-midia', express.raw({ type: () => true, limit: '100mb' }), async (req, res) => {
  if (!painel.enabled) return res.status(404).json({ error: 'Modo painel desligado' });
  if (!painel.authorized(req.get('x-fare-token'))) return res.status(401).json({ error: 'AUTH' });
  const chatId = req.get('x-chat-id') || '';
  if (!painelTarget(chatId)) return res.status(403).json({ error: 'Destino não autorizado' });
  if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Arquivo vazio' });
  if (!sock || connectionState !== 'connected') return res.status(503).json({ error: 'Not connected to WhatsApp' });
  const decode = (value) => { try { return decodeURIComponent(value || ''); } catch { return ''; } };
  try {
    const payload = outboundPayload(req.body, { kind: req.get('x-kind') || 'documento', mime: req.get('x-mime') || 'application/octet-stream', fileName: decode(req.get('x-file-name')), caption: decode(req.get('x-caption')) });
    let quote = null;
    try { quote = req.get('x-quote') ? JSON.parse(decode(req.get('x-quote'))) : null; } catch { quote = null; }
    const quoted = quotedFor(quote, chatId, messageStore);
    const sent = await sendWithTimeout(chatId, payload, { [FARE_BYPASS]: true, ...(quoted ? { quoted } : {}) }, 180000);
    trackSentMessageId(sent);
    messageStore.remember(sent);
    painel.markOwn(sent?.key?.id);
    return res.json({ success: true, messageId: sent?.key?.id || null });
  } catch (error) {
    return res.status(502).json({ error: String(error?.message || error).slice(0, 200) });
  }
});
// Nova conversa iniciada pela equipe: confere se o número tem WhatsApp e libera o envio para ele.
app.post('/fare/painel/numero', async (req, res) => {
  if (!painel.enabled || !painel.allCustomers) return res.status(404).json({ error: 'Modo painel desligado' });
  if (!painel.authorized(req.get('x-fare-token'))) return res.status(401).json({ error: 'AUTH' });
  const phone = String(req.body?.phone || '').replace(/\D/g, '');
  if (!/^\d{12,15}$/.test(phone)) return res.status(400).json({ error: 'Número inválido' });
  if (!sock || connectionState !== 'connected') return res.status(503).json({ error: 'Not connected to WhatsApp' });
  try {
    const [found] = (await sock.onWhatsApp(phone)) || [];
    if (!found?.exists || !found.jid) return res.status(404).json({ error: 'Sem WhatsApp' });
    const chatId = jidNormalizedUser(found.jid);
    painel.noteChat(chatId, phone);
    return res.json({ chatId, phone });
  } catch (error) {
    return res.status(502).json({ error: String(error?.message || error).slice(0, 200) });
  }
});
// Histórico antigo: POST começa (body opcional {phone} = só esse contato); GET mostra o andamento.
app.post('/fare/painel/historico', async (req, res) => {
  if (!painel.enabled) return res.status(404).json({ error: 'Modo painel desligado' });
  if (!painel.authorized(req.get('x-fare-token'))) return res.status(401).json({ error: 'AUTH' });
  if (historyRun.running) return res.json({ ok: true, alreadyRunning: true, ...historyRun });
  if (gapRun.running) return res.status(409).json({ error: 'Busca da lacuna rodando' });
  if (!sock || connectionState !== 'connected') return res.status(503).json({ error: 'Not connected to WhatsApp' });
  let anchors;
  try {
    const response = await fetch(`${painel.siteUrl}/api/atendimento/whatsapp/historico`, { headers: { 'x-fare-token': painel.token }, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`site respondeu ${response.status}`);
    anchors = (await response.json()).anchors;
  } catch (error) {
    return res.status(502).json({ error: String(error?.message || error).slice(0, 200) });
  }
  const only = String(req.body?.phone || '').replace(/\D/g, '');
  const list = (Array.isArray(anchors) ? anchors : []).filter((anchor) =>
    anchor && /@(s\.whatsapp\.net|lid)$/.test(String(anchor.chatId)) && anchor.externalId && /^\d{10,15}$/.test(String(anchor.phone)) && (!only || anchor.phone === only));
  void runHistory(list);
  return res.json({ ok: true, chats: list.length });
});
app.get('/fare/painel/historico', (req, res) => {
  if (!painel.enabled) return res.status(404).json({ error: 'Modo painel desligado' });
  if (!painel.authorized(req.get('x-fare-token'))) return res.status(401).json({ error: 'AUTH' });
  return res.json(historyRun);
});
// ---------- Lacuna: mensagens que chegaram com a ponte desconectada (18/11/2026) ----------
// POST {desde, ate, chats:[{chatId, phone, externalId?, fromMe?, timestampMs?}], dryRun?}. Para cada conversa pede ao celular
// as mensagens anteriores à âncora (sem âncora: id inventado com a data `ate`) e entrega ao site só as de `desde` a `ate`,
// com lacuna:true (o site põe na conversa atual, como não lidas, sem IA). dryRun só conta. GET mostra o andamento.
const gapRun = { running: false, dryRun: false, chats: 0, chatsDone: 0, found: 0, imported: 0, current: '', error: '', perChat: [], startedAt: '', finishedAt: '' };
const isoOrNull = (ms) => (ms ? new Date(ms).toISOString() : null);
async function runGap({ desde, ate, chats, dryRun }) {
  Object.assign(gapRun, { running: true, dryRun, chats: chats.length, chatsDone: 0, found: 0, imported: 0, current: '', error: '', perChat: [], startedAt: new Date().toISOString(), finishedAt: '' });
  try {
    for (const chat of chats) {
      gapRun.current = chat.phone;
      let key = chat.externalId
        ? { remoteJid: chat.chatId, id: chat.externalId, fromMe: !!chat.fromMe }
        : { remoteJid: chat.chatId, id: `3EB0${randomBytes(8).toString('hex').toUpperCase()}`, fromMe: false };
      let at = Number(chat.timestampMs) || ate;
      const seen = new Set([key.id]);
      const inGap = [];
      let total = 0, oldest = 0, newest = 0;
      // Limite: 40 x 50 = 2000 mensagens por conversa.
      for (let round = 0; round < 40; round += 1) {
        while (!sock || connectionState !== 'connected') await sleep(5000);
        const batch = (await askHistory(key, at)) ?? (await askHistory(key, at));
        const older = (batch || [])
          .filter((msg) => msg.key?.id && msg.message && !seen.has(msg.key.id) && !String(msg.key.remoteJid || '').endsWith('@g.us'))
          .sort((a, b) => historyTime(a) - historyTime(b));
        if (!older.length) break;
        total += older.length;
        for (const msg of older) {
          seen.add(msg.key.id);
          const time = historyTime(msg);
          if (time >= desde && time < ate) inGap.push(msg);
        }
        oldest = historyTime(older[0]);
        newest = Math.max(newest, historyTime(older.at(-1)));
        if (oldest < desde) break;
        key = older[0].key;
        at = oldest;
        await sleep(HISTORY_PAUSE_MS);
      }
      inGap.sort((a, b) => historyTime(a) - historyTime(b));
      gapRun.found += inGap.length;
      gapRun.perChat.push({ phone: chat.phone, total, inGap: inGap.length, oldest: isoOrNull(oldest), newest: isoOrNull(newest) });
      if (!dryRun) {
        for (const msg of inGap) {
          const event = await painelEvent(msg, {
            externalId: msg.key.id, chatId: chat.chatId, phone: chat.phone, fromPhone: !!msg.key.fromMe, pushName: msg.pushName || '',
            historico: true, lacuna: true, sentAt: new Date(historyTime(msg)).toISOString(),
          });
          if (event) { await painel.forward(event); gapRun.imported += 1; }
        }
      }
      gapRun.chatsDone += 1;
      await sleep(HISTORY_PAUSE_MS);
    }
  } catch (error) {
    gapRun.error = String(error?.message || error).slice(0, 300);
    console.warn('[lacuna] parou:', gapRun.error);
  } finally {
    Object.assign(gapRun, { running: false, current: '', finishedAt: new Date().toISOString() });
    console.log('[lacuna] fim:', gapRun.found, 'mensagens no período,', gapRun.imported, 'entregues ao site,', gapRun.chatsDone, 'conversas', dryRun ? '(teste)' : '');
  }
}
app.post('/fare/painel/lacuna', (req, res) => {
  if (!painel.enabled) return res.status(404).json({ error: 'Modo painel desligado' });
  if (!painel.authorized(req.get('x-fare-token'))) return res.status(401).json({ error: 'AUTH' });
  if (historyRun.running || gapRun.running) return res.status(409).json({ error: 'Já tem uma busca de histórico rodando' });
  if (!sock || connectionState !== 'connected') return res.status(503).json({ error: 'Not connected to WhatsApp' });
  const desde = Date.parse(String(req.body?.desde || ''));
  const ate = Date.parse(String(req.body?.ate || ''));
  if (!(desde > 0 && ate > desde)) return res.status(400).json({ error: 'desde/ate inválidos' });
  const chats = (Array.isArray(req.body?.chats) ? req.body.chats : []).filter((chat) =>
    chat && /@(s\.whatsapp\.net|lid)$/.test(String(chat.chatId)) && /^\d{10,15}$/.test(String(chat.phone)));
  if (!chats.length) return res.status(400).json({ error: 'sem conversas' });
  void runGap({ desde, ate, chats, dryRun: req.body?.dryRun === true });
  return res.json({ ok: true, chats: chats.length, dryRun: req.body?.dryRun === true });
});
app.get('/fare/painel/lacuna', (req, res) => {
  if (!painel.enabled) return res.status(404).json({ error: 'Modo painel desligado' });
  if (!painel.authorized(req.get('x-fare-token'))) return res.status(401).json({ error: 'AUTH' });
  return res.json(gapRun);
});
// Reenvio pelo celular: mensagem que chegou e não deu para decifrar (Bad MAC etc.). POST {keys:[{remoteJid, id, fromMe?}]}
// pede ao celular da loja o conteúdo pelo id exato; a resposta chega como mensagem nova e segue o caminho normal até o site.
app.post('/fare/painel/reenvio', async (req, res) => {
  if (!painel.enabled) return res.status(404).json({ error: 'Modo painel desligado' });
  if (!painel.authorized(req.get('x-fare-token'))) return res.status(401).json({ error: 'AUTH' });
  if (!sock || connectionState !== 'connected') return res.status(503).json({ error: 'Not connected to WhatsApp' });
  const keys = (Array.isArray(req.body?.keys) ? req.body.keys : [])
    .filter((key) => key && /@(s\.whatsapp\.net|lid)$/.test(String(key.remoteJid)) && /^[0-9A-F]{10,40}$/i.test(String(key.id)))
    .slice(0, 50);
  if (!keys.length) return res.status(400).json({ error: 'sem mensagens' });
  const results = await Promise.all(keys.map(async (key) => {
    try {
      const requestId = await sock.requestPlaceholderResend({ remoteJid: key.remoteJid, fromMe: !!key.fromMe, id: key.id });
      return { id: key.id, requestId: requestId ?? null };
    } catch (error) {
      return { id: key.id, error: String(error?.message || error).slice(0, 160) };
    }
  }));
  return res.json({ ok: true, results });
});
// Foto de perfil do contato (para o painel mostrar no lugar das iniciais). 404 = sem foto ou escondida pela privacidade.
app.get('/fare/painel/foto', async (req, res) => {
  if (!painel.enabled) return res.status(404).json({ error: 'Modo painel desligado' });
  if (!painel.authorized(req.get('x-fare-token'))) return res.status(401).json({ error: 'AUTH' });
  const chatId = String(req.query.chatId || '');
  if (chatId.endsWith('@g.us') || !(fare.row(chatId) || painel.knowsChat(chatId))) return res.status(403).json({ error: 'Destino não autorizado' });
  if (!sock || connectionState !== 'connected') return res.status(503).json({ error: 'Not connected to WhatsApp' });
  // O WhatsApp nem sempre entrega a foto pelo LID: tenta também pelo número (JID @s.whatsapp.net), e a miniatura.
  const phone = String(req.query.phone || painel.chats?.get(chatId) || '').replace(/\D/g, '');
  const ids = [chatId, ...(phone ? [phone + '@s.whatsapp.net'] : [])];
  // Pedido simples (sem o "tctoken" que o Baileys anexa): com o token o WhatsApp não responde para a maioria
  // dos contatos; sem ele devolve a foto em ~0,1 s (testado). Primeiro pelo LID, depois pelo número.
  const plain = (jid) => sock.query({ tag: 'iq', attrs: { target: jid, to: 's.whatsapp.net', type: 'get', xmlns: 'w:profile:picture' },
    content: [{ tag: 'picture', attrs: { type: 'image', query: 'url' } }] }, 8000)
    .then((result) => result?.content?.find?.((node) => node.tag === 'picture')?.attrs?.url);
  const ways = ids.map((id) => () => plain(id));
  for (const way of ways) {
    try {
      const url = await way();
      if (!url) continue;
      const picture = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!picture.ok) continue;
      res.set('content-type', picture.headers.get('content-type') || 'image/jpeg');
      return res.send(Buffer.from(await picture.arrayBuffer()));
    } catch {
      // sem foto por esse jeito (privacidade, 404): tenta o próximo
    }
  }
  return res.status(404).json({ error: 'Sem foto' });
});
// Poll for new messages (long-poll style)
app.get('/messages', (req, res) => {
  const msgs = messageQueue.splice(0, messageQueue.length).filter(event => !fare.isPaused(event.chatId));
  res.json(msgs);
});

// Send a message
app.post('/send', async (req, res) => {
  if (!sock || connectionState !== 'connected') {
    return res.status(503).json({ error: 'Not connected to WhatsApp' });
  }

  const { chatId, message, replyTo, mentions } = req.body;
  if (!chatId || !message) {
    return res.status(400).json({ error: 'chatId and message are required' });
  }

  try {
    const chunks = splitLongMessage(formatOutgoingMessage(message));
    const messageIds = [];
    for (let i = 0; i < chunks.length; i += 1) {
      const { content: payload, options } = buildTextSendPayload(chunks[i], {
        chatId,
        replyTo: i === 0 ? replyTo : undefined,
        mentions: i === 0 ? mentions : undefined,
        messageStore,
      });
      const sent = await sendWithTimeout(chatId, payload, options);
      trackSentMessageId(sent);
      messageStore.remember(sent);
      if (sent?.key?.id) messageIds.push(sent.key.id);
      if (chunks.length > 1 && i < chunks.length - 1) {
        await sleep(CHUNK_DELAY_MS);
      }
    }

    res.json({
      success: true,
      messageId: messageIds[messageIds.length - 1],
      messageIds,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Edit a previously sent message
app.post('/edit', async (req, res) => {
  if (!sock || connectionState !== 'connected') {
    return res.status(503).json({ error: 'Not connected to WhatsApp' });
  }

  const { chatId, messageId, message } = req.body;
  if (!chatId || !messageId || !message) {
    return res.status(400).json({ error: 'chatId, messageId, and message are required' });
  }

  try {
    const key = { id: messageId, fromMe: true, remoteJid: chatId };
    const chunks = splitLongMessage(formatOutgoingMessage(message));
    const messageIds = [];

    await sendWithTimeout(chatId, { text: chunks[0], edit: key });
    if (chunks.length > 1) {
      for (let i = 1; i < chunks.length; i += 1) {
        const sent = await sendWithTimeout(chatId, { text: chunks[i] });
        trackSentMessageId(sent);
        if (sent?.key?.id) messageIds.push(sent.key.id);
        if (i < chunks.length - 1) {
          await sleep(CHUNK_DELAY_MS);
        }
      }
    }

    res.json({ success: true, messageIds });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send media (image, video, document) natively
app.post('/send-media', async (req, res) => {
  if (!sock || connectionState !== 'connected') {
    return res.status(503).json({ error: 'Not connected to WhatsApp' });
  }

  const { chatId, filePath, mediaType, caption, fileName, mentions } = req.body;
  if (!chatId || !filePath) {
    return res.status(400).json({ error: 'chatId and filePath are required' });
  }

  try {
    if (!existsSync(filePath)) {
      return res.status(404).json({ error: `File not found: ${filePath}` });
    }

    const buffer = readFileSync(filePath);
    const ext = filePath.toLowerCase().split('.').pop();
    const type = mediaType || inferMediaType(ext);
    let msgPayload;

    switch (type) {
      case 'image':
        if (ext === 'gif') {
          // WhatsApp's native animated-GIF UX is an MP4 video payload with
          // gifPlayback=true. Convert when ffmpeg is available; otherwise fall
          // back to a truthful image/gif send instead of mislabeling GIF bytes
          // as video/mp4.
          let tmpGifMp4 = null;
          try {
            tmpGifMp4 = path.join(tmpdir(), `hermes_gif_${randomBytes(6).toString('hex')}.mp4`);
            execFileSync(
              'ffmpeg',
              ['-y', '-i', filePath, '-movflags', 'faststart', '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', tmpGifMp4],
              { timeout: 30000, stdio: 'pipe' }
            );
            msgPayload = {
              video: readFileSync(tmpGifMp4),
              caption: caption || undefined,
              mimetype: 'video/mp4',
              gifPlayback: true,
            };
          } catch (gifErr) {
            console.warn('[bridge] gif conversion failed, sending as image/gif:', gifErr.message);
            msgPayload = mediaPayloadForFile({ buffer, filePath, mediaType: type, caption, fileName });
          } finally {
            try { if (tmpGifMp4 && existsSync(tmpGifMp4)) unlinkSync(tmpGifMp4); } catch (_) {}
          }
        } else {
          msgPayload = mediaPayloadForFile({ buffer, filePath, mediaType: type, caption, fileName });
        }
        break;
      case 'video':
        msgPayload = mediaPayloadForFile({ buffer, filePath, mediaType: type, caption, fileName });
        break;
      case 'audio': {
        // WhatsApp only renders a native voice bubble (ptt) when the file is ogg/opus.
        // If the caller passes mp3, wav, m4a etc. (e.g. from Edge TTS / NeuTTS),
        // silently convert to ogg/opus via ffmpeg so ptt is always honoured.
        let audioBuffer = buffer;
        let audioExt = ext;
        const needsConversion = !['ogg', 'opus'].includes(ext);
        let tmpPath = null;
        if (needsConversion) {
          tmpPath = path.join(tmpdir(), `hermes_voice_${randomBytes(6).toString('hex')}.ogg`);
          try {
            execFileSync(
              'ffmpeg',
              ['-y', '-i', filePath, '-ar', '48000', '-ac', '1', '-c:a', 'libopus', tmpPath],
              { timeout: 30000, stdio: 'pipe' }
            );
            audioBuffer = readFileSync(tmpPath);
            audioExt = 'ogg';
          } catch (convErr) {
            // ffmpeg not available or conversion failed — fall back to original format
            console.warn('[bridge] ffmpeg conversion failed, sending as file attachment:', convErr.message);
          } finally {
            try { if (tmpPath && existsSync(tmpPath)) unlinkSync(tmpPath); } catch (_) {}
          }
        }
        const audioMime = (audioExt === 'ogg' || audioExt === 'opus') ? 'audio/ogg; codecs=opus' : 'audio/mpeg';
        msgPayload = { audio: audioBuffer, mimetype: audioMime, ptt: audioExt === 'ogg' || audioExt === 'opus' };
        break;
      }
      case 'document':
      default:
        msgPayload = mediaPayloadForFile({ buffer, filePath, mediaType: 'document', caption, fileName });
        break;
    }

    msgPayload = addMentions(msgPayload, mentions);

    const sent = await sendWithTimeout(chatId, msgPayload);
    trackSentMessageId(sent);
    messageStore.remember(sent);
    res.json({ success: true, messageId: sent?.key?.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send poll primitive. Approval UX is intentionally not wired here; gateway
// approvals need text fallback and explicit confirmation semantics above this
// low-level transport helper.
app.post('/send-poll', async (req, res) => {
  if (!sock || connectionState !== 'connected') {
    return res.status(503).json({ error: 'Not connected to WhatsApp' });
  }

  const { chatId, question, options, selectableCount } = req.body;
  if (!chatId || !question || !Array.isArray(options)) {
    return res.status(400).json({ error: 'chatId, question, and options are required' });
  }

  try {
    const payload = buildPollPayload({ question, options, selectableCount });
    const sent = await sendWithTimeout(chatId, payload);
    trackSentMessageId(sent);
    rememberSentMessage(sent, payload);
    res.json({ success: true, messageId: sent?.key?.id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Send native WhatsApp location pin
app.post('/send-location', async (req, res) => {
  if (!sock || connectionState !== 'connected') {
    return res.status(503).json({ error: 'Not connected to WhatsApp' });
  }

  const { chatId, latitude, longitude, name, address } = req.body;
  if (!chatId || latitude === undefined || longitude === undefined) {
    return res.status(400).json({ error: 'chatId, latitude, and longitude are required' });
  }

  try {
    const payload = buildLocationPayload({ latitude, longitude, name, address });
    const sent = await sendWithTimeout(chatId, payload);
    trackSentMessageId(sent);
    messageStore.remember(sent);
    res.json({ success: true, messageId: sent?.key?.id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Typing indicator
app.post('/typing', async (req, res) => {
  if (!sock || connectionState !== 'connected') {
    return res.status(503).json({ error: 'Not connected' });
  }

  const { chatId } = req.body;
  if (!chatId) return res.status(400).json({ error: 'chatId required' });

  try {
    await sock.sendPresenceUpdate('composing', chatId);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false });
  }
});

// Mark an inbound message as read only after the Python adapter has accepted
// it through the authoritative DM/group/mention intake policy.
app.post('/read', async (req, res) => {
  if (!sock || connectionState !== 'connected') {
    return res.status(503).json({ error: 'Not connected' });
  }

  const receiptKeys = inboundReadReceiptKeys({
    key: req.body?.key,
    enabled: SEND_READ_RECEIPTS,
  });
  if (receiptKeys.length === 0) {
    return res.json({ success: true, marked: false });
  }

  try {
    await sock.readMessages(receiptKeys);
    return res.json({ success: true, marked: true });
  } catch (err) {
    console.warn('[bridge] failed to send read receipt:', err.message);
    return res.status(500).json({ error: 'Failed to send read receipt' });
  }
});

// Chat info
app.get('/chat/:id', async (req, res) => {
  const chatId = req.params.id;
  const isGroup = chatId.endsWith('@g.us');

  if (isGroup && sock) {
    try {
      const metadata = await sock.groupMetadata(chatId);
      return res.json({
        name: metadata.subject,
        isGroup: true,
        participants: metadata.participants.map(p => p.id),
      });
    } catch {
      // Fall through to default
    }
  }

  res.json({
    name: chatId.replace(/@.*/, ''),
    isGroup,
    participants: [],
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    painel: {enabled: painel.enabled, pending: painel.pending},
    fareControl: {version: 2, group: fareConfig.staffGroup, globalPaused: fare.globalPaused(), commands: ['/pare', '/retomar', '/retomar NUMERO']},
    status: connectionState,
    queueLength: messageQueue.length,
    uptime: process.uptime(),
    scriptHash: SCRIPT_HASH,
    interactiveSelections: true,
    sendReadReceipts: SEND_READ_RECEIPTS,
    // path.resolve, not realpath: the adapter compares against os.path.abspath, which keeps symlinks.
    session: path.resolve(SESSION_DIR),
    capabilities: { outboundMentions: true, campaignDelivery: true, interactiveSelections: true },
  });
});

// Start
if (PAIR_ONLY) {
  // Pair-only mode: just connect, show QR, save creds, exit. No HTTP server.
  if (PAIR_JSON) {
    emitPairEvent({ event: 'started', session: SESSION_DIR });
  } else {
    console.log('📱 WhatsApp pairing mode');
    console.log(`📁 Session: ${SESSION_DIR}`);
    console.log();
  }
  startSocket().catch((err) => {
    emitPairEvent({ event: 'error', error: err?.message || String(err) });
    if (!PAIR_JSON) {
      console.error(err);
    }
    process.exit(1);
  });
} else {
  if (painel.listenHost) {
    app.listen(PORT, painel.listenHost, () => console.log(`[painel] também na rede: http://${painel.listenHost}:${PORT}`))
      .on('error', (error) => console.warn('[painel] não consegui abrir na rede:', error.message));
  }
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`🌉 WhatsApp bridge listening on port ${PORT} (mode: ${WHATSAPP_MODE})`);
    console.log(`📁 Session stored in: ${SESSION_DIR}`);
    if (ALLOWED_USERS.size > 0) {
      console.log(`🔒 Allowed users: ${Array.from(ALLOWED_USERS).join(', ')}`);
    } else if (WHATSAPP_MODE === 'self-chat') {
      console.log(`🔒 Self-chat mode — only your own messages to yourself are processed.`);
    } else if (WHATSAPP_MODE === 'bot' && WHATSAPP_DM_POLICY === 'pairing') {
      console.log(`🤝 WHATSAPP_DM_POLICY=pairing — unknown DMs are forwarded for gateway pairing.`);
    } else {
      console.log(`🔒 No WHATSAPP_ALLOWED_USERS set — incoming messages are rejected.`);
      console.log(`   Set WHATSAPP_ALLOWED_USERS=<phone> to authorize specific users,`);
      console.log(`   or WHATSAPP_ALLOWED_USERS=* for an explicit open bot.`);
    }
    if (WHATSAPP_MODE === 'bot' && FORWARD_OWNER_MESSAGES) {
      console.log(`👤 WHATSAPP_FORWARD_OWNER_MESSAGES=true — owner-typed messages will be forwarded with fromOwner:true`);
    }
    console.log();
    scheduleReconnect(0);
  });
}
