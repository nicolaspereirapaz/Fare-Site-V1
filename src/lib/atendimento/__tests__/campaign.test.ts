import { test as nodeTest } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import type { CampaignDeps } from '../campaign';
const core = createRequire(import.meta.url)('../campaign.ts') as typeof import('../campaign');
// Run standalone with Node, or inside the site's Vitest (globals: true).
const test = (globalThis as typeof globalThis & {test?:typeof nodeTest}).test ?? nodeTest;

test('enabled state is rechecked atomically after final send preparation', async () => {
  const f=await opened();await inbound(f,'sim');f.advance(3000);
  f.deps.random=()=>{core.setCampaignEnabled(f.db,false);return 0;};
  await f.tick();assert.equal(f.sent.length,2);assert.equal(f.db.prepare('SELECT bubbles FROM campaign_daily').get()?.bubbles,2);f.db.close();
});
test('cancelled queue reservation cannot send stale data or consume daily quota', async () => {
  const f=await opened();await inbound(f,'sim');f.advance(3000);
  f.deps.random=()=>{f.db.prepare("UPDATE campaign_queue SET status='cancelled' WHERE status='pending'").run();return 0;};
  await f.tick();assert.equal(f.sent.length,2);assert.equal(f.db.prepare('SELECT bubbles FROM campaign_daily').get()?.bubbles,2);assert.equal(f.alerts.length,0);f.db.close();
});
test('new persisted inbound during preparation invalidates outbound reservation', async () => {
  const f=await opened();await inbound(f,'sim');f.advance(3000);
  f.deps.random=()=>{
    f.db.prepare('INSERT INTO atd_messages(id,external_id,conversation_id,author,body,created_at) VALUES(?,?,?,?,?,?)').run('new','new','chat-5511991665576','cliente','Pare',f.deps.now().toISOString());return 0;
  };
  await f.tick();assert.equal(f.sent.length,2);f.db.close();
});


test('all twelve approved segment labels and links are fixed rather than model generated', async () => {
  const segments=[['equipes','rh-de-empresas'],['escritórios de contabilidade','contabilidade'],['imobiliárias e construtoras','imobiliarias-e-construtoras'],['escritórios de advocacia','advocacia'],['indústrias','industrias-e-logistica'],['clínicas odontológicas','clinicas-odontologicas'],['concessionárias','concessionarias-e-oficinas'],['academias','academias'],['salões e clínicas de estética','saloes-e-estetica'],['escolas','escolas'],['veterinárias e pet shops','veterinarias-e-pet-shops'],['corretoras e cooperativas','seguros-e-cooperativas']];
  for(const [index,[label,slug]] of segments.entries()) {
    const f=fixture(); core.importCampaignContact(f.db,{...lead(),segment:index+1}); core.setCampaignEnabled(f.db,true);
    await f.tick();f.advance(3000);await f.tick();await inbound(f,'Sim');f.advance(3000);await f.tick();f.advance(3000);await f.tick();
    assert.equal(f.sent[2].text,`Que legal! Já são mais de 3 anos atendendo empresas da região, e montamos uma seleção de fim de ano para ${label} 👇`);
    assert.equal(f.sent[3].text,`https://www.farefoto.com.br/brindes/segmentos/${slug}\nSe algum te interessar, me fala o item e a quantidade que te passo valor e prazo.`);
    f.db.close();
  }
});
test('second opening bubble is deferred at exact 17h until next weekday 09h', async () => {
  const f=fixture();f.add();core.setCampaignEnabled(f.db,true);f.at('2026-11-20T19:59:58Z');await f.tick();
  f.at('2026-11-20T20:00:01Z');await f.tick();assert.equal(f.sent.length,1);
  f.at('2026-11-21T12:00:00Z');await f.tick();assert.equal(f.sent.length,1);
  f.at('2026-11-23T11:59:59Z');await f.tick();assert.equal(f.sent.length,1);
  f.at('2026-11-23T12:00:00Z');await f.tick();assert.equal(f.sent.length,2);f.db.close();
});
test('text-only menu never consumes a bubble or fabricates a native selection', async () => {
  const f=await opened();f.db.prepare('UPDATE campaign_daily SET bubbles=59').run();
  await inbound(f,'Digite:\n0 - Atendente');f.advance(3000);await f.tick();assert.equal(f.sent.length,2);
  assert.equal(f.db.prepare('SELECT bubbles FROM campaign_daily').get()?.bubbles,59);
  assert.equal(f.db.prepare('SELECT state FROM campaign_contacts').get()?.state,'handoff');f.db.close();
});
test('local message id is fallback dedupe key when external id is absent', async () => {
  const f=await opened();f.db.prepare('INSERT INTO atd_messages(id,external_id,conversation_id,author,body,created_at) VALUES(?,NULL,?,?,?,?)').run('local','chat-5511991665576','cliente','Sim',f.deps.now().toISOString());
  await core.processCampaignInbound(f.db,'chat-5511991665576',f.deps);await core.processCampaignInbound(f.db,'chat-5511991665576',f.deps);
  assert.equal(f.db.prepare('SELECT turns FROM campaign_contacts').get()?.turns,1);f.db.close();
});
test('snapshots do not expose contact phone, name or qualification evidence', () => {
  const f=fixture();f.add();const snapshot=JSON.stringify(core.campaignSnapshot(f.db));
  assert.equal(snapshot.includes('5511991665576'),false);assert.equal(snapshot.includes('Empresa'),false);assert.equal(snapshot.includes(qualified.source),false);f.db.close();
});
test('unverified or missing qualification evidence cannot reach transport even marked pilot', async () => {
  for(const qualification of [{...qualified,verified:false},{...qualified,source:''},{...qualified,rationale:'  '}]) {
    const f=fixture();core.importCampaignContact(f.db,{...lead(),qualification});core.setCampaignEnabled(f.db,true);await f.tick();
    assert.equal(f.sent.length,0);assert.equal(f.db.prepare('SELECT state FROM campaign_contacts').get()?.state,'held');f.db.close();
  }
});
test('malformed runtime classifier payload fails closed instead of throwing', async () => {
  const f=await opened(); f.deps.classify=async()=>null as never;
  await inbound(f,'Sim');assert.equal(f.handed.length,1);f.db.close();
});


