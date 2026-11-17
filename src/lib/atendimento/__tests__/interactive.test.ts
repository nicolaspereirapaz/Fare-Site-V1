import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { runAtendimentoMigrations, listMessages } from '../repository';
import { parseInbound, receiveWhatsAppMessage } from '../whatsapp';
import { validateInteractive, canonicalMenuRef, safeMenuOption } from '../interactive';
import { selectStaffMenu } from '../interactiveService';
it('reserves a manual choice durably, uses saved native destination and blocks concurrent duplicates',async()=>{
 const {conversationId}=receiveWhatsAppMessage(db,parseInbound({externalId:menu.messageId,chatId:menu.chatId,phone:'5511991665576',text:'Escolha',interactive:menu}));
 const m=listMessages(db,conversationId)[0];const send=vi.fn(async(input:any)=>({messageId:'receipt'}));
 await expect(selectStaffMenu(db,conversationId,m.id,'forged',{id:'staff',name:'Nicolas'},send)).rejects.toThrow();expect(send).not.toHaveBeenCalled();
 await selectStaffMenu(db,conversationId,m.id,menu.options[0].id,{id:'staff',name:'Nicolas'},send);
 expect(send).toHaveBeenCalledWith({chatId:menu.chatId,text:'Recursos humanos',ref:canonicalMenuRef(menu),selection:{messageId:menu.messageId,optionId:'real-rh-id'}});
 expect(listMessages(db,conversationId)[0].menuSelection).toMatchObject({status:'confirmed',messageId:'receipt'});
 await expect(selectStaffMenu(db,conversationId,m.id,menu.options[1].id,{id:'staff',name:'Nicolas'},send)).rejects.toThrow();expect(send).toHaveBeenCalledTimes(1);
 expect(listMessages(db,conversationId).at(-1)?.deliveredText).toBe('Recursos humanos');
});
it('keeps ambiguous deliveries disabled across reload, with no retry',async()=>{
 const {conversationId}=receiveWhatsAppMessage(db,parseInbound({externalId:menu.messageId,chatId:menu.chatId,phone:'5511991665576',text:'Escolha',interactive:menu}));const m=listMessages(db,conversationId)[0];const send=vi.fn(async()=>{throw new Error('timeout');});
 await expect(selectStaffMenu(db,conversationId,m.id,menu.options[0].id,{id:'staff',name:'Nicolas'},send)).rejects.toThrow();
 expect(listMessages(db,conversationId)[0].menuSelection?.status).toBe('uncertain');
 await expect(selectStaffMenu(db,conversationId,m.id,menu.options[0].id,{id:'staff',name:'Nicolas'},send)).rejects.toThrow();expect(send).toHaveBeenCalledTimes(1);
});


import { campaignTick, processCampaignInbound, importCampaignContact, setCampaignEnabled } from '../campaign';
import { createCampaignDeps } from '../campaignAdapter';
it('automatically selects exactly one genuine safe native option via durable queue even on fast reply, using inbound LID',async()=>{
 const now=new Date('2026-11-17T15:00:00Z');const native={...menu,chatId:'123456@lid',receivedAt:now.getTime()};
 const {conversationId}=receiveWhatsAppMessage(db,parseInbound({externalId:native.messageId,chatId:native.chatId,phone:'5511991665576',text:'RH/compras',interactive:native}));
 const id=importCampaignContact(db,{phone:'5511991665576',name:'Test',segment:1,pilot:true,qualification:{verified:true,source:'test',rationale:'test'}});
 db.prepare("UPDATE campaign_contacts SET state='active',conversation_id=?,chat_id=?,last_sent=? WHERE id=?").run(conversationId,menu.chatId,now.getTime()-1000,id);
 const fetcher=vi.fn(async(_url:any,init:any)=>{const payload=JSON.parse(init.body);return Response.json({status:'confirmed',success:true,ref:payload.ref,messageId:'auto-receipt'});});
 const deps=createCampaignDeps(db,{now:()=>now,random:()=>0,env:{FARE_PONTE_URL:'https://fake',FARE_PONTE_TOKEN:'fake'},fetcher});
 setCampaignEnabled(db,true);await campaignTick(db,deps);await campaignTick(db,deps);
 expect(fetcher).toHaveBeenCalledTimes(1);expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({chatId:native.chatId,text:'Recursos humanos',ref:canonicalMenuRef(native),selection:{messageId:native.messageId,optionId:'real-rh-id'}});
 expect(listMessages(db,conversationId)[0].menuSelection).toMatchObject({status:'confirmed',messageId:'auto-receipt'});
 expect(db.prepare('SELECT menu_used FROM campaign_contacts WHERE id=?').get(id)?.menu_used).toBe(1);
 const next={...native,messageId:'second'};receiveWhatsAppMessage(db,parseInbound({externalId:next.messageId,chatId:next.chatId,phone:'5511991665576',text:'Escolha',interactive:next}));
 await processCampaignInbound(db,conversationId,deps);expect(db.prepare('SELECT state FROM campaign_contacts WHERE id=?').get(id)?.state).toBe('handoff');expect(fetcher).toHaveBeenCalledTimes(1);
});


