import {DatabaseSync} from 'node:sqlite';
import {expect,it,vi} from 'vitest';
import {createRecordOrderPaymentHandler} from '@/lib/backoffice/orderPaymentHandlers';
import {createDirectOrder,getOrderFinance} from '@/lib/orders/payments';
const request=(body:unknown)=>new Request('http://x',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
function setup(role:string|null='vendedor'){
 const db=new DatabaseSync(':memory:');
 const order=createDirectOrder(db,{userId:'u1',idempotencyKey:'direct-key-123',customer:{name:'Ana'},items:[{id:'a',productName:'Banner',slug:'',quantity:1,selections:{},unitPrice:50}],paymentMethod:'pix',actorId:'s1',actorName:'Bia',internalNotes:'',deliveryDate:'2026-10-23',deliveryMode:'retirada',installments:null,dueDate:null,payment:{amountCents:0,paidAt:null}});
 const handler=createRecordOrderPaymentHandler({database:()=>db,getSession:vi.fn().mockResolvedValue(role?{user:{id:'s1',name:'Bia',role}}:null)});
 return {db,order,handler};
}
it('recebimento protegido, lê saldo atualizado e não duplica',async()=>{
 const {db,order,handler}=setup();const input={idempotencyKey:'receipt-1234',amountCents:2000,paymentMethod:'dinheiro',paidAt:'2026-10-14'};
 expect((await handler(request(input),order.id)).status).toBe(201);
 expect((await handler(request(input),order.id)).status).toBe(201);
 expect(getOrderFinance(db,order.id)).toMatchObject({paidCents:2000,balanceCents:3000,payments:[{actorName:'Bia',paymentMethod:'dinheiro'}]});
 expect((await handler(request({...input,idempotencyKey:'receipt-12345',amountCents:3001}),order.id)).status).toBe(400);
});
it('401/403/404, JSON inválido, inválidos não mudam o saldo',async()=>{
 expect((await setup(null).handler(request({}), 'x')).status).toBe(401);
 expect((await setup('cliente').handler(request({}), 'x')).status).toBe(403);
 const {db,order,handler}=setup();
 expect((await handler(request({}), 'ausente')).status).toBe(404);
 expect((await handler(new Request('http://x',{method:'POST',headers:{'content-type':'application/json'},body:'{'}),order.id)).status).toBe(400);
 expect((await handler(request({idempotencyKey:'12345678',amountCents:'2000',paymentMethod:'pix',paidAt:'2026-10-14'}),order.id)).status).toBe(400);
 expect(getOrderFinance(db,order.id)?.paidCents).toBe(0);
});
