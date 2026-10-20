// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { buildOrderDocument, orderWhatsAppText, orderWhatsAppUrl } from "../orderDocument";
import { createOrderDocumentHandlers } from "../orderHandlers";
import { renderOrderHtml } from "../html";
import { createOrder, findOrderById } from "@/lib/orders/repository";
import { createDirectOrder, getOrderFinance, recordOrderPayment } from "@/lib/orders/payments";
import { buildProposal, proposalWhatsAppText } from "../proposal";
import { createManualQuote } from "@/lib/quotes/repository";

const item = {id:"i",productName:"Caneta",slug:"brindes/abc",quantity:3,unitPrice:10.01,selections:{"Variação":"Azul"},gravacoes:[{descricao:"Laser",local:"Corpo"}],codes:{fare:"X123",supplier:"xbz" as const,supplierCode:"SEGREDO",sku:"SKU-SECRETO"}};
const input = {userId:"u",idempotencyKey:"k",customer:{name:"Ana Silva",phone:"11988887777",notes:"NOTA-INTERNA"},items:[item],paymentMethod:"dinheiro" as const,discount:{type:"value" as const,value:1}};
const options = {seller:"Bia",siteUrl:"https://www.farefoto.com.br"};
function setup(role: string | null = "vendedor") {
 const db=new DatabaseSync(":memory:"); const order=createOrder(db,input);
 const render=vi.fn(renderOrderHtml);
 const handlers=createOrderDocumentHandlers({database:()=>db,getSession:async()=>role ? {user:{id:"s",name:"Bia Lima",role}} : null,imageOf:async()=>null,siteUrl:options.siteUrl,render});
 return {db,order,handlers,render};
}
describe("documento de pedido",()=>{
 it("mantém snapshot público e não inventa recebimento em legado",()=>{
  const {order}=setup(); const doc=buildOrderDocument(order,null,options);
  expect(doc.code).toMatch(/^PED-/); expect(doc).toMatchObject({total:29.03,subtotal:30.03,discount:{amount:1},finance:null});
  expect(doc.items[0]).toMatchObject({quantity:3,unitPrice:10.01,engravings:["Laser · Corpo"],color:"Azul"});
  const text=orderWhatsAppText(doc); expect(text).toContain("Pedido PED-");expect(text).toContain("R$ 29,03");
  for(const secret of ["SEGREDO","SKU-SECRETO","NOTA-INTERNA","sinal","Pix","Válida","aprovar","orçamento","paidCents","fornecedor"]){expect(JSON.stringify(doc)+text).not.toContain(secret);}
  expect(new URL(orderWhatsAppUrl(doc)!).searchParams.get("text")).toBe(text);
  expect(orderWhatsAppUrl({...doc,customer:{...doc.customer,phone:""}})).toBeNull();
 });
 it("mostra recebimento, saldo e entrega reais, sem notas do financeiro",()=>{
  const db=new DatabaseSync(":memory:");const order=createDirectOrder(db,{...input,actorId:"s",actorName:"Bia",internalNotes:"NOTA-SECRETA",deliveryMode:"entrega",deliveryDate:"2026-10-23",installments:null,dueDate:null,payment:{amountCents:1000,paidAt:"2026-10-15"}});
  const doc=buildOrderDocument(order,getOrderFinance(db,order.id),options);const text=orderWhatsAppText(doc);
  expect(doc.finance).toMatchObject({paid:10,balance:19.03});expect(text).toContain("Recebido: R$ 10,00");expect(text).toContain("Saldo: R$ 19,03");expect(text).toContain("23/10/2026");expect(JSON.stringify(doc)).not.toContain("NOTA-SECRETA");
 });
 it('pedido com total na retirada não inventa Pix recebido e reflete o recebimento posterior',()=>{
  const db=new DatabaseSync(':memory:');
  const order=createDirectOrder(db,{...input,paymentMethod:'pix',actorId:'s',actorName:'Bia',internalNotes:'',deliveryMode:'retirada',deliveryDate:null,installments:null,dueDate:null,payment:{amountCents:0,paidAt:null},paymentOnPickup:true});
  const first=buildOrderDocument(order,getOrderFinance(db,order.id),options);
  expect(first.terms.find(t=>t.title==='Pagamento')?.text).toContain('retirada');
  expect(first.terms.find(t=>t.title==='Pagamento')?.text).not.toContain('Pix');
  expect(first.finance).toEqual({paid:0,balance:29.03});
  recordOrderPayment(db,{orderId:order.id,idempotencyKey:'pickup-receipt',amountCents:2903,paymentMethod:'dinheiro',paidAt:'2026-10-16',actorId:'s',actorName:'Bia'});
  const paid=buildOrderDocument(findOrderById(db,order.id)!,getOrderFinance(db,order.id),options);
  expect(paid.finance).toEqual({paid:29.03,balance:0});expect(paid.terms.find(t=>t.title==='Pagamento')?.text).toContain('Dinheiro');db.close();
 });
 it("protege ambos métodos antes de ler banco ou catálogo",async()=>{
  for(const role of [null,"cliente","bogus"]){const {handlers,render}=setup(role);for(const method of ["pdf","send"] as const){const response=await handlers[method](new Request("http://x"),"missing");expect(response.status).toBe(role?403:401);expect(response.headers.get("cache-control")).toBe("no-store");}expect(render).not.toHaveBeenCalled();}
 });
 it("GET real produz HTML válido, inline só ver=1, e POST não muda pedido",async()=>{
  const {db,order,handlers}=setup("admin");const before=findOrderById(db,order.id);
  for(const [suffix,disposition] of [["","attachment"],["?ver=1","inline"],["?ver=0","attachment"]]){
   const response=await handlers.pdf(new Request("http://x"+suffix),order.id);expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toBe("no-store");expect(response.headers.get("content-type")).toBe("text/html;charset=utf-8");expect(response.headers.get("content-disposition")).toBe(`${disposition}; filename="Pedido-${buildOrderDocument(order,null,options).code}.html"`);
   expect(response.headers.get("x-content-type-options")).toBe("nosniff");
   const text=await response.text();expect(text).toContain("<!DOCTYPE html>");expect(text).toContain("Caneta");expect(text).not.toMatch(/sinal|chave pix|validade|aprovar|proposta|fornecedor|SEGREDO/i);
  }
  const sent=await handlers.send(new Request("http://x",{method:"POST"}),order.id);const body=await sent.json();expect(body.whatsappUrl).toMatch(/^https:\/\/wa.me\/5511988887777/);expect(sent.headers.get("cache-control")).toBe("no-store");expect(findOrderById(db,order.id)).toEqual(before);
  expect((await handlers.pdf(new Request("http://x"),"missing")).status).toBe(404);
 },30000);
 it("orçamento inclui sinal mínimo com centavo para cima e Pix exato",()=>{
  const db=new DatabaseSync(":memory:");const quote=createManualQuote(db,{ownerId:"u",customer:input.customer,items:[item],createdBy:"Bia",internalNotes:"",idempotencyKey:"k"});
  const proposal=buildProposal(quote,options);expect(proposal.minimumDeposit).toBe(15.02);expect(proposal.pixKey).toBe("50.344.377/0001-36");expect(proposalWhatsAppText(proposal)).toContain("Sinal mínimo (50%): R$ 15,02");expect(proposalWhatsAppText(proposal)).toContain("Chave Pix (CNPJ): 50.344.377/0001-36");
 });
});
