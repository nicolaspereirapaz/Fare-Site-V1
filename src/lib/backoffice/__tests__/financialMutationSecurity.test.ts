import { DatabaseSync } from 'node:sqlite';
import {expect,it,vi} from 'vitest';
import {createDirectOrderHandler} from '@/lib/backoffice/directOrderHandlers';
import {createRecordOrderPaymentHandler} from '@/lib/backoffice/orderPaymentHandlers';
import {createDirectOrder,getOrderFinance} from '@/lib/orders/payments';
const input={userId:'u1',idempotencyKey:'test-key-1',customer:{name:'Ana'},items:[{id:'a',productName:'Banner',slug:'',quantity:1,selections:{},unitPrice:50}],paymentMethod:'pix' as const,actorId:'s1',actorName:'Bia',internalNotes:'',deliveryDate:null,deliveryMode:'retirada' as const,installments:null,dueDate:null,payment:{amountCents:0,paidAt:null}};
it('origem hostil same-site e text/plain não gravam pedidos/recebimentos',async()=>{
 const db=new DatabaseSync(':memory:');const order=createDirectOrder(db,input);
 const deps={database:()=>db,getSession:vi.fn().mockResolvedValue({user:{id:'s1',name:'Bia',role:'vendedor'}}),catalog:vi.fn()};
 const create=createDirectOrderHandler(deps),receive=createRecordOrderPaymentHandler(deps);
 const payload={idempotencyKey:'receipt-key-1',amountCents:1000,paymentMethod:'pix',paidAt:'2026-10-14'};
 for(const [headers,status] of [
  [{'content-type':'application/json','origin':'http://localhost:4000','sec-fetch-site':'same-site'},403],
  [{'content-type':'text/plain','origin':'http://localhost:3000','sec-fetch-site':'same-origin'},415],
  [{'content-type':'application/json','origin':'null'},403],
  [{'content-type':'application/json','sec-fetch-site':'cross-site'},403],
 ] as const){
  const req=()=>new Request('http://localhost:3000/api',{method:'POST',headers,body:JSON.stringify(payload)});
  expect((await create(req())).status).toBe(status);expect((await receive(req(),order.id)).status).toBe(status);
 }
 expect(getOrderFinance(db,order.id)?.paidCents).toBe(0);expect(deps.catalog).not.toHaveBeenCalled();
});
it('origem exata com JSON permite recebimento',async()=>{
 const db=new DatabaseSync(':memory:');const order=createDirectOrder(db,input);
 const receive=createRecordOrderPaymentHandler({database:()=>db,getSession:vi.fn().mockResolvedValue({user:{id:'s1',name:'Bia',role:'vendedor'}})});
 const r=await receive(new Request('http://localhost:3000/api',{method:'POST',headers:{'content-type':'application/json','origin':'http://localhost:3000','sec-fetch-site':'same-origin'},body:JSON.stringify({idempotencyKey:'receipt-key-1',amountCents:1000,paymentMethod:'pix',paidAt:'2026-10-14'})}),order.id);
 expect(r.status).toBe(201);
});
it('usa Host real do Next quando a URL interna é localhost',async()=>{
 const db=new DatabaseSync(':memory:');const order=createDirectOrder(db,input);
 const receive=createRecordOrderPaymentHandler({database:()=>db,getSession:vi.fn().mockResolvedValue({user:{id:'s1',name:'Bia',role:'vendedor'}})});
 const req=new Request('http://localhost:3000/api',{method:'POST',headers:{host:'127.0.0.1:3000','content-type':'application/json',origin:'http://127.0.0.1:3000','sec-fetch-site':'same-origin'},body:JSON.stringify({idempotencyKey:'receipt-key-1',amountCents:1000,paymentMethod:'pix',paidAt:'2026-10-14'})});
 expect((await receive(req,order.id)).status).toBe(201);
});
