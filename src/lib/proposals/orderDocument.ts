import { formatDeliveryAddress } from "@/lib/customers/address";
import { paymentPlan } from "@/lib/orders/paymentPlan";
import { buildWhatsAppUrl, formatBillingAddress, type QuoteCartItem } from "@/lib/commerce";
import { orderCode } from "@/lib/orders/orderCode";
import type { Order } from "@/lib/orders/repository";
import type { OrderFinance } from "@/lib/orders/payments";
import { applyDiscount, discountLabel } from "@/lib/quotes/discount";
import { photoDocumentLines } from "@/components/staff/photoItems";
import { NO_CUSTOMER_NAME } from "@/lib/quotes/quoteCode";
import { brl, FARE_COMPANY, productDetails, type ProductDetails, type Proposal, type ProposalItem } from "./proposal";

/** Documento de pedido, não uma proposta convertida: sem validade, sinal ou aprovação. */
export type OrderDocument = Omit<Proposal, "validUntil" | "notice" | "minimumDeposit" | "pixKey"> & {
  kind: "order";
  finance: { paid: number; balance: number; plan: ReturnType<typeof paymentPlan> } | null;
};
const date = (value: string) => new Intl.DateTimeFormat("pt-BR", {timeZone:"America/Sao_Paulo"}).format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value));
const paymentLabels: Record<Order["paymentMethod"], string> = {pix:"Pix",dinheiro:"Dinheiro",cartao_credito:"Cartão de crédito",cartao_debito:"Cartão de débito",boleto:"Boleto",faturamento_empresa:"Faturamento empresa"};
export function buildOrderDocument(order: Order, finance: OrderFinance | null, options: {seller:string;siteUrl:string;imageOf?:(item:QuoteCartItem)=>string|null;detailsOf?:(item:QuoteCartItem)=>ProductDetails|null}): OrderDocument {
  if (!order.items.length) throw new Error("O pedido não tem itens.");
  if (order.items.some(item => item.unitPrice === null || !Number.isFinite(item.unitPrice) || item.unitPrice < 0)) throw new Error("O pedido tem item sem preço.");
  const items = order.items.map((item):ProposalItem=>{const photo=photoDocumentLines(item);return {
    name:photo?.name??item.productName,url:item.slug.startsWith("brindes/")?`${options.siteUrl.replace(/\/+$/,"")}/${item.slug}`:null,
    code:item.codes?.fare||null,color:photo?photo.color:item.selections?.["Variação"]||null,imageUrl:options.imageOf?.(item)??null,...(photo?{description:photo.description,specs:photo.specs}:productDetails(options.detailsOf?.(item))),
    engravings:[...(item.gravacoes??[]).map(g=>g.local?`${g.descricao} · ${g.local}`:g.descricao),...(photo?[]:Object.entries(item.selections??{}).filter(([key])=>key!=="Variação").map(([key,value])=>`${key}: ${value}`)),...(item.artworkName?[`Arte: ${item.artworkName}`]:[])],
    quantity:item.quantity,...(photo?{unitLabel:photo.unitLabel}:item.slug.startsWith("fotos/")?{unitLabel:{one:"Cópia",many:"Cópias"}}:{}),unitPrice:item.unitPrice!,total:Math.round(item.unitPrice!*item.quantity*100)/100,
  };});
  const applied=applyDiscount(Math.round(items.reduce((sum,item)=>sum+item.total,0)*100),order.discount);
  const billing=order.customer.billing;
  const actualMethods=finance?.paymentOnPickup?[...new Set(finance.payments.map(receipt=>paymentLabels[receipt.paymentMethod]))].join(' + '):'';
  const paymentText=finance?.paymentOnPickup?(finance.paidCents===0?'Total na retirada · forma de pagamento a definir':actualMethods):paymentLabels[order.paymentMethod];
  const terms=[{title:"Pagamento",text:paymentText+(finance?.installments?` · ${finance.installments} parcelas`:"")}];
  if(finance){
    terms.push({title:finance.deliveryMode==="retirada"?"Retirada":"Entrega",text:finance.deliveryDate?`${date(finance.deliveryDate)}${finance.deliveryTime?` às ${finance.deliveryTime}`:""}`:"Data a combinar."});
    const address=orderDeliveryAddress(order,finance);
    if(address) terms.push({title:"Endereço",text:address});
    if(finance.dueDate)terms.push({title:"Vencimento",text:date(finance.dueDate)});
  }
  return {kind:"order",code:orderCode(order.id),issuedAt:date(order.createdAt),seller:options.seller,
    customer:{name:order.customer.name===NO_CUSTOMER_NAME?"":order.customer.name,company:(billing?.personType==="pj"?billing.companyName||billing.tradeName:order.customer.company)||null,document:billing?`${billing.personType==="pj"?"CNPJ":"CPF"} ${billing.document}`:null,phone:order.customer.phone??"",city:billing?.address.city?`${billing.address.city} · ${billing.address.state}`:null},
    items,subtotal:applied.subtotalCents/100,discount:order.discount && applied.discountCents>0?{label:discountLabel(order.discount),amount:applied.discountCents/100}:null,freight:applied.freightCents/100,
    total:order.totalCents!==null?order.totalCents/100:applied.totalCents/100,terms,company:FARE_COMPANY,
    finance:finance?{paid:finance.paidCents/100,balance:finance.balanceCents/100,plan:paymentPlan(finance)}:null};
}
/** Endereço de entrega do pedido: o digitado no pedido, senão o do cadastro do cliente (equipe ou site). Retirada = null. */
export function orderDeliveryAddress(order: Order, finance: OrderFinance | null): string | null {
  if (finance?.deliveryMode !== "entrega") return null;
  return formatDeliveryAddress(finance.deliveryAddress) || order.customer.address || (order.customer.billing ? formatBillingAddress(order.customer.billing.address) : null);
}
export function orderWhatsAppText(doc: OrderDocument): string {
 const first=doc.customer.name.trim().split(/\s+/)[0];
 return [
  `${first?`Olá, ${first}!`:"Olá!"} Aqui é a ${doc.seller}, da Fare Foto.`, "", `Pedido ${doc.code}:`, "",
  ...doc.items.map(item=>`• ${item.quantity.toLocaleString("pt-BR")} × ${item.name}${item.unitLabel&&item.specs?.[0]?` ${item.specs[0]}`:""}${item.color?` (${item.color})`:""} — ${item.engravings.length?item.engravings.join(" + ")+" — ":""}${brl(item.unitPrice)}/${item.unitLabel?item.unitLabel.one.toLowerCase():"un."}`), "",
  ...(doc.discount?[`Subtotal: ${brl(doc.subtotal)} · ${doc.discount.label}: − ${brl(doc.discount.amount)}`]:[]),
  ...(doc.freight?[`Frete: ${brl(doc.freight)}`]:[]),
  `*Total: ${brl(doc.total)}*`,
  ...(doc.finance?[`Recebido: ${brl(doc.finance.paid)}`,`Saldo: ${brl(doc.finance.balance)}`]:[]),
  ...doc.terms.map(term=>`${term.title}: ${term.text}`), "", "Vou anexar o documento HTML com os detalhes do pedido na conversa.",
 ].join("\n");
}
export function orderWhatsAppUrl(doc: OrderDocument): string | null {
 const digits=doc.customer.phone.replace(/\D/g,"");if(digits.length<10)return null;
 return buildWhatsAppUrl(digits.length===10||digits.length===11?`55${digits}`:digits,orderWhatsAppText(doc));
}