test('lookup spanning 17h cannot send until next business window', async () => {
  const f=fixture(); f.add(); core.setCampaignEnabled(f.db,true); f.at('2026-11-16T19:59:59Z');
  f.deps.checkWhatsApp=async phone=>{f.advance(2000);return {phone,chatId:phone+'@s.whatsapp.net'};};
  await f.tick(); assert.equal(f.sent.length,0);
  f.at('2026-11-17T12:00:00Z'); await f.tick(); assert.equal(f.sent.length,1); f.db.close();
});
test('disable while lookup is pending prevents initial transport', async () => {
  const f=fixture(); f.add(); core.setCampaignEnabled(f.db,true);
  f.deps.checkWhatsApp=async phone=>{core.setCampaignEnabled(f.db,false);return {phone,chatId:phone+'@s.whatsapp.net'};};
  await f.tick(); assert.equal(f.sent.length,0); f.db.close();
});
test('3-5 second delay is measured after slow successful send, not before await', async () => {
  const f=fixture(); f.add(); core.setCampaignEnabled(f.db,true);
  const original=f.deps.send; f.deps.send=async message=>{f.advance(10000);return original(message);};
  await f.tick(); await f.tick(); assert.equal(f.sent.length,1);
  f.advance(2999); await f.tick(); assert.equal(f.sent.length,1);
  f.advance(1); await f.tick(); assert.equal(f.sent.length,2); f.db.close();
});
test('max RNG interval enforces five seconds between bubbles and three minutes between contacts', async () => {
  const f=fixture(); f.deps.random=()=>1; f.add(); f.add('1145830807'); core.setCampaignEnabled(f.db,true);
  await f.tick(); f.advance(4999); await f.tick(); assert.equal(f.sent.length,1);
  f.advance(1); await f.tick(); assert.equal(f.sent.length,2);
  f.advance(180_000-1); await f.tick(); assert.equal(f.sent.length,2);
  f.advance(1); await f.tick(); assert.equal(f.sent.length,3); f.db.close();
});
test('crash durable lock and orphan sending reservation never permit blind second bubble', async () => {
  const f=fixture(); f.add(); core.setCampaignEnabled(f.db,true); await f.tick();
  f.db.prepare("UPDATE campaign_runtime SET busy='crashed'").run(); f.advance(3000); core.migrateCampaign(f.db); await f.tick();
  assert.equal(f.sent.length,1); assert.equal((core.campaignSnapshot(f.db) as {dispatchBlocked:boolean}).dispatchBlocked,true);
  f.db.prepare('UPDATE campaign_runtime SET busy=NULL').run(); f.db.prepare("UPDATE campaign_queue SET status='sending' WHERE status='sent'").run();
  await f.tick(); assert.equal(f.sent.length,1); f.db.close();
});
test('classifier result is stale if newer persisted input has not reached callback', async () => {
  const f=await opened(); let resolve!:(v:{intent:'yes'})=>void;
  f.deps.classify=()=>new Promise(r=>{resolve=r;}); const old=inbound(f,'Sim');
  f.db.prepare('INSERT INTO atd_messages(id,external_id,conversation_id,author,body,created_at) VALUES(?,?,?,?,?,?)')
    .run('newstop','newstop','chat-5511991665576','cliente','Pare',f.deps.now().toISOString());
  resolve({intent:'yes'}); await old;
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM campaign_queue WHERE status='pending'").get()?.n,0);
  await f.tick(); assert.equal(f.db.prepare('SELECT state FROM campaign_contacts').get()?.state,'stopped'); f.db.close();
});
test('text-only ambiguous, negative, virtual, long and short-token menus never fabricate native IDs', async () => {
  for(const text of ['1 - Não falar com atendente','1 - Atendente virtual','1 - Falar com atendente para obter descontos']) {
    const f=await opened(); await inbound(f,text); f.advance(3000); await f.tick(); assert.equal(f.sent.length,2,text); f.db.close();
  }
  const f=await opened(); await inbound(f,'Escolha uma opção:\nH - Falar com atendente');
  f.advance(3000); await f.tick(); assert.equal(f.sent.length,2); assert.equal(f.db.prepare('SELECT state FROM campaign_contacts').get()?.state,'handoff'); f.db.close();
});
test('model robot intent does not count as human response', async () => {
  const f=await opened(); f.deps.classify=async()=>({intent:'robot'}); await inbound(f,'Agradecemos seu contato. Aguarde um momento.');
  assert.equal(f.db.prepare('SELECT human FROM campaign_contacts').get()?.human,0); f.db.close();
});
test('third AI turn without new distinct script hands off immediately, never repeats exact text', async () => {
  const f=await opened(); await inbound(f,'Sim'); f.advance(3000); await f.tick(); f.advance(3000); await f.tick();
  f.db.prepare('UPDATE campaign_contacts SET turns=2').run(); await inbound(f,'Pode mandar','second-yes');
  assert.equal(f.handed.length,1); f.advance(3000); await f.tick(); assert.equal(f.sent.length,4); f.db.close();
});