function activeMenu(native=menu){
 const now=new Date(native.receivedAt);const {conversationId}=receiveWhatsAppMessage(db,parseInbound({externalId:native.messageId,chatId:native.chatId,phone:'5511991665576',text:'Escolha',interactive:native}));
 const id=importCampaignContact(db,{phone:'5511991665576',name:'Test',segment:1,pilot:true,qualification:{verified:true,source:'test',rationale:'test'}});
 db.prepare("UPDATE campaign_contacts SET state='active',conversation_id=?,chat_id=? WHERE id=?").run(conversationId,native.chatId,id);
 const fetcher=vi.fn(async(_url:any,init:any)=>{const body=JSON.parse(init.body);return Response.json({status:'confirmed',success:true,ref:body.ref,messageId:'receipt'});});
 const deps=createCampaignDeps(db,{now:()=>now,random:()=>0,fetcher,alert:()=>{},env:{FARE_PONTE_URL:'https://fake',FARE_PONTE_TOKEN:'fake'}});
 return {conversationId,id,fetcher,deps};
}
it.each(['handoff','stopped','uncertain','robot'])('never auto-reactivates terminal %s with a genuine menu',async(state)=>{
 const f=activeMenu({...menu,receivedAt:Date.parse('2026-11-17T15:00:00Z')});db.prepare('UPDATE campaign_contacts SET state=? WHERE id=?').run(state,f.id);setCampaignEnabled(db,true);await campaignTick(db,f.deps);expect(f.fetcher).not.toHaveBeenCalled();expect(db.prepare('SELECT state FROM campaign_contacts WHERE id=?').get(f.id)?.state).toBe(state);
});
it('honors pause, version/takeover and one shared manual/automatic reservation',async()=>{
 const f=activeMenu({...menu,receivedAt:Date.now()});await processCampaignInbound(db,f.conversationId,f.deps);
 expect(db.prepare("SELECT COUNT(*) n FROM campaign_queue WHERE status='pending'").get()?.n).toBe(1);
 const source=listMessages(db,f.conversationId)[0];const send=vi.fn(async()=>({messageId:'manual'}));await selectStaffMenu(db,f.conversationId,source.id,'real-rh-id',{id:'staff',name:'Staff'},send);
 expect(db.prepare("SELECT COUNT(*) n FROM campaign_queue WHERE status='pending'").get()?.n).toBe(0);expect(db.prepare('SELECT COUNT(*) n FROM atd_menu_selections').get()?.n).toBe(1);
 setCampaignEnabled(db,true);await campaignTick(db,f.deps);expect(f.fetcher).not.toHaveBeenCalled();
});
it.each(['ambiguous','expired','unknown'])('hands off %s menus without model-invented IDs',async(kind)=>{
 const native={...menu,receivedAt:Date.parse('2026-11-17T15:00:00Z'),options:kind==='ambiguous'?[{id:'a',label:'RH'},{id:'b',label:'Compras'}]:kind==='unknown'?[{id:'a',label:'Agendar consulta'}]:menu.options};const f=activeMenu(native);
 if(kind==='expired')f.deps.now=()=>new Date(native.receivedAt+2*86400000);
 await processCampaignInbound(db,f.conversationId,f.deps);expect(f.fetcher).not.toHaveBeenCalled();expect(db.prepare('SELECT state FROM campaign_contacts WHERE id=?').get(f.id)?.state).toBe('handoff');
});
it('native selection consumes exactly the last permitted bubble',async()=>{
 const f=activeMenu({...menu,receivedAt:Date.parse('2026-11-17T15:00:00Z')});db.prepare('INSERT INTO campaign_daily(day,bubbles) VALUES(?,59)').run('2026-11-17');setCampaignEnabled(db,true);await campaignTick(db,f.deps);expect(f.fetcher).toHaveBeenCalledTimes(1);expect(db.prepare('SELECT bubbles FROM campaign_daily').get()?.bubbles).toBe(60);
});
it('rejects mismatched native message identity, from-phone and historical selectable metadata',()=>{
 expect(()=>parseInbound({externalId:'other',chatId:menu.chatId,phone:'5511991665576',text:'Menu',interactive:menu})).toThrow();
 expect(()=>parseInbound({externalId:menu.messageId,chatId:menu.chatId,phone:'5511991665576',text:'Menu',interactive:menu,fromPhone:true})).toThrow();
 expect(()=>parseInbound({externalId:menu.messageId,chatId:menu.chatId,phone:'5511991665576',text:'Menu',interactive:menu,fromMe:true})).toThrow();
 const history=parseInbound({externalId:menu.messageId,chatId:menu.chatId,phone:'5511991665576',text:'Menu',interactive:menu,historico:true,sentAt:new Date(Date.now()-60000).toISOString()});expect(history.interactive).toBeUndefined();
});
it('manual stale menu and another conversation cannot send',async()=>{
 const f=activeMenu();const first=listMessages(db,f.conversationId)[0];const next={...menu,messageId:'newer'};receiveWhatsAppMessage(db,parseInbound({externalId:next.messageId,chatId:next.chatId,phone:'5511991665576',text:'New menu',interactive:next}));const send=vi.fn();await expect(selectStaffMenu(db,f.conversationId,first.id,'real-rh-id',{id:'staff',name:'Staff'},send)).rejects.toThrow();expect(send).not.toHaveBeenCalled();
});


