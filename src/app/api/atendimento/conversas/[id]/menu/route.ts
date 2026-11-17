import { atendimentoDb, json, readJson, withStaff } from '@/lib/atendimento/server';
import { selectStaffMenu } from '@/lib/atendimento/interactiveService';
import { createCampaignDeps } from '@/lib/atendimento/campaignAdapter';
import { AtendimentoError, getConversation } from '@/lib/atendimento/repository';
export const dynamic='force-dynamic';
export const POST=withStaff(async(staff,request,context:{params:Promise<{id:string}>})=>{
 const {id}=await context.params,body=await readJson(request),db=atendimentoDb();
 if(typeof body.messageId!=='string' || !body.messageId || body.messageId.length>80 || typeof body.optionId!=='string' || !body.optionId || body.optionId.length>512)throw new AtendimentoError('INVALID_REQUEST','Seleção inválida.');
 const message=await selectStaffMenu(db,id,body.messageId,body.optionId,staff,createCampaignDeps(db).send);
 return json({message,conversation:getConversation(db,id)});
});
