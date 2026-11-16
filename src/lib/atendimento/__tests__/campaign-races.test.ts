import { afterEach, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { campaignHiddenConversationIds, campaignTick, importCampaignContact, migrateCampaign, processCampaignInbound, setCampaignEnabled, type CampaignDeps } from '../campaign';
const databases:DatabaseSync[]=[];afterEach(()=>{for(const db of databases.splice(0))db.close();});
function fixture(){
 const db=new DatabaseSync(':memory:');databases.push(db);
 db.exec('CREATE TABLE atd_conversations(id TEXT PRIMARY KEY,phone TEXT,status TEXT); CREATE TABLE atd_messages(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT,external_id TEXT,conversation_id TEXT,author TEXT,body TEXT,created_at TEXT)');migrateCampaign(db);
 let clock=new Date('2026-11-16T12:00:00Z'),seq=0;const sent:Array<{text:string;chatId:string;ref:string}>=[];const handed:string[]=[];
 const deps:CampaignDeps={now:()=>clock,random:()=>0,checkWhatsApp:async(phone)=>({phone,chatId:phone+'@s.whatsapp.net'}),
 createConversation:c=>{const id='chat-'+c.phone;db.prepare('INSERT INTO atd_conversations VALUES(?,?,?)').run(id,c.phone,'ia');return id;},
 classify:async()=>({intent:'yes'}),send:async(input)=>{sent.push(input);return {messageId:'out-'+sent.length};},
 recordOutbound:(id,text,external)=>{db.prepare('INSERT INTO atd_messages(id,external_id,conversation_id,author,body,created_at) VALUES(?,?,?,?,?,?)').run(external,external,id,'ia',text,clock.toISOString());},
 handoff:(id,reason)=>{handed.push(reason);db.prepare("UPDATE atd_conversations SET status='em_atendimento' WHERE id=?").run(id);},alert:()=>{}};
 const add=(phone='11991665576')=>importCampaignContact(db,{phone,name:'FIXTURE',segment:11,qualification:{verified:true,source:'synthetic fixture',rationale:'not a real qualification'},pilot:true});
 const persist=(text:string)=>{const id='in-'+(++seq);db.prepare('INSERT INTO atd_messages(id,external_id,conversation_id,author,body,created_at) VALUES(?,?,?,?,?,?)').run(id,id,'chat-5511991665576','cliente',text,clock.toISOString());};
 const process=()=>processCampaignInbound(db,'chat-5511991665576',deps);
 const inbound=async(text:string)=>{persist(text);await process();};
 const advance=(ms=3000)=>{clock=new Date(clock.getTime()+ms);};
 const tick=()=>campaignTick(db,deps);
 const contact=()=>db.prepare("SELECT * FROM campaign_contacts WHERE phone='5511991665576'").get()!;
 return {db,deps,sent,handed,add,persist,process,inbound,advance,tick,contact};
}
async function opened(){const f=fixture();f.add();setCampaignEnabled(f.db,true);await f.tick();f.advance();await f.tick();return f;}
it('processes a batched opt-out before a later robot greeting and never reminds',async()=>{
 const f=await opened();f.persist('Pare de mandar mensagens');f.persist('Seja bem-vindo! Aguarde nossa equipe.');await f.process();
 expect(f.contact().state).toBe('stopped');f.advance(3*86400000);await f.tick();expect(f.sent).toHaveLength(2);
});
it('preserves human handoff when an earlier in-flight delivery fails',async()=>{
 const f=fixture();f.add();setCampaignEnabled(f.db,true);
 let reject!:(error:Error)=>void;f.deps.send=()=>new Promise((_r,j)=>{reject=j;});
 const pending=f.tick();while(!reject)await Promise.resolve();
 await f.inbound('Quero orçamento de canecas');expect(f.contact().state).toBe('handoff');
 reject(new Error('timeout'));await pending;
 expect(f.contact().state).toBe('handoff');expect(campaignHiddenConversationIds(f.db).has(String(f.contact().conversation_id))).toBe(false);
 expect(f.db.prepare("SELECT status FROM campaign_queue WHERE status='uncertain'").get()).toBeTruthy();
});
it('preserves opt-out when an earlier in-flight delivery fails',async()=>{
 const f=fixture();f.add();setCampaignEnabled(f.db,true);
 let reject!:(error:Error)=>void;f.deps.send=()=>new Promise((_r,j)=>{reject=j;});const pending=f.tick();while(!reject)await Promise.resolve();
 await f.inbound('Pare de enviar mensagens');reject(new Error('timeout'));await pending;expect(f.contact().state).toBe('stopped');
});
it('hands off a commercial request even when its greeting resembles a robot',async()=>{
 const f=await opened();await f.inbound('Seja bem-vindo, sou a Ana. Quero orçamento de 100 canecas.');expect(f.handed).toHaveLength(1);expect(f.contact().state).toBe('handoff');
});
it('an ignored automatic reply preserves the second opening bubble and reminder schedule',async()=>{
 const f=fixture();f.add();setCampaignEnabled(f.db,true);await f.tick();
 await f.inbound('Seja bem-vindo! Nosso horário de atendimento é das 9h às 18h.');f.advance();await f.tick();
 expect(f.sent).toHaveLength(2);expect(f.sent[1].text).toBe('Vocês costumam presentear os colaboradores ou clientes no fim de ano?');expect(f.contact().reminder_due).not.toBeNull();
});
it('a second yes before the link preserves the never-sent link without repeating sent text',async()=>{
 const f=await opened();await f.inbound('Sim');f.advance();await f.tick();await f.inbound('Pode mandar');f.advance();await f.tick();
 expect(f.sent.filter(m=>m.text.startsWith('Que legal!'))).toHaveLength(1);expect(f.sent.filter(m=>m.text.startsWith('https://'))).toHaveLength(1);
});
it('the reserve pilot is eligible after a confirmed no-WhatsApp lookup',async()=>{
 const f=fixture();f.add();f.add('1145830807');f.add('1145831111');setCampaignEnabled(f.db,true);
 f.deps.checkWhatsApp=async(phone)=>phone==='551145830807'?null:{phone,chatId:phone+'@s.whatsapp.net'};
 await f.tick();f.advance();await f.tick();f.advance(180000);await f.tick();f.advance(180000);await f.tick();
 expect(f.sent.some(m=>m.chatId==='551145831111@s.whatsapp.net')).toBe(true);expect(new Set(f.sent.map(m=>m.chatId)).size).toBe(2);
});
