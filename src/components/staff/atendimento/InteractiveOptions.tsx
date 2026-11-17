"use client";
import { useEffect, useRef, useState } from 'react';
import type { Message } from '@/lib/atendimento/types';
export function InteractiveOptions({message,stale=false}:{message:Message;stale?:boolean}){
 const [local,setLocal]=useState<Message['menuSelection']>(null),[error,setError]=useState('');const lock=useRef(false);
 const [now,setNow]=useState(Date.now);const hasMenu=Boolean(message.interactive && message.author==='cliente');
 useEffect(()=>{if(!hasMenu)return;const timer=setInterval(()=>setNow(Date.now()),30000);return ()=>clearInterval(timer);},[hasMenu]);
 const menu=message.interactive;if(!menu || message.author!=='cliente')return null;
 const state=message.menuSelection??local;
 const expired=now-menu.receivedAt>=86400000 || menu.receivedAt>now+60000;
 async function select(optionId:string){
  if(lock.current || state || expired || stale)return;lock.current=true;setLocal({optionId,label:menu!.options.find(o=>o.id===optionId)!.label,status:'sending',ref:''});
  try{
   const response=await fetch(`/api/atendimento/conversas/${encodeURIComponent(message.conversationId)}/menu`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({messageId:message.id,optionId})});
   const data=await response.json();if(!response.ok)throw new Error(data.message??'Seleção não confirmada. Atualize e confira no WhatsApp.');setLocal(data.message.menuSelection);
  }catch(e){setLocal(s=>s?{...s,status:'uncertain'}:s);setError(e instanceof Error?e.message:'Envio incerto; não repita.');}
 }
 return <div className="at-interactive-options" aria-label="Opções do WhatsApp">
  {menu.title?<strong>{menu.title}</strong>:null}
  {menu.options.map(option=><button type="button" key={option.id} disabled={Boolean(state)||expired||stale} onClick={()=>void select(option.id)} style={{display:'block',width:'100%',padding:'9px 12px',marginTop:6,border:'1px solid currentColor',borderRadius:8,textAlign:'left',opacity:state||expired||stale?0.6:1}}>{option.label}{option.description?<small style={{display:'block'}}>{option.description}</small>:null}</button>)}
  {menu.footer?<small>{menu.footer}</small>:null}
  {state?<p role="status">{state.status==='confirmed'?`Selecionado: ${state.label}`:state.status==='sending'?'Enviando seleção…':`Envio incerto: ${state.label}. Não repita; confira no WhatsApp.`}</p>:expired||stale?<small>Menu expirado ou substituído.</small>:null}
  {error?<p role="alert">{error}</p>:null}
 </div>;
}