test('two simultaneous ticks reserve one send before awaiting transport', async () => {
  const f=fixture(); f.add(); core.setCampaignEnabled(f.db,true);
  let resolve!:(v:{messageId:string})=>void; let calls=0;
  f.deps.send=async message=>{ calls++; f.sent.push(message); return new Promise(r=>{resolve=r;}); };
  const pending=f.tick(); await new Promise(r=>setImmediate(r));
  await Promise.all([f.tick(),f.tick(),f.tick()]);
  assert.equal(calls,1); assert.equal(f.db.prepare('SELECT bubbles FROM campaign_daily').get()?.bubbles,1);
  resolve({messageId:'receipt'}); await pending; f.db.close();
});
test('uncertain timeout never retries opening or second bubble, counters remain reserved', async () => {
  const f=fixture(); f.add(); core.setCampaignEnabled(f.db,true);
  f.deps.send=async message=>{ f.sent.push(message); throw new Error('timeout after remote acceptance'); };
  await f.tick(); f.advance(300000); core.migrateCampaign(f.db); await f.tick();
  assert.equal(f.sent.length,1); assert.equal(f.db.prepare('SELECT state FROM campaign_contacts').get()?.state,'uncertain');
  assert.equal(f.db.prepare('SELECT bubbles FROM campaign_daily').get()?.bubbles,1);
  assert.equal(f.alerts.length,1); f.db.close();
});
test('outbound recording failure is uncertain and never replays receipt', async () => {
  const f=fixture(); f.add(); core.setCampaignEnabled(f.db,true);
  f.deps.recordOutbound=()=>{throw new Error('disk error');}; await f.tick(); f.advance(300000); await f.tick();
  assert.equal(f.sent.length,1); assert.equal(f.db.prepare('SELECT external_id FROM campaign_queue WHERE status=\'uncertain\'').get()?.external_id,'out-1');
  f.db.close();
});
test('daily cap counts menu and reply bubbles, alerts once, resets on next local day', async () => {
  const f=await opened();
  f.db.prepare('UPDATE campaign_daily SET bubbles=59').run(); await inbound(f,'sim');
  f.advance(3000); await f.tick(); assert.equal(f.sent.length,3);
  f.advance(3000); await f.tick(); await f.tick(); assert.equal(f.sent.length,3);
  assert.equal(f.db.prepare('SELECT bubbles FROM campaign_daily').get()?.bubbles,60);
  assert.equal(f.alerts.length,1);
  f.at('2026-11-17T12:00:00Z'); await f.tick(); assert.equal(f.sent.length,4);
  assert.equal(f.db.prepare("SELECT bubbles FROM campaign_daily WHERE day='2026-11-17'").get()?.bubbles,1);
  f.db.close();
});
test('daily new-contact cap blocks lookup and does not create a conversation', async () => {
  const f=fixture(); f.add(); core.setCampaignEnabled(f.db,true);
  f.db.prepare('INSERT INTO campaign_daily(day,new_contacts,bubbles) VALUES(?,?,?)').run('2026-11-16',20,0);
  let checks=0; f.deps.checkWhatsApp=async()=>{checks++;return null;}; await f.tick();
  assert.equal(checks,0); assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM atd_conversations').get()?.n,0);
  f.db.close();
});
test('maximum two lifetime pilot contacts; third reserve remains held without lookup', async () => {
  const f=fixture(); f.add(); f.add('1145830807'); f.add('1145831111'); core.setCampaignEnabled(f.db,true);
  await f.tick(); f.advance(3000); await f.tick(); f.advance(300000); await f.tick(); f.advance(3000); await f.tick();
  f.advance(300000); await f.tick();
  assert.equal(f.sent.length,4); assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM campaign_contacts WHERE attempts>0').get()?.n,2);
  f.db.close();
});
test('existing real conversation is never attached even for pilot phone', async () => {
  const f=fixture(); const id=f.add();
  f.db.prepare('INSERT INTO atd_conversations VALUES(?,?,?)').run('existing','(11) 99166-5576','ia');
  core.setCampaignEnabled(f.db,true); await f.tick();
  assert.equal(f.sent.length,0); assert.equal(core.campaignOwnsConversation(f.db,'existing'),false);
  assert.equal(f.db.prepare('SELECT state FROM campaign_contacts WHERE id=?').get(id)?.state,'existing'); f.db.close();
});
test('no WhatsApp and lookup errors never create or send, never retry automatically', async () => {
  for(const fails of [false,true]) {
    const f=fixture(); f.add(); core.setCampaignEnabled(f.db,true); let checks=0;
    f.deps.checkWhatsApp=async()=>{checks++;if(fails)throw new Error('lookup timeout');return null;};
    await f.tick(); f.advance(300000); await f.tick(); assert.equal(checks,1); assert.equal(f.sent.length,0);
    assert.equal(f.db.prepare('SELECT state FROM campaign_contacts').get()?.state,fails?'uncertain':'no_whatsapp'); f.db.close();
  }
});
test('queued bubble rechecks manual pause without inbound callback', async () => {
  const f=fixture(); f.add(); core.setCampaignEnabled(f.db,true); await f.tick();
  f.db.prepare("UPDATE atd_conversations SET status='em_atendimento'").run(); f.advance(3000); await f.tick();
  assert.equal(f.sent.length,1); assert.equal(f.handed.length,1); f.db.close();
});
test('persisted optout arriving before inbound callback blocks queued bubble', async () => {
  const f=fixture(); f.add(); core.setCampaignEnabled(f.db,true); await f.tick();
  f.db.prepare('INSERT INTO atd_messages(id,external_id,conversation_id,author,body,created_at) VALUES(?,?,?,?,?,?)')
    .run('stop','stop','chat-5511991665576','cliente','Pare de mandar mensagens',f.deps.now().toISOString());
  f.advance(3000); await f.tick(); assert.equal(f.sent.length,1);
  assert.equal(f.db.prepare('SELECT state FROM campaign_contacts').get()?.state,'stopped'); f.db.close();
});


