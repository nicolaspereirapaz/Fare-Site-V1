// @vitest-environment node
import { describe, expect, it, vi, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createManualQuote } from "@/lib/quotes/repository";
import { createDirectOrder, getOrderFinance } from "@/lib/orders/payments";
import { buildProposal } from "../proposal";
import { buildOrderDocument } from "../orderDocument";
import { embedDocumentImage, renderProposalHtml, renderOrderHtml } from "../html";

const item = {id:"fixture-internal", productName:"Caneca — EXEMPLO FICTÍCIO", slug:"canecas-personalizadas", quantity:10, unitPrice:29.9, selections:{"Variação":"Branca"}, gravacoes:[{descricao:"Impressão colorida",local:"Frente"}], codes:{fare:"F-EXEMPLO",supplier:"xbz" as const,supplierCode:"CUSTO-SEGREDO",sku:"SKU-SEGREDO"}};
const customer = {name:"Cliente EXEMPLO FICTÍCIO — sem valor comercial",phone:"",email:"privado@invalid.example"};
const options = {seller:"Equipe EXEMPLO",now:new Date("2026-10-18T12:00:00Z"),siteUrl:"https://www.farefoto.com.br",imageOf:()=>"/images/canecas-personalizadas.webp"};
afterEach(()=>vi.unstubAllGlobals());
describe("documento HTML autossuficiente",()=>{
 it("orçamento e pedido levam a descrição e as medidas do produto (escapadas)",async()=>{
  const db=new DatabaseSync(":memory:");
  const detailsOf=()=>({description:"Lápis <b>HB</b> com borracha.",specs:["Medidas: diâmetro 7 x 190 mm"]});
  const quote=createManualQuote(db,{ownerId:"fixture-owner",customer,items:[item],createdBy:"Equipe",internalNotes:"",idempotencyKey:"quote-details"});
  const order=createDirectOrder(db,{userId:"fixture-owner",customer,items:[item],paymentMethod:"dinheiro",actorId:"s",actorName:"Equipe",internalNotes:"",idempotencyKey:"order-details",discount:null,deliveryMode:"retirada",deliveryDate:null,installments:null,dueDate:null,payment:{amountCents:1000,paidAt:"2026-10-18"}});
  const [quoteHtml,orderHtml]=await Promise.all([
   renderProposalHtml(buildProposal(quote,{...options,detailsOf})),
   renderOrderHtml(buildOrderDocument(order,getOrderFinance(db,order.id),{...options,detailsOf})),
  ]);
  for(const output of [quoteHtml,orderHtml]){
   expect(output).toContain('<p class="description">Lápis &lt;b&gt;HB&lt;/b&gt; com borracha.</p>');
   expect(output).toContain("<li>Medidas: diâmetro 7 x 190 mm</li>");
  }
 });
 it("sem cliente informado: só o título Cliente, sem nome inventado",async()=>{
  const db=new DatabaseSync(":memory:");
  const quote=createManualQuote(db,{ownerId:"__sem_cliente__",customer:{name:"Cliente a definir",phone:""},items:[item],createdBy:"Equipe",internalNotes:"",idempotencyKey:"quote-nocustomer"});
  const html=await renderProposalHtml(buildProposal({...quote,userId:(await import("@/lib/quotes/quoteCode")).NO_CUSTOMER_OWNER},options));
  expect(html).toContain('<div class="eyebrow">Cliente</div>');
  expect(html).not.toMatch(/Cliente não informado|Cliente a definir/);
 });
 it("incorpora imagem local permitida e rejeita caminhos arbitrários",async()=>{
  expect(await embedDocumentImage("/images/canecas-personalizadas.webp")).toMatch(/^data:image\/webp;base64,/);
  const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
  for(const url of ["javascript:alert(1)","https://127.0.0.1/private","https://cdn.xbzbrindes.com.br.evil.test/a.png","https://cdn.xbzbrindes.com.br:4430/a.png","data:image/svg+xml;base64,PHN2Zz4=","/images/../../.env.local","file:///C:/private.png"]){expect(await embedDocumentImage(url)).toBeNull();}
  expect(fetcher).not.toHaveBeenCalled();
 });
 it("mantém valores reais, isola pedido/proposta, escapa entrada e produz exemplos com renderizador real",async()=>{
  const db=new DatabaseSync(":memory:");
  const quote=createManualQuote(db,{ownerId:"fixture-owner",customer,items:[item],createdBy:"Equipe EXEMPLO",internalNotes:"NOTA-SEGRETA",idempotencyKey:"quote-example",discount:{type:"value",value:19}});
  const proposal=buildProposal(quote,options);
  const order=createDirectOrder(db,{userId:"fixture-owner",customer,items:[item],paymentMethod:"dinheiro",actorId:"fixture-staff",actorName:"Equipe EXEMPLO",internalNotes:"NOTA-SEGRETA",idempotencyKey:"order-example",discount:{type:"value",value:19},deliveryMode:"retirada",deliveryDate:null,installments:null,dueDate:null,payment:{amountCents:10000,paidAt:"2026-10-18"}});
  const document=buildOrderDocument(order,getOrderFinance(db,order.id),options);
  const [html,orderHtml]=await Promise.all([renderProposalHtml(proposal),renderOrderHtml(document)]);
  for(const output of [html,orderHtml]){
   expect(output).toContain("<!DOCTYPE html>");expect(output).toContain("data:image/webp;base64,");expect(output).toContain("R$ 280,00");
   expect(output).toContain("data:font/woff2;base64,");
   for (const weight of [400, 500, 600, 700]) expect(output).toContain(`font-weight:${weight}`);
   expect(output).toContain("font-src data:");
   expect(output).toContain("max-width:860px");
   expect(output).toContain("padding:44px 52px 72px");
   const fontSizes = [...output.matchAll(/font-size:([\d.]+)px/g)].map(match => Number(match[1]));
   expect(fontSizes.length).toBeGreaterThan(10);
   expect(Math.min(...fontSizes)).toBeGreaterThanOrEqual(12);
   for(const secret of ["CUSTO-SEGREDO","SKU-SEGREDO","NOTA-SEGRETA","privado@invalid.example","fixture-internal","fixture-owner"]){expect(output).not.toContain(secret);}
   expect(output).not.toMatch(/<(?:img|script)[^>]+src="https?:/);expect(output).toContain('id="zoom"');
  }
  expect(orderHtml).toContain("R$ 100,00");expect(orderHtml).toContain("R$ 180,00");expect(orderHtml).not.toMatch(/sinal mínimo|Chave Pix|Válido até|Aprovar proposta/);
  const malicious='</h3><script>alert(1)</script><img src=x onerror=alert(2)>"';
  const escaped=await renderProposalHtml({...proposal,customer:{...proposal.customer,name:malicious},items:[{...proposal.items[0],name:malicious,imageUrl:"javascript:alert(1)",url:"javascript:alert(1)"}]});
  expect(escaped).not.toContain(malicious);expect(escaped).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");expect(escaped).not.toContain('src="javascript:');
  if(process.env.FARE_HTML_EXAMPLES_DIR){mkdirSync(process.env.FARE_HTML_EXAMPLES_DIR,{recursive:true});writeFileSync(path.join(process.env.FARE_HTML_EXAMPLES_DIR,"orcamento-exemplo.html"),html);writeFileSync(path.join(process.env.FARE_HTML_EXAMPLES_DIR,"pedido-exemplo.html"),orderHtml);}
  db.close();
 });
});
