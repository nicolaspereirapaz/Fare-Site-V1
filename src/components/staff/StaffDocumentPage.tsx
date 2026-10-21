"use client";
import { paymentPlan } from '@/lib/orders/paymentPlan';
import type { OrderFinance } from '@/lib/orders/payments';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Download, PencilLine, Printer, RefreshCw, RotateCcw, Upload } from 'lucide-react';
import { brl, moneyInput } from '@/components/staff/quoteEditorShared';
import { billingDocument, formatDate, messageFor, StageSelect } from '@/components/backofficeShared';
import { STATUS_LABELS, STATUS_COLORS } from '@/components/BackofficeBoard';
import { CloseQuoteDialog } from '@/components/staff/CloseQuoteDialog';
import { PhotoLinkActions } from "@/components/staff/PhotoLinkActions";
import { photoFromName } from "@/components/staff/photoItems";
import { ProposalActions } from '@/components/staff/ProposalActions';
import { OrderPaymentPanel } from '@/components/staff/OrderPaymentPanel';
import { dateLabel, deliveryLabel, STAFF_PAYMENT_LABELS } from '@/components/staff/paymentFieldsShared';
import { canTransitionQuote, QUOTE_BOARD_COLUMNS, QUOTE_STATUS_LABELS, type QuoteStatus } from '@/lib/quotes/quoteCode';
import { COLUNAS_QUADRO_PEDIDOS, podeTransicionarStatusPedido, type StatusPedido } from '@/lib/backoffice/orderStatus';
import { movePath, reachableColumns } from '@/lib/backoffice/boardMoves';
import { formatBillingAddress } from '@/lib/commerce';
import type { DocumentItem, ProductCatalogInfo, StaffDocument } from '@/lib/backoffice/documentDetails';

