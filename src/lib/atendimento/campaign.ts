import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

type ContactRow = {
  id:string; phone:string; name:string; segment:number; state:string;
  conversation_id:string; chat_id:string; attempts:number; human:number;
  turns:number; menu_used:number; last_sent:number|null; reminder_due:number|null;
  version:number; phase:string;
};
type QueueRow = { ref:string;contact_id:string;text:string;kind:string;chat_id:string;conversation_id:string };
type MessageRow = { id:string;external_id:string|null;body:string;seq:number };
type SettingsRow = { enabled:number;next_contact:number;next_bubble:number;audience:'pilot'|'list' };
// Operational proxy: potential order volume, NOT measured profit by segment.
export const CAMPAIGN_SEGMENT_PRIORITY = [1,5,3,12,2,4,7,10,6,11,8,9] as const;
function audience(db:DatabaseSync):'pilot'|'list' {
  return db.prepare('SELECT audience FROM campaign_settings WHERE id=1').get()?.audience==='list' ? 'list' : 'pilot';
}
export function setCampaignAudience(db:DatabaseSync,mode:'pilot'|'list'):void {
  if (!['pilot','list'].includes(mode)) throw new Error('Invalid campaign audience');
  if (db.prepare('SELECT enabled FROM campaign_settings WHERE id=1').get()?.enabled || db.prepare('SELECT busy FROM campaign_runtime WHERE id=1').get()?.busy) throw new Error('Pause and reconcile campaign before changing audience');
  db.prepare('UPDATE campaign_settings SET audience=? WHERE id=1').run(mode);
}
const DENIED = new Set(['11991038295','11943479338','11950640555','11975023299','11948042641','11945084994','1121523200','11953146725','11990007825','1145881365','11968523418','1121360251','1145888899'].map(p => '55' + p));
const PILOTS = new Set(['5511991665576', '551145830807', '551145831111']);
function phoneDigits(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) digits = '55' + digits;
  if (!/^55[1-9]\d{9,10}$/.test(digits)) throw new Error('Invalid Brazilian phone');
  return digits;
}
export function importCampaignContact(db: DatabaseSync, input: { phone: string; name: string; segment: number; qualification: { verified: boolean; source: string; rationale: string }; pilot?: boolean }): string {
  const phone = phoneDigits(input.phone);
  if (!Number.isInteger(input.segment) || input.segment < 1 || input.segment > 12) throw new Error('Invalid segment');
  const previous = db.prepare('SELECT id FROM campaign_contacts WHERE phone=?').get(phone);
  if (previous) return String(previous.id);
  const qualified = input.qualification?.verified === true && typeof input.qualification.source==='string' && input.qualification.source.trim() && typeof input.qualification.rationale==='string' && input.qualification.rationale.trim();
  const state = DENIED.has(phone) ? 'excluded' : qualified && (audience(db)==='list' || input.pilot === true && PILOTS.has(phone)) ? 'ready' : 'held';
  const id = randomUUID();
  db.prepare('INSERT INTO campaign_contacts(id,phone,name,segment,qualification,pilot,state) VALUES(?,?,?,?,?,?,?)').run(id,phone,input.name,input.segment,JSON.stringify(input.qualification),input.pilot === true ? 1 : 0,state);
  return id;
}

