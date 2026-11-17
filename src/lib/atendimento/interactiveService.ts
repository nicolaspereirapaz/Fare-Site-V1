import type { DatabaseSync } from 'node:sqlite';
import { canonicalMenuRef, menuFresh } from './interactive';
import { AtendimentoError, addMessage, assumeConversation, getConversation, getMessage, type StaffActor } from './repository';
import { revealCampaignForStaff } from './campaign';
export type NativeSend={chatId:string;text:string;ref:string;selection:{messageId:string;optionId:string}};
function invalid():never{throw new AtendimentoError('INVALID_REQUEST','Menu indisponível, expirado ou já selecionado. Atualize a conversa.');}
export function savedMenuChoice(db:DatabaseSync,conversationId:string,messageId:string,optionId:string,now=Date.now()){
 const message=getMessage(db,messageId),c=getConversation(db,conversationId),menu=message?.interactive;
 if(!message || message.conversationId!==conversationId || message.author!=='cliente' || !menu || menu.messageId!==db.prepare('SELECT external_id FROM atd_messages WHERE id=?').get(messageId)?.external_id || c.channel!=='whatsapp' || c.waChatId!==menu.chatId || !menuFresh(menu,now) || message.menuSelection)invalid();
 if(db.prepare("SELECT 1 FROM atd_messages WHERE conversation_id=? AND seq>? AND (interactive IS NOT NULL OR author IN ('vendedor','ia'))").get(conversationId,message.seq))invalid();
 const chosen=menu.options.find(o=>o.id===optionId);if(!chosen)invalid();
 return {message,menu,chosen,input:{chatId:menu.chatId,text:chosen.label,ref:canonicalMenuRef(menu),selection:{messageId:menu.messageId,optionId:chosen.id}}};
}
export { reserveMenu, finishMenu } from './interactiveStore';
import { reserveMenu, finishMenu } from './interactiveStore';
export async function selectStaffMenu(db:DatabaseSync,conversationId:string,messageId:string,optionId:string,staff:StaffActor,send:(input:NativeSend)=>Promise<{messageId:string}>){
 db.exec('BEGIN IMMEDIATE');let input:NativeSend;
 try{
  input=savedMenuChoice(db,conversationId,messageId,optionId).input;
  if(db.prepare("SELECT 1 FROM campaign_queue q JOIN campaign_contacts c ON c.id=q.contact_id WHERE c.conversation_id=? AND q.status IN ('sending','uncertain')").get(conversationId))invalid();
  reserveMenu(db,input,conversationId,messageId);revealCampaignForStaff(db,conversationId);assumeConversation(db,conversationId,staff);db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}
 try{
  const result=await send(input);if(!result.messageId)throw new Error('Missing native receipt');
  addMessage(db,{conversationId,author:'vendedor',authorName:staff.name,body:input.text,deliveredText:input.text,externalId:result.messageId,delivery:'enviada'});
  finishMenu(db,input.ref,'confirmed',result.messageId);
 }catch{finishMenu(db,input.ref,'uncertain');throw new AtendimentoError('INVALID_REQUEST','Envio incerto. Não repita a seleção; confirme no WhatsApp.');}
 return getMessage(db,messageId);
}
