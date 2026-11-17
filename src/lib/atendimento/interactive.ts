import { createHash } from 'node:crypto';
export type InteractiveMenu={version:1;messageId:string;chatId:string;kind:'list'|'buttons'|'native'|'template';title?:string;body?:string;footer?:string;options:Array<{id:string;label:string;description?:string}>;receivedAt:number};
export type MenuSelection={optionId:string;label:string;status:'sending'|'confirmed'|'uncertain';ref:string;messageId?:string};
export function validateInteractive(value:unknown):InteractiveMenu|null {
 if(!value || typeof value!=='object')return null;
 const m=value as InteractiveMenu;
 const str=(v:unknown,n:number)=>typeof v==='string' && v.length>0 && v.length<=n && !/[\u0000-\u001f]/.test(v);
 if(m.version!==1 || !str(m.messageId,200) || !str(m.chatId,120) || !/^[^@\s]+@(?:s\.whatsapp\.net|lid)$/.test(m.chatId) || !['list','buttons','native','template'].includes(m.kind) || !Number.isSafeInteger(m.receivedAt) || m.receivedAt<=0 || !Array.isArray(m.options) || !m.options.length || m.options.length>30)return null;
 if(['title','body','footer'].some(k=>m[k as 'title']!==undefined && (typeof m[k as 'title']!=='string' || m[k as 'title']!.length>4000)))return null;
 const options=[];const ids=new Set<string>();
 for(const o of m.options){if(!o || !str(o.id,512) || !str(o.label,200) || ids.has(o.id) || Object.keys(o).some(k=>!['id','label','description'].includes(k)) || o.description!==undefined && (typeof o.description!=='string' || o.description.length>1000))return null;ids.add(o.id);options.push({id:o.id,label:o.label,...(o.description!==undefined?{description:o.description}:{})});}
 return {version:1,messageId:m.messageId,chatId:m.chatId,kind:m.kind,...Object.fromEntries(['title','body','footer'].filter(k=>m[k as 'title']!==undefined).map(k=>[k,m[k as 'title']])),options,receivedAt:m.receivedAt};
}
export function parseInteractive(value:unknown):InteractiveMenu|null {try{return validateInteractive(typeof value==='string'?JSON.parse(value):value);}catch{return null;}}
export function canonicalMenuRef(menu:Pick<InteractiveMenu,'chatId'|'messageId'>):string{return 'menu:'+createHash('sha256').update(menu.chatId+'\u0000'+menu.messageId).digest('hex');}
export function safeMenuOption(menu:InteractiveMenu){
 const matches=menu.options.filter(o=>{const label=o.label.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();return /^(?:falar com (?:um |uma |o |a )?atendente(?: humano)?|atendente(?: humano)?|atendimento humano|recursos humanos|rh|compras)$/.test(label) && !/virtual|clin|consult|agend|pagament|cancel|paciente|exame|urgencia|emergencia/i.test(o.description??'');});
 return matches.length===1?matches[0]:null;
}
export function menuFresh(menu:InteractiveMenu,now=Date.now()){return menu.receivedAt<=now+60000 && now-menu.receivedAt<24*60*60*1000;}