test('reminder once after three business days, skips weekend and has two spaced approved bubbles', async () => {
  const f=fixture(); f.at('2026-11-20T12:00:00Z'); f.add(); core.setCampaignEnabled(f.db,true);
  await f.tick(); f.advance(3000); await f.tick();
  await inbound(f,'Seja bem-vindo! Nosso horário de atendimento é das 9h às 18h.');
  assert.equal(f.db.prepare('SELECT human FROM campaign_contacts').get()?.human,0);
  f.at('2026-11-24T12:00:03Z'); await f.tick(); assert.equal(f.sent.length,2);
  f.at('2026-11-25T12:00:03Z'); await f.tick(); assert.equal(f.sent.length,3);
  assert.equal(f.sent[2].text,'Oi, tudo bem? Passando rapidinho 🙂');
  f.advance(2999); await f.tick(); assert.equal(f.sent.length,3); f.advance(1); await f.tick();
  assert.equal(f.sent[3].text,'Montamos uma seleção de brindes de fim de ano para veterinárias e pet shops. Posso te mandar?');
  f.advance(7*86400000); await f.tick(); assert.equal(f.sent.length,4);
  assert.equal(f.db.prepare('SELECT attempts FROM campaign_contacts').get()?.attempts,2);
  f.db.close();
});
test('human response cancels reminder permanently even when received within twenty seconds', async () => {
  const f=await opened(); await inbound(f,'Sim, nós costumamos');
  assert.equal(f.db.prepare('SELECT human FROM campaign_contacts').get()?.human,1);
  f.advance(3000); await f.tick(); f.advance(3000); await f.tick(); f.advance(7*86400000); await f.tick();
  assert.equal(f.sent.length,4); f.db.close();
});
test('textual menu is handed off without inventing an option ID', async () => {
  const f=await opened(); let calls=0; f.deps.classify=async()=>{calls++;return {intent:'menu',menuOption:'9'};};
  await inbound(f,'Bem-vindo! Digite uma opção:\n1 - Financeiro\n2 - Falar com atendente');
  assert.equal(calls,0); f.advance(3000); await f.tick(); assert.equal(f.sent.length,2);
  assert.equal(f.db.prepare('SELECT human FROM campaign_contacts').get()?.human,0);
  await inbound(f,'Digite uma opção:\n1 - Comercial\n2 - Falar com atendente','menu2');
  assert.equal(f.db.prepare('SELECT state FROM campaign_contacts').get()?.state,'handoff');
  f.advance(3000); await f.tick(); assert.equal(f.sent.length,2); f.db.close();
});
test('ambiguous or fabricated menu tokens never enter outbound queue', async () => {
  for (const text of ['Escolha: 1 - Vendas\n2 - Financeiro', '1 - Falar com atendente\n2 - Falar com humano', 'Olá, posso ajudar?']) {
    const f=await opened(); f.deps.classify=async()=>({intent:'menu',menuOption:'99'});
    await inbound(f,text); f.advance(3000); await f.tick(); assert.equal(f.sent.length,2); f.db.close();
  }
});
test('repeated robot input cannot loop and never marks human response', async () => {
  const f=await opened();
  await inbound(f,'Olá! Sou o assistente virtual desta empresa. Aguarde nossa equipe.');
  await inbound(f,'Olá! Sou o assistente virtual desta empresa. Aguarde nossa equipe.','repeat');
  assert.equal(f.db.prepare('SELECT human FROM campaign_contacts').get()?.human,0);
  assert.equal(f.db.prepare('SELECT state FROM campaign_contacts').get()?.state,'robot');
  f.advance(3000); await f.tick(); assert.equal(f.sent.length,2); f.db.close();
});
test('third AI turn hands off after queued bubbles; fourth input never classified', async () => {
  const f=await opened(); f.db.prepare('UPDATE campaign_contacts SET turns=2').run();
  await inbound(f,'Sim, enviamos presentes');
  f.advance(3000); await f.tick(); f.advance(3000); await f.tick();
  assert.equal(f.db.prepare('SELECT turns FROM campaign_contacts').get()?.turns,3);
  assert.equal(f.handed.length,1); assert.equal(f.sent.length,4);
  f.deps.classify=async()=>{throw new Error('must not run');}; await inbound(f,'Sim','fourth');
  assert.equal(f.handed.length,1); f.db.close();
});


