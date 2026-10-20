import type { DatabaseSync } from "node:sqlite";
import type { SessionReader } from "@/lib/auth/session";
import { hasBackofficeAccess, resolveUserRole } from "@/lib/backoffice/access";
import type { QuoteCartItem } from "@/lib/commerce";
import { findOrderById } from "@/lib/orders/repository";
import { getOrderFinance } from "@/lib/orders/payments";
import { buildOrderDocument, orderWhatsAppText, orderWhatsAppUrl, type OrderDocument } from "./orderDocument";
import type { ProductDetails } from "./proposal";
export type OrderDocumentDeps = {
 getSession:SessionReader<{user:{id:string;name:string;role?:unknown}}>;
 database:()=>DatabaseSync;siteUrl:string;imageOf:(item:QuoteCartItem)=>Promise<string|null>;
 /** Descrição e medidas do produto (opcional). */
 detailsOf?:(item:QuoteCartItem)=>Promise<ProductDetails>;render:(document:OrderDocument)=>Promise<string>;
};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
export function createOrderDocumentHandlers(deps:OrderDocumentDeps){
 async function prepare(request:Request,id:string){
  const session=await deps.getSession({headers:request.headers});
  if(!session)return {error:json({error:"AUTH_REQUIRED"},401)};
  if(!hasBackofficeAccess(resolveUserRole(session.user)))return {error:json({error:"FORBIDDEN"},403)};
  const db=deps.database();const order=findOrderById(db,id);if(!order)return {error:json({error:"ORDER_NOT_FOUND"},404)};
  const finance=getOrderFinance(db,id);const images=new Map<string,string|null>();
  const details=new Map<string,ProductDetails|null>();
  await Promise.all(order.items.map(async item=>{images.set(item.id,await deps.imageOf(item).catch(()=>null));details.set(item.id,(await deps.detailsOf?.(item).catch(()=>null))??null);}));
  try{return {document:buildOrderDocument(order,finance,{seller:session.user.name.trim().split(/\s+/)[0]||"Equipe",siteUrl:deps.siteUrl,imageOf:item=>images.get(item.id)??null,detailsOf:item=>details.get(item.id)??null})};}
  catch(error){return {error:json({error:"CANNOT_DOCUMENT",message:error instanceof Error?error.message:"Não foi possível gerar."},409)};}
 }
 return {
  async pdf(request:Request,id:string){const ready=await prepare(request,id);if(ready.error)return ready.error;
   const pdf=await deps.render(ready.document);return new Response(pdf,{headers:{"Content-Type":"text/html;charset=utf-8","Content-Disposition":`${new URL(request.url).searchParams.get("ver")==="1"?"inline":"attachment"}; filename="Pedido-${ready.document.code}.html"`,"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
  },
  async send(request:Request,id:string){const ready=await prepare(request,id);if(ready.error)return ready.error;
   return json({text:orderWhatsAppText(ready.document),whatsappUrl:orderWhatsAppUrl(ready.document)});
  }
 };
}