function Field({label,children,numeric=false,wide=false}:{label:string;children:ReactNode;numeric?:boolean;wide?:boolean}){
 return <div className={`qe-field${wide?' qe-mspan-2':''}`}><span>{label}</span><div className={`qe-ro${numeric?' qe-num':''}`}>{children}</div></div>;
}
const dimension=(value:unknown)=>value===undefined||value===null?'—':String(value).replace('.',',');
const TECHNIQUES:Record<string,string>={laser:'Laser','dtf-textil':'DTF Têxtil','dtf-uv':'DTF UV',manual:'Outra (custo digitado)'};
/** Só as medidas do produto (e a área de gravação do fornecedor); a descrição vai na proposta e no site. */
function ProductCatalogDetails({info}:{info?:ProductCatalogInfo|null}) {
 if(!info||(!info.printingAreas.length&&!info.specs?.length))return null;
 return <section className="sd-product-info">
  {info.specs?.length?<dl className="sd-product-specs">{info.specs.map(spec=><div key={spec.label}><dt>{spec.label}</dt><dd>{spec.value}</dd></div>)}</dl>:null}
  {info.printingAreas.length?<dl>{info.printingAreas.map((entry,index)=><div key={index}><dt>Área de gravação</dt><dd>{entry.area}<small>{[entry.technique,entry.location].filter(Boolean).join(' · ')}</small></dd></div>)}</dl>:null}
 </section>;
}
type MockupProps={kind:StaffDocument['kind'];docId:string;canEdit:boolean;onChanged:()=>Promise<void>};
/** Baixar a foto do produto para montar o mockup e enviar o mockup pronto (vira a foto do item nos PDFs). */
function MockupActions({item,kind,docId,canEdit,onChanged}:MockupProps&{item:DocumentItem}){
 const input=useRef<HTMLInputElement>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const target={kind,id:docId,item:item.id};
 async function send(init:RequestInit){
  setBusy(true);setError('');
  try{const r=await fetch('/api/backoffice/mockups',init);const p=await r.json().catch(()=>({}));if(!r.ok)throw new Error(p.message??messageFor(p.error));await onChanged();}
  catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar o mockup.');}finally{setBusy(false);}
 }
 function upload(file:File|undefined){
  if(!file)return;const form=new FormData();Object.entries(target).forEach(([key,value])=>form.set(key,value));form.set('file',file);
  void send({method:'POST',body:form});
 }
 return <div className="sd-mockup">
  {item.mockup?<span className="sd-mockup-tag">Mockup do item</span>:null}
  <div className="sd-mockup-buttons">
   <a className="kb-secondary" aria-label="Baixar foto do produto" title="Baixar foto do produto" download href={`/api/backoffice/mockups/foto-produto?${new URLSearchParams(target)}`}><Download aria-hidden="true" size={17}/></a>
   {canEdit?<>
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e=>{upload(e.target.files?.[0]);e.target.value='';}}/>
    <button className="kb-secondary" type="button" aria-label={item.mockup?'Trocar mockup':'Enviar mockup'} title={item.mockup?'Trocar mockup':'Enviar mockup'} disabled={busy} onClick={()=>input.current?.click()}>{busy?<RefreshCw aria-hidden="true" className="sd-spin" size={17}/>:<Upload aria-hidden="true" size={17}/>}</button>
    {item.mockup?<button className="kb-secondary" type="button" aria-label="Voltar à foto do catálogo" title="Voltar à foto do catálogo" disabled={busy} onClick={()=>send({method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify(target)})}><RotateCcw aria-hidden="true" size={17}/></button>:null}
   </>:null}
  </div>
  {error?<p className="qe-error" role="alert">{error}</p>:null}
 </div>;
}
/** A consulta usa SOMENTE os snapshots persistidos, com campos e unidades do ProductConfigModal. */
export function ProductSnapshot({item,index,mockup}:{item:DocumentItem;index:number;mockup?:MockupProps}){
 const cost=item.costing;
 const photo=Boolean(photoFromName(item.productName));
 const gs=cost?.gravacoes?(cost.gravacoes.length?cost.gravacoes:null):cost&&cost.tecnica?.tipo!=='nenhuma'?[{tecnica:cost.tecnica,local:item.gravacoes?.[0]?.local??'',descricao:item.gravacoes?.[0]?.descricao??cost.personalizacao??'',detalhe:cost.detalhe,custoUnitario:cost.personalizacaoUnitaria,custoTotal:cost.custoPersonalizacaoTotal}]:null;
 const total=item.unitPrice===null?null:Math.round(item.unitPrice*item.quantity*100)/100;
 // Foto é feita na loja: sem frete de fornecedor (itens antigos podem ter gravado R$ 100).
 const totalCost=cost?Math.round((cost.custoProduto*item.quantity+cost.custoPersonalizacaoTotal+(photo?0:cost.freteFornecedor))*100)/100:null;
 const margin=total!==null&&totalCost!==null?Math.round((total-totalCost)*100)/100:null;
 return <section className="qe-card config-sheet" aria-label={`Item ${index+1}`}>
  <div className="config-layout"><div>
   <section className="qe-msec"><h3>Produto</h3><div className="qe-mbox">
    <div className="qe-mgrid"><Field label="Produto" wide><b>{item.productName}</b>{item.codes?<small>{item.codes.fare} · {item.codes.supplier.toUpperCase()} {item.codes.supplierCode}</small>:null}</Field>{photo?<Field label="Papel">{item.selections['Papel']||'Cliente escolhe no link'}</Field>:<Field label="Cor">{item.selections['Variação']||'—'}</Field>}</div>
    <div className="qe-mgrid"><Field label="Quantidade">{item.quantity}</Field><Field label={photo?'Custo por foto (R$)':'Custo por peça (R$)'} numeric>{cost?moneyInput(cost.custoProduto):'—'}</Field><Field label={photo?'Custo total':'Custo total do produto'} numeric>{cost?brl(cost.custoProduto*item.quantity):'—'}</Field></div>
    {Object.entries(item.selections).filter(([key])=>key!=='Variação'&&!(photo&&key==='Papel')).length?<dl className="sd-extra-selections">{Object.entries(item.selections).filter(([key])=>key!=='Variação'&&!(photo&&key==='Papel')).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>:null}
   </div></section>
   {photo?null:<section className="qe-msec"><h3>Gravação</h3>{gs?gs.map((g,i)=><div className="qe-mbox qe-ebox" key={i}>
    <div className="qe-ebox-head"><b>Gravação {i+1}</b></div><div className="qe-mgrid">
     <Field label="Técnica">{TECHNIQUES[g.tecnica.tipo]??g.descricao??g.tecnica.tipo}</Field><Field label="Local">{g.local||'—'}</Field>
     {['dtf-textil','dtf-uv'].includes(g.tecnica.tipo)?<><Field label="Largura (cm)">{dimension(g.tecnica.larguraCm)}</Field><Field label="Altura (cm)">{dimension(g.tecnica.alturaCm)}</Field></>:null}
     {g.tecnica.tipo==='manual'?<Field label="Nome">{String(g.tecnica.nome??g.descricao)}</Field>:null}
    </div><div className="qe-ebox-foot"><span className="qe-fhint">{g.detalhe&&!/por peça|digitado/.test(g.detalhe)?`${g.detalhe} · `:''}{brl(g.custoTotal)} no total</span><div className="qe-cost"><span>Custo/peça R$</span><div className="qe-ro qe-num">{moneyInput(g.custoUnitario)}</div></div></div>
   </div>):item.gravacoes?.length?item.gravacoes.map((g,i)=><div className="qe-mbox" key={i}><div className="qe-mgrid"><Field label="Técnica">{g.descricao}</Field><Field label="Local">{g.local||'—'}</Field></div></div>):<p className="sd-muted">Nenhuma gravação registrada.</p>}</section>}
   <section className="qe-msec"><h3>Preço de venda</h3><div className="qe-mbox"><div className="qe-mgrid">
    <Field label={photo?'Preço por foto (R$)':'Preço por peça (R$)'} numeric>{item.unitPrice===null?'Sob consulta':moneyInput(item.unitPrice)}</Field><Field label="Custo total do item" numeric>{totalCost===null?'—':brl(totalCost)}</Field><Field label="Margem do item" numeric>{margin===null?'—':`${brl(margin)} · ${total&&total>0?Math.round(margin/total*100):0}%`}</Field>
   </div></div></section>
  </div><aside className="config-product-image"><div className="photo">
   {/* eslint-disable-next-line @next/next/no-img-element */}
   {item.imageUrl?<img src={item.imageUrl} alt={item.productName}/>:<span>Produto sem foto</span>}
   </div>{mockup?<MockupActions item={item} {...mockup}/>:null}<p className="config-product-name">{item.productName}</p><p className="product-code">{[item.codes?.fare,item.selections['Variação']].filter(Boolean).join(' · ')}</p><ProductCatalogDetails info={item.catalogInfo}/></aside></div>
  <div className="item-total"><span>Preço unit. <strong>{item.unitPrice===null?'Sob consulta':brl(item.unitPrice)}</strong></span><span>Total <strong>{total===null?'Sob consulta':brl(total)}</strong></span></div>
 </section>;
}

/** Cada pagamento e o que falta (pagamento em partes). */
function PaymentPlanList({finance}:{finance:OrderFinance}){
 const plan=paymentPlan(finance);
 if(!plan.receipts.length&&!plan.remainder)return null;
 return <ul className="sd-payment-plan">{plan.receipts.map((r,i)=><li key={i}><span>Pago {r.label}</span><strong>{r.amount}</strong></li>)}{plan.remainder?<li className="sd-payment-due"><span>{plan.remainder.label}</span><strong>{plan.remainder.amount}</strong></li>:null}</ul>;
}

export function StaffDocumentPage({kind,id,canCancel}:{kind:StaffDocument['kind'];id:string;canCancel:boolean}){
 const router=useRouter();const [document,setDocument]=useState<StaffDocument|null>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [closing,setClosing]=useState(false);const [copied,setCopied]=useState(false);
 const isQuote=kind==='quote';const base=isQuote?`/api/backoffice/quotes/${id}`:`/api/backoffice/orders/${id}`;
 const load=useCallback(async()=>{const response=await fetch(base,{cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(messageFor(data.error));if(!data.document)throw new Error('Documento incompleto.');return data.document as StaffDocument;},[base]);
 useEffect(()=>{let active=true;load().then(d=>{if(active){setDocument(d);setError('');}}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Não foi possível abrir.');});return()=>{active=false;};},[load]);
 const reload=useCallback(async()=>{setDocument(await load());},[load]);
 async function changeStatus(next:string){
  if(!document||busy)return;
  if(['cancelado','encerrado'].includes(next)&&!window.confirm(`Deseja ${isQuote?'encerrar o orçamento':'cancelar o pedido'} ${document.code}?`))return;
  const path=isQuote&&QUOTE_BOARD_COLUMNS.includes(next as typeof QUOTE_BOARD_COLUMNS[number])&&QUOTE_BOARD_COLUMNS.includes(document.status as typeof QUOTE_BOARD_COLUMNS[number])
   ?movePath(QUOTE_BOARD_COLUMNS,document.status as typeof QUOTE_BOARD_COLUMNS[number],next as typeof QUOTE_BOARD_COLUMNS[number],canTransitionQuote)
   :!isQuote&&COLUNAS_QUADRO_PEDIDOS.includes(next as typeof COLUNAS_QUADRO_PEDIDOS[number])&&COLUNAS_QUADRO_PEDIDOS.includes(document.status as typeof COLUNAS_QUADRO_PEDIDOS[number])
   ?movePath(COLUNAS_QUADRO_PEDIDOS,document.status as typeof COLUNAS_QUADRO_PEDIDOS[number],next as typeof COLUNAS_QUADRO_PEDIDOS[number],podeTransicionarStatusPedido):[next];
  if(!path)return setError('Transição não permitida.');setBusy(true);setError('');
  try{for(const status of path){const r=await fetch(base,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})});const p=await r.json();if(!r.ok)throw new Error(p.message??messageFor(p.error));}await reload();}
  catch(e){setError(e instanceof Error?e.message:'Não foi possível alterar.');await reload().catch(()=>undefined);}finally{setBusy(false);}
 }
 const back=isQuote?'/equipe?aba=orcamentos':'/equipe';
 if(!document)return <div className="sd-page"><Link className="sd-back" href={back}><ArrowLeft size={15}/> Voltar ao quadro</Link><p role={error?'alert':'status'}>{error||'Carregando documento…'}</p></div>;
 const finance=document.finance;const billing=document.customer.billing;const quoteStatus=document.status as QuoteStatus;const orderStatus=document.status as StatusPedido;
 const statusLabel=isQuote?QUOTE_STATUS_LABELS[quoteStatus]:STATUS_LABELS[orderStatus];const color=isQuote?undefined:STATUS_COLORS[orderStatus];
 const openQuote=isQuote&&QUOTE_BOARD_COLUMNS.includes(quoteStatus as typeof QUOTE_BOARD_COLUMNS[number]);
 // Pedido: itens editáveis até concluir ou cancelar (mesma regra do servidor).
 const editableOrder=!isQuote&&!['concluido','cancelado'].includes(orderStatus);
 return <div className="sd-page">
  <Link className="sd-back" href={back}><ArrowLeft size={15}/> Voltar ao quadro</Link>
  <header className="sd-heading"><div><h1>{document.code}</h1><p>{isQuote?'Orçamento':'Pedido'} de {formatDate(document.createdAt)}{document.createdBy?` · feito por ${document.createdBy}`:''}</p></div><div><span className="sd-status" style={color?{background:color.bg,color:color.fg}:undefined}>{statusLabel??document.status}</span>{openQuote?<Link className="sd-edit-top" href={`/equipe/orcamentos/${id}`}><PencilLine aria-hidden="true" size={15}/> Editar orçamento</Link>:editableOrder?<Link className="sd-edit-top" href={`/equipe/pedidos/${id}/editar`}><PencilLine aria-hidden="true" size={15}/> Editar pedido</Link>:<small>{isQuote?'Orçamento fechado · somente consulta':'Pedido encerrado · somente consulta'}</small>}</div></header>
  {error?<p className="qe-error" role="alert">{error}</p>:null}
  <div className="sd-layout"><div className="sd-main">
   {document.items.map((item,index)=><ProductSnapshot key={item.id||index} item={item} index={index} mockup={{kind,docId:id,canEdit:openQuote||editableOrder,onChanged:reload}}/>)}
   {(document.customer.notes||document.internalNotes)?<section className="qe-card"><h2>Observações</h2>{document.customer.notes?<p>{document.customer.notes}</p>:null}{document.internalNotes?<div><h3>Observações internas</h3><p>{document.internalNotes}</p></div>:null}</section>:null}
   {!isQuote?<section className="qe-card"><h2>Histórico</h2><ol className="kb-history">{[...document.history].reverse().map((entry,i)=><li key={i}><strong>{STATUS_LABELS[entry.status]}</strong><span>{formatDate(entry.at)} · {entry.by}</span></li>)}<li><strong>Pedido criado</strong><span>{formatDate(document.createdAt)}{document.createdBy?` · ${document.createdBy}`:''}</span></li></ol></section>:null}
  </div><aside className="sd-side">
   {!isQuote?<section className="qe-card"><h2>Entrega</h2><p className="sd-delivery-date">{deliveryLabel(finance?.deliveryDate, finance?.deliveryTime)}</p><p className="sd-muted">{finance?finance.deliveryMode==='retirada'?'Retirada na loja':'Entrega ao cliente':'Forma de entrega não informada'}</p></section>:null}
   <section className="qe-card financial"><h2>{isQuote?'Resumo do orçamento':'Pagamento'}</h2><dl>
    {document.discount?<><div><dt>Subtotal</dt><dd>{document.total===null?'Sob consulta':brl(document.total+document.discount.amount)}</dd></div><div><dt>{document.discount.label}</dt><dd>− {brl(document.discount.amount)}</dd></div></>:null}
    <div><dt>Total</dt><dd>{document.total===null?'Sob consulta':brl(document.total)}</dd></div>
    {isQuote&&document.total!==null?<div className="balance-row"><dt>Sinal mínimo (50%)</dt><dd>{brl(Math.ceil(Math.round(document.total*100)/2)/100)}</dd></div>:null}
    {!isQuote&&finance?<><div><dt>Recebido</dt><dd>{brl(finance.paidCents/100)}</dd></div><div className="balance-row"><dt>{finance.balanceCents>0?'Saldo a receber':'Quitado'}</dt><dd>{brl(finance.balanceCents/100)}</dd></div></>:null}
   </dl>
   {isQuote?<div className="sd-pix"><p className="sd-muted">Pix · chave CNPJ</p><div><span>50.344.377/0001-36</span><button className="kb-secondary" type="button" onClick={async()=>{try{await navigator.clipboard.writeText('50.344.377/0001-36');setCopied(true);}catch{setError('Não foi possível copiar automaticamente. Selecione a chave para copiar.');}}}>Copiar chave</button></div>{copied?<small role="status">Chave Pix copiada.</small>:null}</div>:<><p className="sd-muted sd-method">{finance?.paymentOnPickup?(finance.paidCents===0?'Pagamento integral na retirada · forma a definir':[...new Set(finance.payments.map(receipt=>STAFF_PAYMENT_LABELS[receipt.paymentMethod]))].join(' + ')):document.paymentMethod?STAFF_PAYMENT_LABELS[document.paymentMethod]:''}{finance?.installments?` · ${finance.installments}×`:''}{finance?.dueDate?` · vence ${dateLabel(finance.dueDate)}`:''}</p>{finance?<><OrderPaymentPanel compact orderId={id} status={orderStatus} paymentMethod={document.paymentMethod!} finance={finance} onRecorded={reload}/><PaymentPlanList finance={finance}/></>:<p className="sd-muted">Recebimentos não registrados para este pedido.</p>}</>}
   </section>
   <section className="qe-card sd-document-actions"><ProposalActions {...(isQuote?{quoteId:id,sentAt:document.proposalSentAt}:{orderId:id})} blocked={isQuote&&!openQuote?'Este orçamento já foi fechado.':document.items.some(i=>i.unitPrice===null)?'Há item sem preço. Edite o orçamento antes de gerar o documento.':null} onSent={reload}/>{isQuote?null:<a className="kb-secondary sd-comanda" download href={`/api/backoffice/orders/${id}/comanda`}><Printer aria-hidden="true" size={15}/> Baixar comanda</a>}</section>
   {document.items.some(i=>photoFromName(i.productName))&&(isQuote?openQuote:!['cancelado','concluido'].includes(orderStatus))?<section className="qe-card sd-document-actions"><PhotoLinkActions kind={isQuote?'quote':'order'} id={id}/></section>:null}
   <section className="qe-card"><h2>Cliente</h2><p className="sd-customer">{document.customer.company||document.customer.name}</p><p className="sd-muted">{document.customer.company?<>{document.customer.name}<br/></>:null}{document.customer.phone||'Telefone não informado'}</p>
   {billing?<details className="sd-billing"><summary>Dados de faturamento</summary><p>{billingDocument(billing)}<br/>{billing.companyName}<br/>{formatBillingAddress(billing.address)}</p></details>:null}</section>
   <section className="qe-card sd-flow"><h2>Andamento</h2>
    {openQuote?<><StageSelect value={quoteStatus} options={reachableColumns(QUOTE_BOARD_COLUMNS,quoteStatus as typeof QUOTE_BOARD_COLUMNS[number],canTransitionQuote)} labels={QUOTE_STATUS_LABELS} busy={busy} onChange={changeStatus}/><Link className="kb-secondary" href={`/equipe/orcamentos/${id}`}>Editar orçamento</Link>{quoteStatus==='aguardando_pagamento'?<button className="kb-close-quote" type="button" onClick={()=>setClosing(true)}>Fechar Orçamento</button>:null}<button className="kb-danger" type="button" disabled={busy} onClick={()=>changeStatus('encerrado')}>Encerrar orçamento</button></>:!isQuote?<>
     {COLUNAS_QUADRO_PEDIDOS.includes(orderStatus as typeof COLUNAS_QUADRO_PEDIDOS[number])?<StageSelect value={orderStatus} options={reachableColumns(COLUNAS_QUADRO_PEDIDOS,orderStatus as typeof COLUNAS_QUADRO_PEDIDOS[number],podeTransicionarStatusPedido)} labels={STATUS_LABELS} busy={busy} onChange={changeStatus}/>:null}
     {editableOrder?<Link className="kb-secondary" href={`/equipe/pedidos/${id}/editar`}>Editar pedido</Link>:null}
     {orderStatus==='aguardando_pagamento'&&!finance?<button className="kb-secondary" disabled={busy} onClick={()=>changeStatus('aguardando_arte')} type="button">Pagamento recebido</button>:null}
     {podeTransicionarStatusPedido(orderStatus,'concluido')?<button className="kb-final" type="button" disabled={busy} onClick={()=>changeStatus('concluido')}>Finalizar pedido</button>:null}
     {canCancel&&podeTransicionarStatusPedido(orderStatus,'cancelado')?<button className="kb-danger" type="button" disabled={busy} onClick={()=>changeStatus('cancelado')}>Cancelar pedido</button>:null}
    </>:document.orderId?<Link className="kb-secondary" href={`/equipe/pedidos/${document.orderId}`}>Ver pedido gerado</Link>:<p className="sd-muted">Orçamento encerrado.</p>}
    <button className="sd-refresh" disabled={busy} onClick={()=>reload().catch(e=>setError(e.message))} type="button"><RefreshCw size={13}/> Atualizar dados</button>
   </section>
  </aside></div>
  {closing?<CloseQuoteDialog quote={{id,code:document.code,customerName:document.customer.name,total:document.total,updatedAt:document.updatedAt}} onClose={()=>setClosing(false)} onClosed={order=>router.push(`/equipe?aba=${order.status==='aguardando_pagamento'?'orcamentos':'pedidos'}&novo=${order.id}`)}/>:null}
 </div>;
}