test('optout is terminal, cancels pending bubbles, and never invokes model or reminders', async () => {
  const f=await opened(); f.deps.classify=async()=>{ throw new Error('must not classify'); };
  await inbound(f,'Por favor, não me envie mais mensagens');
  assert.equal(f.db.prepare('SELECT state FROM campaign_contacts').get()?.state,'stopped');
  f.advance(10*86400000); await f.tick(); assert.equal(f.sent.length,2);
  assert.equal(core.campaignOwnsConversation(f.db,'chat-5511991665576'),true);
  f.db.close();
});
test('commercial/offscript keyword guard hands to human before model and reveals inbox', async () => {
  for (const text of ['qual o valor?', 'qual prazo?', 'quero orçamento', 'manda PDF', 'me liga', 'pode enviar por e-mail?', 'quero visitar', '100 unidades', 'quero canecas', 'vocês dão desconto?', 'qual o preço?']) {
    const f=await opened(); let calls=0;
    f.deps.classify=async()=>{ calls++; return {intent:'yes'}; };
    await inbound(f,text);
    assert.equal(calls,0,text); assert.equal(f.handed.length,1,text);
    assert.equal(core.campaignHiddenConversationIds(f.db).size,0);
    assert.equal(core.campaignOwnsConversation(f.db,'chat-5511991665576'),true);
    await inbound(f,'sim','later'); f.advance(3000); await f.tick(); assert.equal(f.sent.length,2);
    f.db.close();
  }
});
test('unknown and model errors fail closed to human with no generated text', async () => {
  for (const fails of [false,true]) {
    const f=await opened();
    f.deps.classify=async()=>{ if(fails) throw new Error('offline'); return {intent:'unknown'}; };
    await inbound(f,'Tenho uma dúvida diferente');
    assert.equal(f.handed.length,1); f.advance(3000); await f.tick(); assert.equal(f.sent.length,2);
    f.db.close();
  }
});
test('no offers approved two bubbles then second refusal closes once', async () => {
  const f=await opened(); f.deps.classify=async()=>({intent:'no'});
  await inbound(f,'Não costumamos'); f.advance(3000); await f.tick(); f.advance(3000); await f.tick();
  assert.equal(f.sent[2].text,'Entendi! Vale pensar nisso: presente de fim de ano é um endomarketing simples, que faz a equipe se sentir valorizada.');
  assert.equal(f.sent[3].text,'E para o cliente, um brinde com a marca de vocês aumenta a percepção de valor e mantém a empresa na lembrança o ano todo. Posso te mandar a seleção que montamos?');
  await inbound(f,'Não, obrigado','refusal2'); f.advance(3000); await f.tick();
  assert.equal(f.sent[4].text,'Tranquilo, obrigado pelo retorno! Se precisar de brindes, é só me chamar 🙂');
  assert.equal(f.db.prepare('SELECT state FROM campaign_contacts').get()?.state,'stopped');
  f.db.close();
});
test('manually paused conversation never classifies or sends queued campaign bubbles', async () => {
  const f=await opened();
  f.db.prepare("UPDATE atd_conversations SET status='em_atendimento'").run();
  let calls=0; f.deps.classify=async()=>{calls++; return {intent:'yes'};};
  await inbound(f,'sim'); f.advance(3000); await f.tick();
  assert.equal(calls,0); assert.equal(f.sent.length,2); assert.equal(f.handed.length,1);
  f.db.close();
});
test('stale concurrent classifier result cannot override newer optout', async () => {
  const f=await opened(); let resolve!:(result:{intent:'yes'})=>void;
  f.deps.classify=()=>new Promise(r=>{resolve=r;});
  const old=inbound(f,'Sim'); await inbound(f,'Pare de mandar mensagens','stop');
  resolve({intent:'yes'}); await old;
  assert.equal(f.db.prepare('SELECT state FROM campaign_contacts').get()?.state,'stopped');
  f.advance(3000); await f.tick(); assert.equal(f.sent.length,2); f.db.close();
});


