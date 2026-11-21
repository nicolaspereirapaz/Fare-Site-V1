// Received identifiers only. No text fallback, history recovery, or raw messages persisted.
import {createHash,randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const menuRef=(chatId,messageId)=>'menu:'+createHash('sha256').update(chatId+'\u0000'+messageId).digest('hex');
const str=(v,n)=>typeof v==='string' && v.length>0 && v.length<=n && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v);
const field=(v,n)=>str(v,n) && !/[\x00-\x1f]/.test(v);
const array=v=>Array.isArray(v)?v.slice(0,50):[];
const destination=v=>typeof v==='string' && /^\d{1,32}@(s\.whatsapp\.net|lid)$/.test(v);
const fail=(code,message)=>Object.assign(new Error(message),{statusCode:code});
export function parseMenu(content,{chatId,messageId,receivedAt=Date.now()}) {
 if(!content || !destination(chatId) || !field(messageId,200) || !Number.isFinite(receivedAt))return null;
 const template=content.templateMessage;
 if(template?.interactiveMessageTemplate)content={interactiveMessage:template.interactiveMessageTemplate};
 const menu={version:1,chatId,messageId,receivedAt,kind:'',options:[],transport:{}};
 const add=(id,label,description,transport={})=>{
  if(menu.options.length>=30 || !field(id,512) || !field(label,200) || !label.trim())return;
  if(menu.options.some(o=>o.id===id))throw new Error('DUPLICATE_ID');
  menu.options.push({id,label,...(str(description,1000)?{description}:{})});
  Object.defineProperty(menu.transport,id,{value:transport,enumerable:true});
 };
 const text=(title,body,footer)=>{for(const [key,value] of Object.entries({title,body,footer}))if(str(value,4000))menu[key]=value;};
 const rows=(sections,idKey,transport)=>{for(const s of array(sections))for(const r of array(s?.rows))if(r)add(r[idKey],r.title,r.description,transport);};
 try {
  if(content.listMessage){const m=content.listMessage;menu.kind='list';text(m.title,m.description,m.footerText);rows(m.sections,'rowId');}
  else if(content.buttonsMessage){const m=content.buttonsMessage;menu.kind='buttons';text(undefined,m.contentText,m.footerText);for(const b of array(m.buttons))if(b && (b.type==null || b.type===1))add(b.buttonId,b.buttonText?.displayText);}
  else if(content.templateMessage){const m=template.hydratedTemplate || template.hydratedFourRowTemplate;menu.kind='template';text(m?.hydratedTitleText,m?.hydratedContentText,m?.hydratedFooterText);for(const b of array(m?.hydratedButtons))if(b?.quickReplyButton)add(b.quickReplyButton.id,b.quickReplyButton.displayText,undefined,Number.isInteger(b.index) && b.index>=0 && b.index<=65535?{index:b.index}:{});}
  else if(content.interactiveMessage){const m=content.interactiveMessage;menu.kind='native';text(m.header?.title,m.body?.text,m.footer?.text);for(const b of array(m.nativeFlowMessage?.buttons)){
   if(!['single_select','quick_reply'].includes(b?.name) || !str(b.buttonParamsJson,32000))continue;
   let p;try{p=JSON.parse(b.buttonParamsJson);}catch{continue;}
   if(!p || typeof p!=='object' || Array.isArray(p))continue;
   if(b.name==='single_select')rows(p.sections,'id',{name:b.name});else add(p.id,p.display_text,undefined,{name:b.name});
  }}
 }catch{return null;}
 return menu.options.length?menu:null;
}
export function buildSelectionContent(menu,id){
 const option=menu.options.find(o=>o.id===id);if(!option)throw fail(400,'OPTION');
 const contextInfo={stanzaId:menu.messageId,participant:menu.chatId};
 const transport=menu.transport?.[id];
 switch(menu.kind){
 case 'list':return {listResponseMessage:{title:option.label,...(option.description?{description:option.description}:{}),listType:1,singleSelectReply:{selectedRowId:id},contextInfo}};
 case 'buttons':return {buttonsResponseMessage:{selectedButtonId:id,selectedDisplayText:option.label,type:1,contextInfo}};
 case 'template':return {templateButtonReplyMessage:{selectedId:id,selectedDisplayText:option.label,...(transport?.index!==undefined?{selectedIndex:transport.index}:{}),contextInfo}};
 case 'native':if(!['single_select','quick_reply'].includes(transport?.name))throw fail(400,'UNSUPPORTED_NATIVE');return {interactiveResponseMessage:{body:{text:option.label,format:0},nativeFlowResponseMessage:{name:transport.name,paramsJson:JSON.stringify({id}),version:3},contextInfo}};
 default:throw fail(400,'UNSUPPORTED_MENU');
 }
}
const metadata=({transport,...menu})=>structuredClone(menu);
// This registry is single-process, like the existing serialized delivery ledger.
export function createMenuRegistry({file,now=Date.now,ttlMs=86400000}) {
 if(file instanceof URL)file=fileURLToPath(file);
 const directory=path.dirname(file);
 fs.mkdirSync(directory,{recursive:true,mode:0o700});fs.chmodSync(directory,0o700);
 let menus={};
 try{
  if(fs.statSync(file).size>64*1024*1024)throw new Error('INVALID_MENU_REGISTRY');
  menus=JSON.parse(fs.readFileSync(file,'utf8'));
 }catch(e){if(e.code!=='ENOENT')throw e;}
 if(!menus || Array.isArray(menus) || typeof menus!=='object')throw new Error('INVALID_MENU_REGISTRY');
 for(const [ref,m] of Object.entries(menus)){
  if(!m || m.version!==1 || !destination(m.chatId) || !field(m.messageId,200) || ref!==menuRef(m.chatId,m.messageId)
   || !Number.isFinite(m.receivedAt) || !Array.isArray(m.options) || !m.options.length || m.options.length>30
   || new Set(m.options.map(o=>o.id)).size!==m.options.length)throw new Error('INVALID_MENU_REGISTRY');
  for(const o of m.options){if(!field(o.id,512) || !field(o.label,200))throw new Error('INVALID_MENU_REGISTRY');buildSelectionContent(m,o.id);}
 }
 const persist=next=>{
  const temp=file+'.'+randomUUID()+'.tmp';let fd;
  try{
   fd=fs.openSync(temp,'wx',0o600);fs.writeFileSync(fd,JSON.stringify(next));fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
   fs.renameSync(temp,file);
   if(process.platform!=='win32'){const d=fs.openSync(directory,'r');try{fs.fsyncSync(d);}finally{fs.closeSync(d);}}
  }finally{if(fd!==undefined)fs.closeSync(fd);if(fs.existsSync(temp))fs.unlinkSync(temp);}
 };
 return {
  receive(content,event){
   if(event.historico || event.fromPhone)return null;
   const m=parseMenu(content,{chatId:event.chatId,messageId:event.externalId,receivedAt:now()});if(!m)return null;
   const ref=menuRef(m.chatId,m.messageId),old=menus[ref];
   if(old){
    if(JSON.stringify({...old,receivedAt:0})!==JSON.stringify({...m,receivedAt:0}))throw fail(409,'MENU_COLLISION');
    return metadata(old);
   }
   if(Object.keys(menus).length>=10000)throw fail(503,'MENU_REGISTRY_FULL');
   const next={...menus,[ref]:m};persist(next);menus=next;return metadata(m);
  },
  validate(input){
   const s=input.selection;
   if(!s || !field(s.messageId,200) || !field(s.optionId,512) || !destination(input.chatId))throw fail(400,'SELECTION');
   const ref=menuRef(input.chatId,s.messageId);
   if(input.ref!==ref)throw fail(409,'MENU_REF');
   const m=menus[ref];if(!m)throw fail(400,'MENU_NOT_RECEIVED');
   if(now()-m.receivedAt>ttlMs || now()<m.receivedAt)throw fail(410,'MENU_EXPIRED');
   const o=m.options.find(o=>o.id===s.optionId);if(!o)throw fail(400,'OPTION');
   if(input.text!==o.label)throw fail(400,'OPTION_LABEL');
   return {content:buildSelectionContent(m,o.id)};
  }
 };
}
