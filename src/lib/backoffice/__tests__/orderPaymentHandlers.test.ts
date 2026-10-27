import {DatabaseSync} from 'node:sqlite';
import {expect,it,vi} from 'vitest';
import {createRecordOrderPaymentHandler,createUpdateOrderDeliveryHandler} from '@/lib/backoffice/orderPaymentHandlers';
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
it('entrega prevista do pedido: altera data/horário, valida e bloqueia pedido encerrado',async()=>{
 const {db,order}=setup();
 const update=createUpdateOrderDeliveryHandler({database:()=>db,getSession:vi.fn().mockResolvedValue({user:{id:'s1',name:'Bia',role:'vendedor'}})});
 const patch=(body:unknown)=>new Request('http://x',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 expect((await update(patch({deliveryDate:'2026-11-05',deliveryTime:'09:15'}),order.id)).status).toBe(200);
 expect(getOrderFinance(db,order.id)).toMatchObject({deliveryDate:'2026-11-05',deliveryTime:'09:15',deliveryMode:'retirada'});
 expect((await update(patch({deliveryDate:null,deliveryTime:'09:15'}),order.id)).status).toBe(400);
 expect((await update(patch({deliveryDate:'2026-02-30'}),order.id)).status).toBe(400);
 expect((await update(patch({deliveryDate:'2026-11-06'}),order.id)).status).toBe(200);
 expect(getOrderFinance(db,order.id)).toMatchObject({deliveryDate:'2026-11-06',deliveryTime:null});
 // Entrega com endereço só deste pedido; voltar para retirada apaga o endereço.
 const address={cep:'13201000',street:'Rua A',number:'10',district:'Centro',city:'Jundiaí',state:'SP',reference:'portão azul'};
 expect((await update(patch({deliveryDate:'2026-11-06',deliveryMode:'entrega',deliveryAddress:address}),order.id)).status).toBe(200);
 expect(getOrderFinance(db,order.id)).toMatchObject({deliveryMode:'entrega',deliveryAddress:{cep:'13201-000',street:'Rua A',complement:''}});
 expect((await update(patch({deliveryDate:'2026-11-06'}),order.id)).status).toBe(200);
 expect(getOrderFinance(db,order.id)?.deliveryAddress?.street).toBe('Rua A');
 expect((await update(patch({deliveryDate:'2026-11-06',deliveryMode:'entrega',deliveryAddress:{cep:'12'}}),order.id)).status).toBe(400);
 expect((await update(patch({deliveryDate:'2026-11-06',deliveryMode:'retirada'}),order.id)).status).toBe(200);
 expect(getOrderFinance(db,order.id)).toMatchObject({deliveryMode:'retirada',deliveryAddress:null});
 db.prepare("UPDATE fare_orders SET status='cancelado' WHERE id=?").run(order.id);
 expect((await update(patch({deliveryDate:'2026-11-07'}),order.id)).status).toBe(400);
 expect(getOrderFinance(db,order.id)?.deliveryDate).toBe('2026-11-06');
});