async function opened() {
  const f=fixture(); f.add(); core.setCampaignEnabled(f.db,true);
  await f.tick(); f.advance(3000); await f.tick();
  return f;
}
function inbound(f:ReturnType<typeof fixture>, text:string, external='in-1', id=external) {
  f.db.prepare('INSERT INTO atd_messages(id,external_id,conversation_id,author,body,created_at) VALUES(?,?,?,?,?,?)')
    .run(id,external,'chat-5511991665576','cliente',text,f.deps.now().toISOString());
  return core.processCampaignInbound(f.db,'chat-5511991665576',f.deps);
}
test('yes queues only exact approved segment script, dedupes external IDs and never sends inline', async () => {
  const f=await opened();
  await inbound(f,'Sim, costumamos'); assert.equal(f.sent.length,2);
  await inbound(f,'Sim, costumamos','in-1','duplicate-local');
  assert.equal(f.db.prepare('SELECT turns FROM campaign_contacts').get()?.turns,1);
  f.advance(3000); await f.tick(); f.advance(3000); await f.tick();
  assert.equal(f.sent[2].text,'Que legal! Já são mais de 3 anos atendendo empresas da região, e montamos uma seleção de fim de ano para veterinárias e pet shops 👇');
  assert.equal(f.sent[3].text,'https://www.farefoto.com.br/brindes/segmentos/veterinarias-e-pet-shops\nSe algum te interessar, me fala o item e a quantidade que te passo valor e prazo.');
  f.db.close();
});


