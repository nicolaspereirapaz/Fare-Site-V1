"use client";
import { useCallback, useRef, useState } from 'react';
import { DetailsDialog } from '@/components/backofficeShared';
import { QuoteClosingFields, type ClosingChoice } from '@/components/staff/QuoteClosingFields';
import '@/components/staff/closeQuote.css';
import { EMPTY_PAYMENT_FORM, paidCents, paymentFormError, todayInBrazil, type PaymentForm } from '@/components/staff/paymentFieldsShared';
import type { BackofficeQuoteSummary } from '@/lib/backoffice/quotesAccess';

type QuoteToClose = Pick<BackofficeQuoteSummary,'id'|'code'|'customerName'|'total'|'updatedAt'>;
export type ClosedOrder = {id:string;code:string;status:string};
export function CloseQuoteDialog({quote,onClose,onClosed}:{quote:QuoteToClose;onClose:()=>void;onClosed:(order:ClosedOrder)=>void}) {
  const [form,setForm]=useState<PaymentForm>(()=>({...EMPTY_PAYMENT_FORM,paid:'',paidAt:todayInBrazil()}));
  const [choice,setChoice]=useState<ClosingChoice>(null);
  const [busy,setBusy]=useState(false);const [pending,setPending]=useState(false);const [error,setError]=useState('');
  const [confirmed,setConfirmed]=useState<ClosedOrder|null>(null);
  const submission=useRef<object|null>(null);const inFlight=useRef(false);
  const safeClose=useCallback(()=>{if(!inFlight.current&&!submission.current)onClose();},[onClose]);
  const formError=form.paid.trim()&&quote.total!==null?paymentFormError(form,Math.round(quote.total*100)):null;
  const canSubmit=pending||(quote.total!==null&&!!form.paid.trim()&&!formError);
  async function save(){
    if(inFlight.current||confirmed)return;
    if(!submission.current){
      if(quote.total===null)return setError('Há itens sem preço. Edite o orçamento antes de fechar.');
      if(!form.paid.trim())return setError('Escolha uma sugestão ou informe o valor recebido.');
      const invalid=paymentFormError(form,Math.round(quote.total*100));if(invalid)return setError(invalid);
      const amountCents=paidCents(form.paid)!;
      const pickup=choice==='pickup';
      submission.current={idempotencyKey:crypto.randomUUID(),expectedUpdatedAt:quote.updatedAt,paymentMethod:pickup?'pix':form.paymentMethod,paymentOnPickup:pickup,
        payment:{amountCents,paidAt:amountCents>0?form.paidAt:null},
        installments:!pickup&&form.paymentMethod==='cartao_credito'?Number(form.installments):null,
        dueDate:!pickup&&['boleto','faturamento_empresa'].includes(form.paymentMethod)?form.dueDate||null:null,
        deliveryDate:form.deliveryDate||null,deliveryTime:form.deliveryDate&&form.deliveryTime?form.deliveryTime:null,deliveryMode:pickup?'retirada':form.deliveryMode};
      setPending(true);
    }
    inFlight.current=true;setBusy(true);setError('');
    try{
      const response=await fetch(`/api/backoffice/quotes/${quote.id}/fechar`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(submission.current)});
      const payload=await response.json() as {order?:ClosedOrder;message?:string;error?:string};
      if(!response.ok){
        if(response.status>=400&&response.status<500){submission.current=null;setPending(false);}
        throw new Error(payload.message??'Não foi possível fechar o orçamento. Atualize os dados e tente novamente.');
      }
      if(!payload.order?.id||!payload.order.code)throw new Error('Resposta incompleta. Tente confirmar novamente os mesmos dados.');
      submission.current=null;setPending(false);setConfirmed(payload.order);
      onClosed(payload.order);
    }catch(caught){setError(submission.current?'Resposta não confirmada. Reenvie os mesmos dados para confirmar, sem duplicar o pedido.':caught instanceof Error?caught.message:'Não foi possível fechar.');}
    finally{setBusy(false);inFlight.current=false;}
  }
  return <DetailsDialog className="cq-dialog" title="Fechar Orçamento" code={quote.code} subtitle={quote.customerName} status="Aguardando pagamento" statusColor={{bg:'#fbf0dc',fg:'#7a4f0d'}} onClose={safeClose}
    footer={<><span className="cq-caption">Os produtos, gravações e preços serão preservados.</span><div className="cq-actions"><button className="cq-cancel" type="button" disabled={busy||pending} onClick={safeClose}>Cancelar</button>{confirmed?<a className="cq-confirm" href={`/equipe/pedidos/${confirmed.id}`}>Abrir {confirmed.code}</a>:<button className="cq-confirm" type="button" disabled={busy||!canSubmit} onClick={save}>{busy?'Confirmando…':pending?'Confirmar novamente':choice==='pickup'?'Confirmar · pagar na retirada':form.paid.trim()&&paidCents(form.paid)===0?'Criar aguardando pagamento':'Confirmar e gerar pedido'}</button>}</div></>}>
    <p className="cq-intro">Confira o pagamento e a entrega para gerar o pedido.</p>
    <fieldset className="cq-fields" disabled={busy||pending||!!confirmed}><QuoteClosingFields total={quote.total} value={form} onChange={value=>{setForm(value);setError('');}} choice={choice} onChoice={setChoice}/></fieldset>
    {quote.total===null?<p className="qe-error" role="alert">Há itens sem preço. Edite o orçamento antes de fechar.</p>:null}
    {confirmed?<p role="status">Pedido {confirmed.code} confirmado.</p>:null}
    {error||formError?<p className="qe-error" role="alert">{error||formError}</p>:null}
  </DetailsDialog>;
}