export function migrateCampaign(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS campaign_settings (id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL DEFAULT 0, next_contact INTEGER NOT NULL DEFAULT 0, next_bubble INTEGER NOT NULL DEFAULT 0);
    INSERT OR IGNORE INTO campaign_settings(id) VALUES(1);
    CREATE TABLE IF NOT EXISTS campaign_contacts (
      id TEXT PRIMARY KEY, phone TEXT UNIQUE NOT NULL, name TEXT NOT NULL, segment INTEGER NOT NULL,
      qualification TEXT NOT NULL, pilot INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL,
      conversation_id TEXT UNIQUE, chat_id TEXT, attempts INTEGER NOT NULL DEFAULT 0,
      human INTEGER NOT NULL DEFAULT 0, turns INTEGER NOT NULL DEFAULT 0, menu_used INTEGER NOT NULL DEFAULT 0,
      last_sent INTEGER, reminder_due INTEGER, version INTEGER NOT NULL DEFAULT 0, phase TEXT NOT NULL DEFAULT 'opening'
    );
    CREATE TABLE IF NOT EXISTS campaign_runtime(id INTEGER PRIMARY KEY CHECK(id=1), busy TEXT);
    INSERT OR IGNORE INTO campaign_runtime(id) VALUES(1);
    CREATE TABLE IF NOT EXISTS campaign_daily(day TEXT PRIMARY KEY, new_contacts INTEGER NOT NULL DEFAULT 0, bubbles INTEGER NOT NULL DEFAULT 0, cap_alerted INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS campaign_queue(seq INTEGER PRIMARY KEY AUTOINCREMENT, ref TEXT UNIQUE NOT NULL, contact_id TEXT NOT NULL, text TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', external_id TEXT, UNIQUE(contact_id,text));
    CREATE TABLE IF NOT EXISTS campaign_inbound(contact_id TEXT NOT NULL, message_key TEXT NOT NULL, text TEXT NOT NULL, PRIMARY KEY(contact_id,message_key));
  `);
  if (!db.prepare('PRAGMA table_info(campaign_settings)').all().some(column=>column.name==='audience')) db.exec("ALTER TABLE campaign_settings ADD COLUMN audience TEXT NOT NULL DEFAULT 'pilot' CHECK(audience IN ('pilot','list'))");
}
export function campaignSnapshot(db: DatabaseSync): unknown {
  return {
    enabled: Boolean(db.prepare('SELECT enabled FROM campaign_settings WHERE id=1').get()?.enabled),
    audience: audience(db),
    segmentPriority: CAMPAIGN_SEGMENT_PRIORITY,
    states: db.prepare('SELECT state,COUNT(*) AS count FROM campaign_contacts GROUP BY state').all(),
    daily: db.prepare('SELECT * FROM campaign_daily ORDER BY day DESC LIMIT 7').all(),
    queue: db.prepare('SELECT status,COUNT(*) AS count FROM campaign_queue GROUP BY status').all(),
    dispatchBlocked: Boolean(db.prepare('SELECT busy FROM campaign_runtime WHERE id=1').get()?.busy),
  };
}

export type CampaignDeps = {
  now: () => Date; random: () => number;
  checkWhatsApp: (phone:string) => Promise<{chatId:string;phone:string}|null>;
  createConversation: (contact:{phone:string;name:string;chatId:string;segment:number}) => string;
  classify: (input:{text:string;segment:number;history:Array<{author:string;text:string}>;state:string}) => Promise<{intent:'yes'|'no'|'optout'|'handoff'|'robot'|'menu'|'unknown';menuOption?:string}>;
  send: (input:{chatId:string;text:string;ref:string}) => Promise<{messageId:string}>;
  recordOutbound: (conversationId:string,text:string,externalId:string) => void;
  handoff: (conversationId:string,reason:string) => void;
  alert: (reason:string) => void;
};
const OPENING = ['Oi, tudo bem? Sou o Nicolas, da Fare Foto. Fazemos brindes personalizados para empresas aqui de Jundiaí 🙂', 'Vocês costumam presentear os colaboradores ou clientes no fim de ano?'];
export function setCampaignEnabled(db: DatabaseSync, enabled:boolean): void {
  db.prepare('UPDATE campaign_settings SET enabled=? WHERE id=1').run(enabled ? 1 : 0);
}
export function campaignOwnsConversation(db: DatabaseSync, id:string): boolean {
  if (!hasTable(db, 'campaign_contacts')) return false;
  return Boolean(db.prepare('SELECT 1 FROM campaign_contacts WHERE conversation_id=?').get(id));
}
export function campaignHiddenConversationIds(db: DatabaseSync): Set<string> {
  if (!hasTable(db, 'campaign_contacts')) return new Set();
  return new Set((db.prepare("SELECT conversation_id FROM campaign_contacts WHERE conversation_id IS NOT NULL AND state<>'handoff'").all() as Array<{conversation_id:string}>).map(r => r.conversation_id));
}
/** Human takeover cancels queued campaign bubbles before another dispatch. */
export function revealCampaignForStaff(db: DatabaseSync, conversationId:string): void {
  if (!campaignOwnsConversation(db, conversationId)) return;
  db.prepare("UPDATE campaign_queue SET status='cancelled' WHERE contact_id=(SELECT id FROM campaign_contacts WHERE conversation_id=?) AND status='pending'").run(conversationId);
  db.prepare("UPDATE campaign_contacts SET state='handoff',version=version+1 WHERE conversation_id=? AND state<>'handoff'").run(conversationId);
}
function atomic<T>(db:DatabaseSync, fn:()=>T):T {
  db.exec('BEGIN IMMEDIATE');
  try { const result=fn(); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; }
}
const localFormatter = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',hourCycle:'h23'});
function local(date:Date) {
  const p = Object.fromEntries(localFormatter.formatToParts(date).map(p => [p.type,p.value]));
  return { day:`${p.year}-${p.month}-${p.day}`, open: !['Sat','Sun'].includes(p.weekday) && Number(p.hour)>=9 && Number(p.hour)<17 };
}
function delay(deps:CampaignDeps, scale=1000):number {
  const r=deps.random();
  return Math.round((3+2*(Number.isFinite(r)?Math.max(0,Math.min(1,r)):0))*scale);
}
function enqueue(db:DatabaseSync,id:string,texts:string[],kind:string):void {
  // Only cancelled, never-attempted bubbles may return to the queue.
  for (const text of texts) db.prepare(`INSERT INTO campaign_queue(ref,contact_id,text,kind) VALUES(?,?,?,?)
    ON CONFLICT(contact_id,text) DO UPDATE SET status='pending',kind=excluded.kind
    WHERE campaign_queue.status='cancelled' AND campaign_queue.external_id IS NULL`).run(randomUUID(),id,text,kind);
}
function hasTable(db:DatabaseSync,name:string):boolean { return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)); }
function hasExisting(db:DatabaseSync,phone:string):boolean {
  if (!hasTable(db,'atd_conversations')) return false;
  return (db.prepare('SELECT phone FROM atd_conversations').all() as Array<{phone:string}>).some(r => { try { return phoneDigits(String(r.phone))===phone; } catch { return false; } });
}
function active(db:DatabaseSync,id:string):ContactRow|undefined { return db.prepare("SELECT * FROM campaign_contacts WHERE id=? AND state='active'").get(id) as ContactRow|undefined; }

const SEGMENTS = [
  ['equipes','rh-de-empresas'], ['escritórios de contabilidade','contabilidade'],
  ['imobiliárias e construtoras','imobiliarias-e-construtoras'], ['escritórios de advocacia','advocacia'],
  ['indústrias','industrias-e-logistica'], ['clínicas odontológicas','clinicas-odontologicas'],
  ['concessionárias','concessionarias-e-oficinas'], ['academias','academias'],
  ['salões e clínicas de estética','saloes-e-estetica'], ['escolas','escolas'],
  ['veterinárias e pet shops','veterinarias-e-pet-shops'], ['corretoras e cooperativas','seguros-e-cooperativas'],
];
function yesScript(segment:number):string[] {
  const [label,slug]=SEGMENTS[segment-1];
  return [`Que legal! Já são mais de 3 anos atendendo empresas da região, e montamos uma seleção de fim de ano para ${label} 👇`, `https://www.farefoto.com.br/brindes/segmentos/${slug}\nSe algum te interessar, me fala o item e a quantidade que te passo valor e prazo.`];
}
function nextInbound(db:DatabaseSync,conversationId:string,contactId:string):MessageRow|undefined {
  return db.prepare(`SELECT m.* FROM atd_messages m WHERE m.conversation_id=? AND m.author='cliente'
    AND NOT EXISTS(SELECT 1 FROM campaign_inbound i WHERE i.contact_id=? AND i.message_key=COALESCE(NULLIF(m.external_id,''),m.id))
    ORDER BY m.seq LIMIT 1`).get(conversationId,contactId) as MessageRow|undefined;
}
function cancel(db:DatabaseSync,id:string):void { db.prepare("UPDATE campaign_queue SET status='cancelled' WHERE contact_id=? AND status='pending'").run(id); }
function safeAlert(deps:CampaignDeps,reason:string):void { try { deps.alert(reason); } catch { /* State stays fail-closed even if operational logging fails. */ } }
function handoff(db:DatabaseSync,c:ContactRow,deps:CampaignDeps,reason:string):void {
  cancel(db,c.id);
  db.prepare("UPDATE campaign_contacts SET state='handoff',version=version+1 WHERE id=?").run(c.id);
  try { deps.handoff(String(c.conversation_id),reason); } catch { safeAlert(deps,'Campaign human handoff persistence failed; manual review required'); }
}
function paused(db:DatabaseSync,c:ContactRow):boolean {
  return hasTable(db,'atd_conversations') && db.prepare('SELECT status FROM atd_conversations WHERE id=?').get(c.conversation_id)?.status!=='ia';
}
function normalized(text:string):string { return text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(); }
const OPTOUT = /\b(opt[ -]?out|stop|pare|parar|remov[ae]|exclu[ai]|descadast\w*|nao (?:me )?(?:mande|mandar|envie|enviar|quero receber)|nao (?:entre em )?contat\w*|nao tenho interesse|nao me (?:chame|procure))\b/;
const COMMERCIAL = /\b(quanto|quando|data|tempo|kit(?:s)?|mochilas?|garrafas?|ecobags?|copos?|sacolas?|bones?|cadernos?|bloquinhos?|valor(?:es)?|preco(?:s)?|prazo(?:s)?|orcamento|desconto|pdf|e-?mail|ligacao|ligar|liga|telefone|visita\w*|quantidade|unidades?|pecas?|itens?|item|canecas?|camisetas?|squeezes?|chaveiros?|agenda(?:s)?|catalogo|cotacao|entrega|frete|pagamento|pix|custa|custam|reais)\b|\d/;
const NO_SCRIPT = ['Entendi! Vale pensar nisso: presente de fim de ano é um endomarketing simples, que faz a equipe se sentir valorizada.', 'E para o cliente, um brinde com a marca de vocês aumenta a percepção de valor e mantém a empresa na lembrança o ano todo. Posso te mandar a seleção que montamos?'];
const ROBOT = /bem[ -]?vindo|digite|assistente virtual|resposta automatica|fora do horario|horario de atendimento|menu de opcoes|mensagem automatica/;
function menuChoices(text:string):string[] {
  return text.split(/\r?\n/).flatMap(line=> {
    const match=line.trim().match(/^(?:digite\s+)?([0-9]{1,2}|[a-z]{1,12})\s*(?:[-:.)]|para)\s*(.+)$/i);
    const clear=match && /^(?:(?:falar|conversar)(?: com)? (?:um |uma |o |a )?)?(?:atendente(?: humano)?|humano|atendimento humano)$/.test(normalized(match[2]));
    return clear ? [match![1]] : [];
  });
}
function robotStop(db:DatabaseSync,c:ContactRow,deps:CampaignDeps):void {
  cancel(db,c.id); db.prepare("UPDATE campaign_contacts SET state='robot',version=version+1 WHERE id=?").run(c.id);
  safeAlert(deps,'Campaign robot loop stopped');
}
function businessDue(time:number):number {
  let date=new Date(time), days=0;
  while (days<3) { date=new Date(date.getTime()+86400000); const day=localFormatter.formatToParts(date).find(p=>p.type==='weekday')?.value; if(day!=='Sat' && day!=='Sun') days++; }
  return date.getTime();
}
const CLOSING = 'Tranquilo, obrigado pelo retorno! Se precisar de brindes, é só me chamar 🙂';
export async function processCampaignInbound(db:DatabaseSync,conversationId:string,deps:CampaignDeps):Promise<void> {
  // Drain in persistence order: later robot messages never erase earlier refusals.
  for (;;) {
    const contact=db.prepare('SELECT * FROM campaign_contacts WHERE conversation_id=?').get(conversationId) as ContactRow|undefined;
    if (!contact || contact.state==='handoff') return;
    const message=nextInbound(db,conversationId,contact.id);
    if (!message) return;
    await processCampaignMessage(db,conversationId,deps,message);
  }
}
async function processCampaignMessage(db:DatabaseSync,conversationId:string,deps:CampaignDeps,m:MessageRow):Promise<void> {
  const c=db.prepare("SELECT * FROM campaign_contacts WHERE conversation_id=?").get(conversationId) as ContactRow|undefined;
  if (!c || c.state==='handoff') return;
  const key=String(m.external_id || m.id);
  if (!db.prepare('INSERT OR IGNORE INTO campaign_inbound(contact_id,message_key,text) VALUES(?,?,?)').run(c.id,key,m.body).changes) return;
  if (c.state!=='active') {
    // A human returning after opt-out, robot stop or uncertain delivery must not disappear.
    // Never resume campaign automation: only surface a fresh commercial request to staff.
    const norm=normalized(String(m.body));
    if (['stopped','robot','uncertain'].includes(c.state) && !OPTOUT.test(norm) && !ROBOT.test(norm) && COMMERCIAL.test(norm)) handoff(db,c,deps,'Nova solicitação após campanha pausada; responder manualmente');
    return;
  }
  const text=String(m.body), norm=normalized(text);
  if (OPTOUT.test(norm)) { cancel(db,c.id); db.prepare("UPDATE campaign_contacts SET state='stopped',human=1,version=version+1 WHERE id=?").run(c.id); return; }
  if (paused(db,c)) { handoff(db,c,deps,'Campaign manually paused'); return; }
  const options=menuChoices(text);
  const previous=(db.prepare('SELECT text FROM campaign_inbound WHERE NOT (contact_id=? AND message_key=?)').all(c.id,key) as Array<{text:string}>);
  const repeated=previous.some(r=>normalized(String(r.text))===norm && norm.length>=25);
  const robot=ROBOT.test(norm) || /^\s*\d+\s*[-:.)]/m.test(norm);
  // Stock greetings do not cancel an explicit human commercial request.
  // Menu numbers and opening-hour digits alone are not commercial intent.
  if (robot && COMMERCIAL.test(norm) && /\b(quero|preciso|gostaria|solicito|poderia|quanto|qual|quando)\b/.test(norm)) {
    handoff(db,c,deps,'Campaign commercial request with automated greeting'); return;
  }
  if (robot || options.length || repeated) {
    if (c.menu_used || repeated) { robotStop(db,c,deps); return; }
    if (options.length===1) {
      cancel(db,c.id);
      db.prepare('UPDATE campaign_contacts SET menu_used=1 WHERE id=?').run(c.id);
      enqueue(db,c.id,[options[0]],'menu');
    } else if (options.length>1) handoff(db,c,deps,'Campaign ambiguous human menu');
    return;
  }
  if (COMMERCIAL.test(norm)) { handoff(db,c,deps,'Campaign commercial/offscript request'); return; }
  const priorPending=db.prepare("SELECT ref FROM campaign_queue WHERE contact_id=? AND status='pending'").all(c.id) as Array<{ref:string}>;
  cancel(db,c.id);
  db.prepare('UPDATE campaign_contacts SET version=version+1 WHERE id=?').run(c.id);
  const version=Number(c.version)+1;
  db.prepare('UPDATE campaign_contacts SET human=1 WHERE id=?').run(c.id);
  if (Number(c.turns)>=3) { handoff(db,c,deps,'Campaign reply turn limit'); return; }
  const history=(db.prepare('SELECT author,body FROM atd_messages WHERE conversation_id=? ORDER BY seq DESC LIMIT 30').all(conversationId) as Array<{author:string;body:string}>).reverse().map(r=>({author:String(r.author),text:String(r.body)}));
  let result:Awaited<ReturnType<CampaignDeps['classify']>>;
  try { result=await deps.classify({text,segment:Number(c.segment),history,state:String(c.phase)}); }
  catch { if (active(db,c.id)?.version===version) handoff(db,c,deps,'Campaign classifier unavailable'); return; }
  const current=active(db,c.id);
  if (!current || Number(current.version)!==version) return;
  if (paused(db,current)) { handoff(db,current,deps,'Campaign manually paused'); return; }
  if (!result || typeof result.intent!=='string') { handoff(db,c,deps,'Campaign invalid classifier response'); return; }
  if (result.intent==='optout') { db.prepare("UPDATE campaign_contacts SET state='stopped',human=1 WHERE id=?").run(c.id); return; }
  if (result.intent==='yes' || result.intent==='no') {
    db.prepare('UPDATE campaign_contacts SET human=1,turns=turns+1 WHERE id=?').run(c.id);
    if (result.intent==='yes') {
      db.prepare("UPDATE campaign_contacts SET phase='yes' WHERE id=?").run(c.id);
      enqueue(db,c.id,yesScript(Number(c.segment)),'reply');
    } else if (c.phase==='no') {
      db.prepare("UPDATE campaign_contacts SET phase='closing' WHERE id=?").run(c.id);
      enqueue(db,c.id,[CLOSING],'closing');
    } else {
      db.prepare("UPDATE campaign_contacts SET phase='no' WHERE id=?").run(c.id);
      enqueue(db,c.id,NO_SCRIPT,'reply');
    }
    if (Number(c.turns)+1>=3 && !db.prepare("SELECT 1 FROM campaign_queue WHERE contact_id=? AND status='pending'").get(c.id)) handoff(db,c,deps,'Campaign reply turn limit');
    return;
  }
  if (result.intent==='robot') {
    for (const {ref} of priorPending) db.prepare("UPDATE campaign_queue SET status='pending' WHERE ref=? AND status='cancelled' AND external_id IS NULL").run(ref);
    db.prepare('UPDATE campaign_contacts SET human=? WHERE id=?').run(c.human,c.id);
    if (c.menu_used) robotStop(db,c,deps);
    return;
  }
  handoff(db,c,deps,'Campaign uncertain or offscript response');
}