test('migration is idempotent and campaign defaults disabled', () => {
  const db = new DatabaseSync(':memory:');
  core.migrateCampaign(db); core.migrateCampaign(db);
  assert.equal((core.campaignSnapshot(db) as {enabled:boolean}).enabled, false);
  db.close();
});

const qualified = { verified: true, source: 'public company registry', rationale: 'Verified medium/large employer' };
const lead = (phone = '11991665576', pilot = true) => ({ phone, name: 'Empresa', segment: 11, qualification: qualified, pilot });

test('imports normalized unique contacts; immutable exclusions and qualification/pilot gates', () => {
  const db = new DatabaseSync(':memory:'); core.migrateCampaign(db);
  const id = core.importCampaignContact(db, lead());
  assert.equal(core.importCampaignContact(db, lead('+55 (11) 99166-5576')), id);
  assert.equal(db.prepare('SELECT phone FROM campaign_contacts WHERE id=?').get(id)?.phone, '5511991665576');
  for (const phone of ['11991038295','11943479338','11950640555','11975023299','11948042641','11945084994','1121523200','11953146725','11990007825','1145881365','11968523418','1121360251','1145888899']) {
    const denied = core.importCampaignContact(db, lead(phone));
    assert.equal(db.prepare('SELECT state FROM campaign_contacts WHERE id=?').get(denied)?.state, 'excluded');
    core.importCampaignContact(db, lead(phone));
    assert.equal(db.prepare('SELECT state FROM campaign_contacts WHERE id=?').get(denied)?.state, 'excluded');
  }
  const held = core.importCampaignContact(db, { ...lead('1145830807'), qualification: { ...qualified, verified: false } });
  assert.equal(db.prepare('SELECT state FROM campaign_contacts WHERE id=?').get(held)?.state, 'held');
  const nonpilot = core.importCampaignContact(db, lead('11911112222', false));
  assert.equal(db.prepare('SELECT state FROM campaign_contacts WHERE id=?').get(nonpilot)?.state, 'held');
  assert.throws(() => core.importCampaignContact(db, lead('123')));
  assert.throws(() => core.importCampaignContact(db, { ...lead(), segment: 13 }));
  db.close();
});

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE atd_conversations(id TEXT PRIMARY KEY,phone TEXT,status TEXT);
    CREATE TABLE atd_messages(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT,external_id TEXT,conversation_id TEXT,author TEXT,body TEXT,created_at TEXT);`);
  core.migrateCampaign(db);
  let clock = new Date('2026-11-16T12:00:00Z');
  const sent: Array<{chatId:string;text:string;ref:string}> = [];
  const handed: string[] = []; const alerts: string[] = [];
  const deps: CampaignDeps = {
    now: () => clock, random: () => 0,
    checkWhatsApp: async phone => ({ phone, chatId: phone + '@s.whatsapp.net' }),
    createConversation: contact => {
      const id = 'chat-' + contact.phone;
      db.prepare('INSERT INTO atd_conversations VALUES(?,?,?)').run(id,contact.phone,'ia'); return id;
    },
    classify: async () => ({ intent: 'yes' }),
    send: async message => { sent.push(message); return { messageId: 'out-' + sent.length }; },
    recordOutbound: (id,text,externalId) => {
      if (!db.prepare('SELECT 1 FROM atd_messages WHERE external_id=?').get(externalId))
        db.prepare('INSERT INTO atd_messages(id,external_id,conversation_id,author,body,created_at) VALUES(?,?,?,?,?,?)').run(externalId,externalId,id,'ia',text,clock.toISOString());
    },
    handoff: (id,reason) => { handed.push(reason); db.prepare("UPDATE atd_conversations SET status='em_atendimento' WHERE id=?").run(id); },
    alert: reason => { alerts.push(reason); },
  };
  const add = (phone?:string) => core.importCampaignContact(db, lead(phone));
  const tick = () => core.campaignTick(db,deps);
  const advance = (ms:number) => { clock = new Date(clock.getTime()+ms); };
  const at = (iso:string) => { clock = new Date(iso); };
  return {db,deps,sent,handed,alerts,add,tick,advance,at};
}

test('opening is persistent, disabled by default, due per bubble and weekdays/Sao Paulo window', async () => {
  const f = fixture(); f.add(); await f.tick(); assert.equal(f.sent.length,0);
  core.setCampaignEnabled(f.db,true);
  f.at('2026-11-16T11:59:59Z'); await f.tick(); assert.equal(f.sent.length,0);
  f.at('2026-11-16T12:00:00Z'); await f.tick(); assert.equal(f.sent.length,1);
  assert.equal(f.sent[0].text,'Oi, tudo bem? Sou o Nicolas, da Fare Foto. Fazemos brindes personalizados para empresas aqui de Jundiaí 🙂');
  assert.equal(core.campaignOwnsConversation(f.db,'chat-5511991665576'),true);
  assert.equal(core.campaignHiddenConversationIds(f.db).has('chat-5511991665576'),true);
  await f.tick(); f.advance(2999); await f.tick(); assert.equal(f.sent.length,1);
  f.advance(1); await f.tick(); assert.equal(f.sent.length,2);
  assert.equal(f.sent[1].text,'Vocês costumam presentear os colaboradores ou clientes no fim de ano?');
  core.migrateCampaign(f.db); await f.tick(); assert.equal(f.sent.length,2);
  f.at('2026-11-21T12:00:00Z'); await f.tick(); assert.equal(f.sent.length,2);
  f.at('2026-11-23T20:00:00Z'); await f.tick(); assert.equal(f.sent.length,2);
  f.db.close();
});
