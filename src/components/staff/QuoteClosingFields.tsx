"use client";
import { useEffect, useRef } from 'react';
import { brl, moneyInput } from '@/components/staff/quoteEditorShared';
import { paidCents, STAFF_PAYMENT_LABELS, type PaymentForm } from '@/components/staff/paymentFieldsShared';
import { AddressFields } from '@/components/staff/AddressFields';
export type ClosingChoice='half'|'full'|'pickup'|'other'|'zero'|null;
export function QuoteClosingFields({total,value,onChange,choice,onChoice}:{total:number|null;value:PaymentForm;onChange:(value:PaymentForm)=>void;choice:ClosingChoice;onChoice:(choice:ClosingChoice)=>void}){
 const amountRef=useRef<HTMLInputElement>(null);
 useEffect(()=>{if(choice==='other')amountRef.current?.focus();},[choice]);
 const totalCents=total===null?null:Math.round(total*100),half=totalCents===null?null:Math.ceil(totalCents/2);
 const cents=paidCents(value.paid),entered=!!value.paid.trim(),pickup=choice==='pickup';
 const valid=entered&&cents!==null&&totalCents!==null&&cents<=totalCents;
 const active=pickup?'pickup':!entered?choice==='other'?'other':null:valid?cents===half?'half':cents===totalCents?'full':cents>0?'other':null:null;
 const set=<K extends keyof PaymentForm>(key:K,field:PaymentForm[K])=>onChange({...value,[key]:field});
 function choose(next:ClosingChoice,amount:number|null){
  onChoice(next);onChange({...value,paid:amount===null?'':moneyInput(amount/100),...(next==='pickup'?{deliveryMode:'retirada' as const}: {})});
 }
 const status=!entered?'Nenhum recebimento informado.':!valid?'Confira o valor recebido antes de continuar.':pickup?'Pagamento integral na retirada. O pedido segue para Aguardando arte, sem recebimento lançado.':cents===0?'Sem recebimento: o pedido continua aguardando pagamento, sem liberar a arte.':cents===totalCents?'Pagamento integral · nenhum saldo pendente.':`Recebimento parcial · saldo a receber ${value.deliveryMode==='retirada'?'na retirada':'na entrega'}.`;
 return <>
  <section className="cq-total" aria-label="Total do orçamento"><div><strong>Total do orçamento</strong><p>Mesmo valor dos produtos e preços já aprovados</p></div><span>{total===null?'Sob consulta':brl(total)}</span></section>
  <section><h3>Quanto o cliente pagou?</h3><p className="cq-hint">Escolha uma sugestão ou informe o valor recebido.</p>
   <div className="cq-suggestions" aria-label="Sugestões de recebimento">
    <button type="button" aria-pressed={active==='half'} disabled={half===null} onClick={()=>choose('half',half)}><strong>50% de sinal</strong><span>{half===null?'—':brl(half/100)}</span></button>
    <button type="button" aria-pressed={active==='full'} disabled={totalCents===null} onClick={()=>choose('full',totalCents)}><strong>Valor total</strong><span>{total===null?'—':brl(total)}</span></button>
    <button type="button" aria-pressed={pickup} disabled={totalCents===null} onClick={()=>choose('pickup',0)}><strong>Total na retirada</strong><span>{total===null?'—':`${brl(total)} ao retirar`}</span></button>
    <button type="button" aria-pressed={active==='other'} disabled={totalCents===null} onClick={()=>choose('other',null)}><strong>Outro valor</strong><span>Digitar recebimento</span></button>
   </div>
   <div className="cq-grid"><label className="cq-field"><span>Valor recebido agora</span><div className="cq-money"><b aria-hidden="true">R$</b><input ref={amountRef} aria-label="Valor recebido agora" inputMode="decimal" autoComplete="off" placeholder="0,00" value={value.paid} disabled={pickup||totalCents===null} aria-invalid={entered&&!valid} onChange={event=>set('paid',event.target.value)}/></div></label>
    {!pickup?<label className="cq-field"><span>Forma de pagamento</span><select value={value.paymentMethod} onChange={event=>set('paymentMethod',event.target.value as PaymentForm['paymentMethod'])}>{Object.entries(STAFF_PAYMENT_LABELS).map(([method,label])=><option value={method} key={method}>{label}</option>)}</select></label>:null}
    {!pickup&&(cents??0)>0?<label className="cq-field"><span>Data do pagamento</span><input type="date" value={value.paidAt} onChange={event=>set('paidAt',event.target.value)}/></label>:null}
    {!pickup&&value.paymentMethod==='cartao_credito'?<label className="cq-field"><span>Parcelas</span><select value={value.installments} onChange={event=>set('installments',event.target.value)}>{Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{i+1}×</option>)}</select></label>:null}
    {!pickup&&['boleto','faturamento_empresa'].includes(value.paymentMethod)?<label className="cq-field"><span>Vencimento</span><input type="date" value={value.dueDate} onChange={event=>set('dueDate',event.target.value)}/></label>:null}
   </div>
   <button className="cq-zero" type="button" disabled={totalCents===null} onClick={()=>choose('zero',0)}>Ainda não houve pagamento</button>
   <div className={`cq-balance${valid&&cents===totalCents?' is-paid':''}`} aria-label="Resumo do recebimento" aria-live="polite"><div><span>Recebido agora</span><strong>{valid?brl(cents/100):'—'}</strong></div><div><span>Saldo restante</span><strong>{valid?brl((totalCents-cents)/100):'—'}</strong></div></div>
   <p className={`cq-state${pickup?' is-pickup':''}`} role="status">{status}</p>
  </section>
  <section className="cq-delivery"><h3>Entrega</h3><div className="cq-grid"><label className="cq-field"><span>Data prevista de entrega</span><input type="date" value={value.deliveryDate} onChange={event=>set('deliveryDate',event.target.value)}/></label><label className="cq-field"><span>Horário (opcional)</span><input type="time" value={value.deliveryTime} onChange={event=>set('deliveryTime',event.target.value)}/></label><label className="cq-field"><span>Forma de entrega</span><select value={pickup?'retirada':value.deliveryMode} disabled={pickup} onChange={event=>set('deliveryMode',event.target.value as PaymentForm['deliveryMode'])}><option value="retirada">Retirada na loja</option><option value="entrega">Entrega ao cliente</option></select></label></div>
   {!pickup&&value.deliveryMode==='entrega'?<AddressFields hint="Só para este pedido. Em branco: usa o endereço do cadastro do cliente." value={value.deliveryAddress} onChange={update=>onChange({...value,deliveryAddress:update(value.deliveryAddress)})}/>:null}
  </section>
 </>;
}
