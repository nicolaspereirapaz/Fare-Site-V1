import type { DatabaseSync } from 'node:sqlite';
import type { CampaignDeps } from '@/lib/atendimento/campaign';
import { addMessage, createConversation, getConversation, handOffToStaff, markConversationUnread, messageByExternalId, setConversationTags } from '@/lib/atendimento/repository';

const SEGMENTS = ['RH de empresas','Contabilidade','Imobiliárias e construtoras','Advocacia','Indústrias e logística','Clínicas odontológicas','Concessionárias','Academias','Salões e estética','Escolas','Veterinárias e pet shops','Seguros e cooperativas'];
type Options = {env?:Record<string,string|undefined>;fetcher?:typeof fetch;now?:()=>Date;random?:()=>number;alert?:(reason:string)=>void};
const INTENTS = new Set(['yes','no','optout','handoff','robot','menu','unknown']);

/** No global model or simulated fallback. This adapter only calls the existing customer AI service. */
export function createCampaignDeps(db:DatabaseSync, options:Options = {}):CampaignDeps {
 const env=options.env ?? process.env, fetcher=options.fetcher ?? fetch;
 const now=options.now ?? (()=>new Date());
 const config=(kind:'PONTE'|'IA')=>{
  const url=env[`FARE_${kind}_URL`]?.trim().replace(/\/$/,'');
  const token=env[`FARE_${kind}_TOKEN`]?.trim();
  if(!url || !token)throw new Error(`Campaign ${kind} unavailable`);
  return {url,token};
 };
 async function post(kind:'PONTE'|'IA',path:string,body:unknown,timeout=30000):Promise<Response>{
  const c=config(kind);
  return fetcher(c.url+path,{method:'POST',headers:{'content-type':'application/json','x-fare-token':c.token},body:JSON.stringify(body),signal:AbortSignal.timeout(timeout)});
 }
 return {
  now,random:options.random ?? Math.random,
  async checkWhatsApp(phone){
   const response=await post('PONTE','/fare/painel/numero',{phone},20000);
   if(response.status===404)return null;
   if(!response.ok)throw new Error('Campaign WhatsApp lookup unavailable');
   const data=await response.json();
   if(typeof data.chatId!=='string' || !/@(?:s\.whatsapp\.net|lid)$/.test(data.chatId) || typeof data.phone!=='string' || data.phone!==phone)throw new Error('Invalid campaign WhatsApp destination');
   return {chatId:data.chatId,phone:data.phone};
  },
  createConversation(contact){
   if(!/^55[1-9]\d{9,10}$/.test(contact.phone) || !/@(?:s\.whatsapp\.net|lid)$/.test(contact.chatId) || !SEGMENTS[contact.segment-1])throw new Error('Invalid campaign contact');
   const existing=db.prepare("SELECT phone, wa_chat_id FROM atd_conversations WHERE channel='whatsapp'").all();
   if(existing.some(c=>String(c.phone).replace(/\D/g,'').replace(/^(?=\d{10,11}$)/,'55')===contact.phone || c.wa_chat_id===contact.chatId))throw new Error('Existing support conversation; campaign cannot attach');
   const c=createConversation(db,{channel:'whatsapp',phone:contact.phone,waChatId:contact.chatId,contactName:contact.name});
   setConversationTags(db,c.id,['Campanha fim de ano',SEGMENTS[contact.segment-1]]);
   return c.id;
  },
  async classify(input){
   const history=input.history.filter(turn=>['cliente','ia','vendedor'].includes(turn.author)).slice(-12).map(turn=>({author:turn.author,text:turn.text.slice(0,1800)}));
   const response=await post('IA','/campanha/classificar',{text:input.text,segment:input.segment,history,state:input.state},90000);
   if(!response.ok)throw new Error('Campaign classifier unavailable');
   const data=await response.json();
   if(!data || typeof data.intent!=='string' || !INTENTS.has(data.intent))throw new Error('Invalid campaign classifier output');
   if(data.menuOption!==undefined && (typeof data.menuOption!=='string' || !/^[0-9a-z]{1,12}$/i.test(data.menuOption)))throw new Error('Invalid campaign menu selection');
   return {intent:data.intent, ...(data.menuOption ? {menuOption:data.menuOption} : {})};
  },
  async send(input){
   if(!input.ref || !input.text || !/@(?:s\.whatsapp\.net|lid)$/.test(input.chatId))throw new Error('Invalid campaign delivery');
   const response=await post('PONTE','/fare/painel/campanha/enviar',input);
   if(!response.ok)throw new Error('Campaign delivery uncertain; reconcile, do not repeat');
   const data=await response.json();
   if(typeof data.messageId!=='string' || !data.messageId || input.selection && (data.status!=='confirmed' || data.success!==true || data.ref!==input.ref))throw new Error('Missing campaign receipt');
   return {messageId:data.messageId};
  },
  recordOutbound(conversationId,text,externalId){
   const prior=messageByExternalId(db,externalId);
   if(prior){if(prior.conversationId!==conversationId || prior.body!==text)throw new Error('Conflicting campaign receipt');return;}
   addMessage(db,{conversationId,author:'ia',authorName:'Campanha',body:text,deliveredText:text,externalId,delivery:'enviada'});
  },
  handoff(conversationId,reason){
   const current=getConversation(db,conversationId);
   if(current.status==='ia')handOffToStaff(db,conversationId,reason);
   else {
    db.prepare('UPDATE atd_conversations SET handoff_reason=?, waiting_since=COALESCE(waiting_since,?) WHERE id=?').run(reason,now().toISOString(),conversationId);
    addMessage(db,{conversationId,author:'nota',authorName:'Campanha',body:`Campanha: ${reason}`,deliveredText:''});
   }
   markConversationUnread(db,conversationId);
  },
  alert:options.alert ?? ((reason)=>console.error('[campaign]',reason)),
 };
}
