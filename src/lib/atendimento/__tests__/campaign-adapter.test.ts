import { DatabaseSync } from 'node:sqlite';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { campaignTick, importCampaignContact, setCampaignEnabled } from '../campaign';
import { runAtendimentoMigrations, createConversation, getConversation, listConversations, listMessages } from '../repository';
import { createCampaignDeps } from '../campaignAdapter';
let db: DatabaseSync;
beforeEach(()=>{db=new DatabaseSync(':memory:');runAtendimentoMigrations(db);});
afterEach(()=>db.close());
const env={FARE_PONTE_URL:'http://bridge.invalid',FARE_PONTE_TOKEN:'test-bridge',FARE_IA_URL:'http://ai.invalid',FARE_IA_TOKEN:'test-ai'};
it('has no simulated model fallback and never sends when disabled',async()=>{
 const fetcher=vi.fn(); const deps=createCampaignDeps(db,{env:{},fetcher});
 await expect(deps.classify({text:'sim',segment:11,history:[],state:'opening'})).rejects.toThrow();
 await campaignTick(db,deps);expect(fetcher).not.toHaveBeenCalled();
});
it('uses the configured customer classifier and rejects malformed or freeform answers',async()=>{
 const calls:Array<{url:string;body:unknown}>=[];
 const fetcher=vi.fn(async(url:unknown,init?:RequestInit)=>{calls.push({url:String(url),body:JSON.parse(String(init?.body))});return Response.json({intent:'yes'});});
 const deps=createCampaignDeps(db,{env,fetcher:fetcher as typeof fetch});
 expect(await deps.classify({text:'sim',segment:11,history:[],state:'opening'})).toEqual({intent:'yes'});
 expect(calls[0].url).toBe('http://ai.invalid/campanha/classificar');
 expect(calls[0].body).not.toHaveProperty('model');
 fetcher.mockResolvedValueOnce(Response.json({reply:'Invented price',intent:'not-allowed'}));
 await expect(deps.classify({text:'x',segment:11,history:[],state:'opening'})).rejects.toThrow();
});
it('bounds classifier history and excludes internal notes and system instructions',async()=>{
 let payload:Record<string,unknown>={};
 const fetcher=vi.fn(async(_url:unknown,init?:RequestInit)=>{payload=JSON.parse(String(init?.body));return Response.json({intent:'yes'});});
 const deps=createCampaignDeps(db,{env,fetcher:fetcher as typeof fetch});
 await deps.classify({text:'sim',segment:11,state:'opening',history:[{author:'nota',text:'PRIVATE NOTE'},...Array.from({length:30},()=>({author:'cliente',text:'x'.repeat(4000)}))]});
 const history=payload.history as Array<{author:string;text:string}>;
 expect(history.length).toBeLessThanOrEqual(16);expect(history.map(h=>h.text).join('').length).toBeLessThanOrEqual(24000);expect(history.some(h=>h.author==='nota')).toBe(false);
});
it('creates a hidden campaign, sends unsigned bubbles through the dedicated durable endpoint and records receipts',async()=>{
 let now=new Date('2026-11-16T12:00:00Z');let receipt=0;
 const sent:Array<Record<string,string>>=[];
 const fetcher=vi.fn(async(url:unknown,init?:RequestInit)=>{
  if(String(url).endsWith('/numero'))return Response.json({phone:'5511991665576',chatId:'5511991665576@s.whatsapp.net'});
  if(String(url).endsWith('/campanha/enviar')){sent.push(JSON.parse(String(init?.body)));return Response.json({messageId:`synthetic-${++receipt}`});}
  throw new Error('Unexpected network operation');
 });
 const deps=createCampaignDeps(db,{env,fetcher:fetcher as typeof fetch,now:()=>now,random:()=>0});
 importCampaignContact(db,{phone:'11991665576',name:'Teste',segment:11,qualification:{verified:true,source:'fixture',rationale:'not a real company qualification'},pilot:true});
 setCampaignEnabled(db,true);await campaignTick(db,deps);
 expect(sent).toHaveLength(1);expect(sent[0].text).not.toContain('*Nicolas:*');expect(sent[0].ref).toBeTruthy();
 expect(listConversations(db)).toHaveLength(0);
 now=new Date(now.getTime()+3000);await campaignTick(db,deps);
 expect(sent).toHaveLength(2);expect(sent[1].text).toBe('Vocês costumam presentear os colaboradores ou clientes no fim de ano?');
 const c=db.prepare('SELECT conversation_id FROM campaign_contacts').get()!;
 expect(listMessages(db,String(c.conversation_id)).filter(m=>m.author==='ia')).toHaveLength(2);
});
it('refuses to attach a campaign to any existing support conversation',()=>{
 createConversation(db,{channel:'whatsapp',phone:'5511991665576'});
 const deps=createCampaignDeps(db,{env});
 expect(()=>deps.createConversation({phone:'5511991665576',chatId:'5511991665576@s.whatsapp.net',name:'Teste',segment:11})).toThrow();
});
it('handoff pauses AI, reveals the conversation, marks unread and does not send a customer message',()=>{
 const fetcher=vi.fn();const deps=createCampaignDeps(db,{env,fetcher});
 const id=deps.createConversation({phone:'5511991665576',chatId:'5511991665576@s.whatsapp.net',name:'Teste',segment:11});
 deps.handoff(id,'Pediu orçamento');
 const c=getConversation(db,id);expect(c.status).toBe('em_atendimento');expect(c.unread).toBeGreaterThan(0);expect(c.handoffReason).toContain('Pediu orçamento');
 expect(listMessages(db,id).filter(m=>m.author==='ia')).toHaveLength(0);expect(fetcher).not.toHaveBeenCalled();
});
it('outbound receipt recording is idempotent and never applies seller signature',()=>{
 const deps=createCampaignDeps(db,{env});const id=deps.createConversation({phone:'5511991665576',chatId:'5511991665576@s.whatsapp.net',name:'Teste',segment:11});
 deps.recordOutbound(id,'1','synthetic-1');deps.recordOutbound(id,'1','synthetic-1');
 const messages=listMessages(db,id).filter(m=>m.author==='ia');expect(messages).toHaveLength(1);expect(messages[0].deliveredText).toBe('1');
});
