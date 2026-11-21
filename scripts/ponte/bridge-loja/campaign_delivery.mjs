// Campaign-only transport; no Baileys dependency and no automatic resend.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export function createFileStore(file) {
  if (file instanceof URL) file = fileURLToPath(file);
  const directory = path.dirname(file);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
  return {
    read() {
      let raw;
      try { raw = fs.readFileSync(file, 'utf8'); }
      catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
      const rows = JSON.parse(raw);
      if (!rows || Array.isArray(rows) || typeof rows !== 'object') throw new Error('INVALID_LEDGER');
      for (const [ref, row] of Object.entries(rows)) {
        if (!row || row.ref !== ref || typeof row.chatId !== 'string' || typeof row.text !== 'string'
            || !['sending', 'uncertain', 'confirmed'].includes(row.status)
            || (row.status === 'confirmed' && !row.messageId)) throw new Error('INVALID_LEDGER');
      }
      return rows;
    },
    write(rows) {
      const temp = `${file}.${randomUUID()}.tmp`;
      let fd;
      try {
        fd = fs.openSync(temp, 'wx', 0o600);
        fs.writeFileSync(fd, JSON.stringify(rows)); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
        fs.renameSync(temp, file);
        // Persist rename metadata on POSIX. Windows does not expose directory fsync.
        if (process.platform !== 'win32') {
          const dirfd = fs.openSync(directory, 'r');
          try { fs.fsyncSync(dirfd); } finally { fs.closeSync(dirfd); }
        }
      } finally {
        if (fd !== undefined) fs.closeSync(fd);
        if (fs.existsSync(temp)) fs.unlinkSync(temp);
      }
    },
  };
}

const fail = (statusCode, message) => Object.assign(new Error(message), {statusCode});
const validRef = ref => typeof ref === 'string' && /^[A-Za-z0-9_.:-]{1,160}$/.test(ref);
const publicRow = row => ({status: row.status === 'sending' ? 'uncertain' : row.status,
  ref: row.ref, ...(row.messageId ? {messageId: row.messageId} : {})});

export function registerCampaignRoutes(app, {service, enabled, authorized, known, connected, paused = () => false}) {
  const guard = (req, res) => {
    if (!enabled()) { res.status(404).json({error:'DISABLED'}); return false; }
    if (!authorized(req.get('x-fare-token'))) { res.status(401).json({error:'AUTH'}); return false; }
    return true;
  };
  app.post('/fare/painel/campanha/enviar', async (req,res) => {
    if (!guard(req,res)) return;
    const {chatId,text,ref} = req.body || {};
    const selectionPresent = Object.hasOwn(req.body || {}, 'selection');
    const selection = req.body?.selection;
    if (typeof chatId !== 'string' || !/^\d+@(s\.whatsapp\.net|lid)$/.test(chatId) || !known(chatId))
      return res.status(403).json({error:'DESTINATION'});
    if (!validRef(ref) || typeof text !== 'string' || !text.trim() || text.length > 4200)
      return res.status(400).json({error:'INPUT'});
    try {
      const row = await service.deliver({chatId,text,ref,...(selectionPresent ? {selection} : {})}, () => {
        if (paused()) throw fail(423,'GLOBAL_PAUSED');
        if (!connected()) throw fail(503,'NOT_CONNECTED');
      });
      return res.status(row.status === 'confirmed' ? 200 : 409).json({...publicRow(row),success:row.status === 'confirmed'});
    } catch (error) { return res.status(error.statusCode || 503).json({error:error.statusCode ? error.message : 'LEDGER_UNAVAILABLE'}); }
  });
  app.get('/fare/painel/campanha/status', async (req,res) => {
    if (!guard(req,res)) return;
    if (!validRef(req.query?.ref)) return res.status(400).json({error:'REF'});
    try {
      const row = await service.status(req.query.ref);
      return res.status(row ? 200 : 404).json(row ? publicRow(row) : {error:'NOT_FOUND'});
    } catch { return res.status(503).json({error:'LEDGER_UNAVAILABLE'}); }
  });
}
export function createCampaignDelivery({ store, send, validateSelection, sendSelection }) {
  let tail = Promise.resolve();
  const serial = action => {
    const result = tail.then(action);
    tail = result.catch(() => {});
    return result;
  };
  return {
    status(ref) { return serial(() => {
      const rows = store.read();
      return Object.hasOwn(rows, ref) ? rows[ref] : null;
    }); },
    deliver(input, beforeSend = () => {}) {
      // Snapshot caller-owned payload before queueing or awaiting any gate.
      input = structuredClone(input);
      return serial(async () => {
        const selectionPresent = Object.hasOwn(input, 'selection');
        let prepared;
        if (selectionPresent) {
          if (!input.selection || typeof input.selection !== 'object' || Array.isArray(input.selection)) throw fail(400,'SELECTION');
          if (!validateSelection || !sendSelection) throw fail(400,'SELECTION_UNSUPPORTED');
          input.selection = {messageId:input.selection.messageId,optionId:input.selection.optionId};
          prepared = validateSelection(input);
          if (!prepared?.content) throw fail(400,'SELECTION_UNSUPPORTED');
        } else if (typeof input.ref === 'string' && input.ref.startsWith('menu:')) throw fail(400,'SELECTION_REQUIRED');
        const rows = store.read();
        if (Object.hasOwn(rows, input.ref)) {
          const row = rows[input.ref];
          if (row.chatId !== input.chatId || row.text !== input.text
              || row.selection?.messageId !== input.selection?.messageId || row.selection?.optionId !== input.selection?.optionId)
            throw Object.assign(new Error('REF_CONFLICT'), { statusCode: 409 });
          return { ...row, status: row.status === 'sending' ? 'uncertain' : row.status };
        }
        await beforeSend();
        Object.defineProperty(rows, input.ref, {value: { ...input, status: 'sending' }, enumerable: true, writable: true, configurable: true});
        store.write(rows); // Durable reservation MUST precede any transport call.
        try {
          const result = selectionPresent ? await sendSelection(input, prepared.content) : await send(input);
          if (typeof result?.messageId !== 'string' || !result.messageId) throw new Error('NO_MESSAGE_ID');
          rows[input.ref] = { ...input, status: 'confirmed', messageId: result.messageId };
          store.write(rows);
        } catch {
          rows[input.ref] = { ...input, status: 'uncertain' };
          store.write(rows);
        }
        return rows[input.ref];
      });
    },
  };
}