/** Durable lock intentionally has no expiry: after a process crash an operator must reconcile uncertain work, never replay it. */
export async function campaignTick(db:DatabaseSync,deps:CampaignDeps):Promise<void> {
  if (!local(deps.now()).open || !db.prepare('SELECT enabled FROM campaign_settings WHERE id=1').get()?.enabled) return;
  const token=randomUUID();
  if (!db.prepare('UPDATE campaign_runtime SET busy=? WHERE id=1 AND busy IS NULL').run(token).changes) return;
  try {
    for (const c of db.prepare("SELECT * FROM campaign_contacts WHERE state='active'").all() as ContactRow[]) {
      if (paused(db,c)) { handoff(db,c,deps,'Campaign manually paused'); continue; }
      if (hasTable(db,'atd_messages')) await processCampaignInbound(db,String(c.conversation_id),deps);
    }
    if (!local(deps.now()).open || !db.prepare('SELECT enabled FROM campaign_settings WHERE id=1').get()?.enabled) return;
    const day=local(deps.now()).day;
    const usage=db.prepare('SELECT * FROM campaign_daily WHERE day=?').get(day) as {bubbles:number}|undefined;
    if (usage && Number(usage.bubbles)>=60) {
      if (db.prepare('UPDATE campaign_daily SET cap_alerted=1 WHERE day=? AND cap_alerted=0').run(day).changes) safeAlert(deps,'Campaign daily bubble cap reached');
      return;
    }
    const reminders=db.prepare("SELECT * FROM campaign_contacts WHERE state='active' AND human=0 AND attempts=1 AND reminder_due IS NOT NULL AND reminder_due<=? AND NOT EXISTS(SELECT 1 FROM campaign_queue q WHERE q.contact_id=campaign_contacts.id AND q.status IN ('pending','sending','uncertain'))").all(deps.now().getTime()) as ContactRow[];
    for (const c of reminders) {
      if (paused(db,c)) { handoff(db,c,deps,'Campaign manually paused'); continue; }
      atomic(db,()=> {
        db.prepare('UPDATE campaign_contacts SET attempts=2 WHERE id=? AND attempts=1').run(c.id);
        enqueue(db,c.id,['Oi, tudo bem? Passando rapidinho 🙂',`Montamos uma seleção de brindes de fim de ano para ${SEGMENTS[Number(c.segment)-1][0]}. Posso te mandar?`],'reminder');
      });
    }
    let q=db.prepare("SELECT q.*,c.chat_id,c.conversation_id FROM campaign_queue q JOIN campaign_contacts c ON c.id=q.contact_id WHERE q.status='pending' AND c.state='active' ORDER BY q.seq LIMIT 1").get() as QueueRow|undefined;
    if (!q) {
      const settings=db.prepare('SELECT * FROM campaign_settings WHERE id=1').get() as SettingsRow;
      if (Number(settings.next_contact)>deps.now().getTime()) return;
      const mode=audience(db);
      const priority=CAMPAIGN_SEGMENT_PRIORITY.map((segment,index)=>`WHEN ${segment} THEN ${index}`).join(' ');
      const c=db.prepare(`SELECT * FROM campaign_contacts WHERE state='ready' AND (?='list' OR pilot=1) ORDER BY CASE WHEN ?='list' THEN CASE segment ${priority} ELSE 99 END ELSE 0 END,rowid LIMIT 1`).get(mode,mode) as ContactRow|undefined;
      if (!c || mode==='pilot' && !PILOTS.has(c.phone) || DENIED.has(c.phone)) return;
      if (hasExisting(db,c.phone)) { db.prepare("UPDATE campaign_contacts SET state='existing' WHERE id=?").run(c.id); return; }
      const reserved=atomic(db,()=> {
        const day=local(deps.now()).day;
        db.prepare('INSERT OR IGNORE INTO campaign_daily(day) VALUES(?)').run(day);
        if (mode==='pilot' && Number(db.prepare("SELECT COUNT(*) AS n FROM campaign_contacts WHERE attempts>0 AND state<>'no_whatsapp'").get()?.n)>=2) return false;
        if (!db.prepare('UPDATE campaign_daily SET new_contacts=new_contacts+1 WHERE day=? AND new_contacts<20 AND bubbles<60').run(day).changes) return false;
        db.prepare("UPDATE campaign_contacts SET state='starting',attempts=1 WHERE id=?").run(c.id);
        db.prepare('UPDATE campaign_settings SET next_contact=? WHERE id=1').run(deps.now().getTime()+90_000);
        return true;
      });
      if (!reserved) return;
      try {
        const wa=await deps.checkWhatsApp(c.phone);
        if (!wa) {
          atomic(db,()=> {
            if (db.prepare("UPDATE campaign_contacts SET state='no_whatsapp' WHERE id=? AND state='starting'").run(c.id).changes) db.prepare('UPDATE campaign_daily SET new_contacts=MAX(0,new_contacts-1) WHERE day=?').run(day);
          });
          return;
        }
        if (phoneDigits(wa.phone)!==c.phone || !wa.chatId || wa.chatId.endsWith('@g.us')) throw new Error('Unsafe WhatsApp destination');
        atomic(db,()=> {
          if (hasExisting(db,c.phone)) throw new Error('Existing conversation');
          const conversationId=deps.createConversation({phone:c.phone,name:c.name,segment:Number(c.segment),chatId:wa.chatId});
          db.prepare("UPDATE campaign_contacts SET state='active',conversation_id=?,chat_id=? WHERE id=?").run(conversationId,wa.chatId,c.id);
          enqueue(db,c.id,OPENING,'opening');
        });
      } catch { db.prepare("UPDATE campaign_contacts SET state='uncertain' WHERE id=?").run(c.id); safeAlert(deps,'Campaign contact initialization uncertain; manual review required'); return; }
      q=db.prepare("SELECT q.*,c.chat_id,c.conversation_id FROM campaign_queue q JOIN campaign_contacts c ON c.id=q.contact_id WHERE q.contact_id=? AND q.status='pending' ORDER BY q.seq LIMIT 1").get(c.id) as QueueRow|undefined;
    }
    if (!q || !local(deps.now()).open) return;
    const owner=active(db,q.contact_id);
    if (!owner) return;
    if (paused(db,owner)) { handoff(db,owner,deps,'Campaign manually paused'); return; }
    if (db.prepare("SELECT 1 FROM campaign_queue WHERE contact_id=? AND status IN ('sending','uncertain')").get(q.contact_id)) return;
    const settings=db.prepare('SELECT * FROM campaign_settings WHERE id=1').get() as SettingsRow;
    if (!settings.enabled || Number(settings.next_bubble)>deps.now().getTime()) return;
    const bubbleGap=delay(deps);
    const reserved=atomic(db,()=> {
      // Re-read under the write lock: another inbound worker may have cancelled
      // this queue or paused the conversation after selection but before reserve.
      const fresh=active(db,q!.contact_id);
      const config=db.prepare('SELECT * FROM campaign_settings WHERE id=1').get() as SettingsRow;
      if (!fresh || fresh.version!==owner.version || paused(db,fresh) || !config.enabled || !local(deps.now()).open || config.next_bubble>deps.now().getTime()) return 'stale';
      if (!db.prepare("SELECT 1 FROM campaign_queue WHERE ref=? AND status='pending'").get(q!.ref)) return 'stale';
      if (nextInbound(db,String(fresh.conversation_id),fresh.id)) return 'stale';
      const day=local(deps.now()).day;
      db.prepare('INSERT OR IGNORE INTO campaign_daily(day) VALUES(?)').run(day);
      if (!db.prepare('UPDATE campaign_daily SET bubbles=bubbles+1 WHERE day=? AND bubbles<60').run(day).changes) return 'cap';
      db.prepare("UPDATE campaign_queue SET status='sending' WHERE ref=? AND status='pending'").run(q!.ref);
      db.prepare('UPDATE campaign_settings SET next_bubble=? WHERE id=1').run(deps.now().getTime()+bubbleGap);
      return 'reserved';
    });
    if (reserved==='stale') return;
    if (reserved==='cap') {
      const day=local(deps.now()).day;
      if (db.prepare('UPDATE campaign_daily SET cap_alerted=1 WHERE day=? AND cap_alerted=0').run(day).changes) safeAlert(deps,'Campaign daily bubble cap reached');
      return;
    }
    try {
      const result=await deps.send({chatId:q.chat_id,text:q.text,ref:q.ref});
      if (!result.messageId) throw new Error('Missing send receipt');
      db.prepare("UPDATE campaign_queue SET status='sent',external_id=? WHERE ref=?").run(result.messageId,q.ref);
      db.prepare('UPDATE campaign_contacts SET last_sent=? WHERE id=?').run(deps.now().getTime(),q.contact_id);
      db.prepare('UPDATE campaign_settings SET next_bubble=?,next_contact=MAX(next_contact,?) WHERE id=1').run(deps.now().getTime()+bubbleGap,deps.now().getTime()+90_000);
      deps.recordOutbound(q.conversation_id,q.text,result.messageId);
      const current=active(db,q.contact_id);
      if (current && !db.prepare("SELECT 1 FROM campaign_queue WHERE contact_id=? AND status='pending'").get(q.contact_id)) {
        if (q.kind==='opening') db.prepare('UPDATE campaign_contacts SET reminder_due=? WHERE id=?').run(businessDue(deps.now().getTime()),q.contact_id);
        if (Number(current.turns)>=3) handoff(db,current,deps,'Campaign reply turn limit');
      }
      if (q.kind==='closing') db.prepare("UPDATE campaign_contacts SET state='stopped',version=version+1 WHERE id=? AND state='active'").run(q.contact_id);
    } catch {
      db.prepare("UPDATE campaign_queue SET status='uncertain' WHERE ref=?").run(q.ref);
      // A timeout belongs to this delivery, not to a later human takeover or opt-out.
      db.prepare("UPDATE campaign_contacts SET state='uncertain',version=version+1 WHERE id=? AND state='active'").run(q.contact_id);
      safeAlert(deps,'Campaign transport or recording uncertain; never retry automatically');
    }
  } finally { db.prepare('UPDATE campaign_runtime SET busy=NULL WHERE id=1 AND busy=?').run(token); }
}