it('hands off a textual continuation after the one native selection',async()=>{
 const f=activeMenu({...menu,receivedAt:Date.parse('2026-11-17T15:00:00Z')});setCampaignEnabled(db,true);await campaignTick(db,f.deps);
 receiveWhatsAppMessage(db,parseInbound({externalId:'continuation',chatId:menu.chatId,phone:'5511991665576',text:'Digite uma opção: 1 - Atendente'}));await processCampaignInbound(db,f.conversationId,f.deps);
 expect(db.prepare('SELECT state FROM campaign_contacts WHERE id=?').get(f.id)?.state).toBe('handoff');expect(f.fetcher).toHaveBeenCalledTimes(1);
});
it('a pending manual native send prevents a simultaneous second click',async()=>{
 const f=activeMenu();const source=listMessages(db,f.conversationId)[0];let resolve!:(r:{messageId:string})=>void;const send=vi.fn(()=>new Promise<{messageId:string}>(r=>{resolve=r;}));const first=selectStaffMenu(db,f.conversationId,source.id,'real-rh-id',{id:'s',name:'Staff'},send);
 await expect(selectStaffMenu(db,f.conversationId,source.id,'appointment',{id:'s',name:'Staff'},send)).rejects.toThrow();expect(send).toHaveBeenCalledTimes(1);resolve({messageId:'concurrent-receipt'});await first;
});
it('rejects a successful HTTP response lacking the exact native confirmed receipt without replay',async()=>{
 const f=activeMenu({...menu,receivedAt:Date.parse('2026-11-17T15:00:00Z')});f.fetcher.mockImplementation(async()=>Response.json({messageId:'looks-ok',status:'confirmed',success:true,ref:'wrong-ref'}));setCampaignEnabled(db,true);await campaignTick(db,f.deps);await campaignTick(db,f.deps);expect(f.fetcher).toHaveBeenCalledTimes(1);expect(listMessages(db,f.conversationId)[0].menuSelection?.status).toBe('uncertain');
});


it('revalidates the exact safe saved option at dispatch, not merely the existence of some safe option',async()=>{
 const f=activeMenu({...menu,receivedAt:Date.parse('2026-11-17T15:00:00Z')});await processCampaignInbound(db,f.conversationId,f.deps);const row=db.prepare('SELECT * FROM campaign_queue').get()!;const payload=JSON.parse(String(row.selection));payload.text='Agendamento';payload.selection.optionId='appointment';db.prepare('UPDATE campaign_queue SET selection=?,text=? WHERE ref=?').run(JSON.stringify(payload),payload.text,String(row.ref));setCampaignEnabled(db,true);await campaignTick(db,f.deps);expect(f.fetcher).not.toHaveBeenCalled();
});

let db:DatabaseSync;
export const menu={version:1 as const,messageId:'native-id',chatId:'5511991665576@s.whatsapp.net',kind:'list' as const,body:'Escolha',options:[{id:'real-rh-id',label:'Recursos humanos'},{id:'appointment',label:'Agendamento'}],receivedAt:Date.now()};
beforeEach(()=>{db=new DatabaseSync(':memory:');runAtendimentoMigrations(db);});afterEach(()=>db.close());
it('persists bounded inbound native metadata and deduplicates source events',()=>{
 const input=parseInbound({externalId:menu.messageId,chatId:menu.chatId,phone:'5511991665576',text:'Escolha',interactive:menu});
 const first=receiveWhatsAppMessage(db,input);receiveWhatsAppMessage(db,input);
 expect(listMessages(db,first.conversationId)).toHaveLength(1);
 expect(listMessages(db,first.conversationId)[0].interactive).toEqual(menu);
});
it('rejects unknown kinds, duplicate IDs, overlong IDs and CTA options without repairing them',()=>{
 for(const value of [{...menu,kind:'url'},{...menu,options:[menu.options[0],menu.options[0]]},{...menu,options:[{id:'x'.repeat(513),label:'RH'}]},{...menu,options:[{id:'x',label:'RH',url:'https://bad'}]}])expect(validateInteractive(value)).toBeNull();
 expect(safeMenuOption(validateInteractive(menu)!)).toEqual(menu.options[0]);
 expect(safeMenuOption({...menu,options:[{id:'a',label:'RH'},{id:'b',label:'Compras'}]})).toBeNull();
 expect(safeMenuOption({...menu,options:[{id:'a',label:'Atendente virtual'}]})).toBeNull();
 expect(canonicalMenuRef(menu)).toMatch(/^menu:[a-f0-9]{64}$/);
});
