import {DatabaseSync} from 'node:sqlite';
import {afterEach,expect,it} from 'vitest';
import * as core from '../campaign';
const dbs:DatabaseSync[]=[];afterEach(()=>{for(const db of dbs.splice(0))db.close();});
const qualify={verified:true,source:'Seleção operacional da planilha, autorizada pelo usuário',rationale:'Fixture; sem verificação externa de porte'};
function fixture(){
 const db=new DatabaseSync(':memory:');dbs.push(db);core.migrateCampaign(db);
 db.exec('CREATE TABLE atd_conversations(id TEXT PRIMARY KEY,phone TEXT,status TEXT);CREATE TABLE atd_messages(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT,external_id TEXT,conversation_id TEXT,author TEXT,body TEXT,created_at TEXT)');
 let clock=new Date('2026-11-17T12:00:00Z');const started:number[]=[];const sent:string[]=[];
 const deps:core.CampaignDeps={now:()=>clock,random:()=>0,checkWhatsApp:async phone=>({phone,chatId:phone+'@s.whatsapp.net'}),createConversation:c=>{started.push(c.segment);db.prepare('INSERT INTO atd_conversations VALUES(?,?,?)').run(c.phone,c.phone,'ia');return c.phone;},classify:async()=>({intent:'unknown'}),send:async m=>{sent.push(m.text);return {messageId:'fixture-'+sent.length};},recordOutbound:()=>{},handoff:()=>{},alert:()=>{}};
 const add=(i:number,segment:number,verified=true)=>core.importCampaignContact(db,{phone:'551190000'+String(i).padStart(4,'0'),name:'SYNTHETIC '+i,segment,qualification:{...qualify,verified}});
 const audience=(mode:'pilot'|'list')=>(core as unknown as {setCampaignAudience:(db:DatabaseSync,mode:'pilot'|'list')=>void}).setCampaignAudience(db,mode);
 const advance=(ms=180000)=>{clock=new Date(clock.getTime()+ms);};return {db,deps,started,sent,add,audience,advance};
}
it('upgrades old settings idempotently and preserves safe pilot default',()=>{
 const db=new DatabaseSync(':memory:');dbs.push(db);db.exec('CREATE TABLE campaign_settings(id INTEGER PRIMARY KEY,enabled INTEGER,next_contact INTEGER,next_bubble INTEGER);INSERT INTO campaign_settings VALUES(1,0,0,0)');core.migrateCampaign(db);core.migrateCampaign(db);
 expect(db.prepare('SELECT audience FROM campaign_settings').get()?.audience).toBe('pilot');
});
it('does not change audience while enabled or while a durable dispatch lock exists',()=>{
 const f=fixture();core.setCampaignEnabled(f.db,true);expect(()=>f.audience('list')).toThrow();core.setCampaignEnabled(f.db,false);f.db.prepare("UPDATE campaign_runtime SET busy='uncertain' WHERE id=1").run();expect(()=>f.audience('list')).toThrow();
});
it('uses declared potential-volume priority across all segments, not the first two pilots',async()=>{
 const f=fixture();f.audience('list');for(let segment=12;segment>=1;segment--)f.add(segment,segment);core.setCampaignEnabled(f.db,true);
 for(let i=0;i<24;i++){await core.campaignTick(f.db,f.deps);f.advance();}
 expect(f.started).toEqual([5,1,7,10,3,12,2,4,6,11,8,9]);expect(f.sent).toHaveLength(24);
});
it('retains exclusions and holds unapproved records even in list mode',()=>{
 const f=fixture();f.audience('list');const held=f.add(1,5,false);const denied=core.importCampaignContact(f.db,{phone:'11991038295',name:'Excluded',segment:1,qualification:qualify});
 expect(f.db.prepare('SELECT state FROM campaign_contacts WHERE id=?').get(held)?.state).toBe('held');expect(f.db.prepare('SELECT state FROM campaign_contacts WHERE id=?').get(denied)?.state).toBe('excluded');
});
it('list mode still stops at fifteen new contacts and resumes next business day',async()=>{
 const f=fixture();f.audience('list');for(let i=1;i<=16;i++)f.add(i,5);core.setCampaignEnabled(f.db,true);
 for(let i=0;i<36;i++){await core.campaignTick(f.db,f.deps);f.advance();}
 expect(f.started).toHaveLength(15);expect(f.sent).toHaveLength(30);
 f.advance(86400000);await core.campaignTick(f.db,f.deps);expect(f.started).toHaveLength(16);
});
it('default pilot mode keeps ordinary list contacts held',()=>{
 const f=fixture();const id=f.add(1,5);expect(f.db.prepare('SELECT state FROM campaign_contacts WHERE id=?').get(id)?.state).toBe('held');
});
