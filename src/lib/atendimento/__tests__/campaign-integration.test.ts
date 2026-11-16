import { DatabaseSync } from 'node:sqlite';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { runAtendimentoMigrations, createConversation, addMessage, listConversations, getConversation, listMessages } from '../repository';
import { migrateCampaign, importCampaignContact, campaignOwnsConversation, processCampaignInbound } from '../campaign';
import { searchMessages } from '../search';
import { teamReport } from '../report';
import { createCampaignDeps } from '../campaignAdapter';
import { runAi, sendStaffMessage } from '../service';

let db: DatabaseSync;
beforeEach(() => { db = new DatabaseSync(':memory:'); runAtendimentoMigrations(db); migrateCampaign(db); });
afterEach(() => db.close());
function fixture() {
 const normal = createConversation(db, {channel:'whatsapp',phone:'5511000000008'});
 const campaign = createConversation(db, {channel:'whatsapp',phone:'5511991665576'});
 const id = importCampaignContact(db, {phone:campaign.phone,name:'Teste',segment:11,qualification:{verified:true,source:'fixture',rationale:'test only'},pilot:true});
 db.prepare("UPDATE campaign_contacts SET conversation_id=?, state='active' WHERE id=?").run(campaign.id,id);
 addMessage(db,{conversationId:normal.id,author:'cliente',body:'seleção normal',authorName:'Teste normal'});
 addMessage(db,{conversationId:campaign.id,author:'cliente',body:'seleção campanha',authorName:'Teste campanha'});
 return {normal,campaign,id};
}
it('keeps automated prospects out of normal lists, search and staff reports until handoff', () => {
 const {normal,campaign,id}=fixture();
 expect(campaignOwnsConversation(db,campaign.id)).toBe(true);
 expect(listConversations(db).map(c=>c.id)).toEqual([normal.id]);
 expect(searchMessages(db,'seleção').map(m=>m.conversationId)).toEqual([normal.id]);
 const report = teamReport(db,{from:new Date('2020-01-01')});
 expect(JSON.stringify(report)).not.toContain(campaign.id);
 db.prepare("UPDATE campaign_contacts SET state='handoff' WHERE id=?").run(id);
 expect(listConversations(db).map(c=>c.id)).toContain(campaign.id);
 expect(searchMessages(db,'seleção').map(m=>m.conversationId)).toContain(campaign.id);
});
it('suppresses campaign signatures only and reveals manual takeover immediately',()=>{
 const {normal,campaign}=fixture(); const staff={id:'test-staff',name:'Nicolas Teste'};
 const message=sendStaffMessage(db,campaign.id,staff,'1',{sign:true});
 expect(message.deliveredText).toBe('1');
 expect(listConversations(db).map(c=>c.id)).toContain(campaign.id);
 expect(sendStaffMessage(db,normal.id,staff,'Olá',{sign:true}).deliveredText).toBe('*Nicolas:*\nOlá');
});
it.each(['stopped','robot','uncertain'])('reveals a new human request after campaign state %s without resuming automation',async(state)=>{
 const {campaign,id}=fixture();db.prepare('UPDATE campaign_contacts SET state=? WHERE id=?').run(state,id);
 addMessage(db,{conversationId:campaign.id,author:'cliente',authorName:'Teste',body:'Quero orçamento de canecas'});
 const fetcher=vi.fn();await processCampaignInbound(db,campaign.id,createCampaignDeps(db,{env:{},fetcher}));
 expect(getConversation(db,campaign.id).status).toBe('em_atendimento');
 expect(listConversations(db).map(c=>c.id)).toContain(campaign.id);
 expect(fetcher).not.toHaveBeenCalled();
});
it('never invokes the generic support brain for any campaign conversation',async()=>{
 const {campaign}=fixture(); const brain=vi.fn();
 expect(await runAi(db,campaign.id,brain)).toEqual([]);
 expect(brain).not.toHaveBeenCalled();
 expect(getConversation(db,campaign.id).status).toBe('ia');
 expect(listMessages(db,campaign.id)).toHaveLength(1);
});
