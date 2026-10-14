import { describe, expect, it } from 'vitest';
import { createListBackofficeOrdersHandler, createUpdateBackofficeOrderStatusHandler } from '@/lib/backoffice/access';
import type { Order } from '@/lib/orders/repository';
const order = {id:'123',userId:'u1',idempotencyKey:'k',customer:{name:'Ana'},items:[{id:'a',productName:'Banner',slug:'',quantity:1,selections:{},unitPrice:50}],paymentMethod:'pix',status:'aguardando_arte',totalCents:5000,discount:null,createdAt:'2026-10-14T00:00:00.000Z',updatedAt:'2026-10-14T00:00:00.000Z'} as Order;
const finance={paidCents:2000,balanceCents:3000,createdBy:'Bia',internalNotes:'interno',deliveryDate:'2026-10-23',deliveryMode:'retirada' as const,installments:null,dueDate:null,payments:[]};
it('listagem da equipe traz dívida e entrega do pedido direto',async()=>{
 const handler=createListBackofficeOrdersHandler(async()=>({user:{id:'s1',role:'vendedor'}}),()=>[order],()=>[],()=>finance);
 expect(await(await handler(new Request('http://x'))).json()).toMatchObject({orders:[{finance}]});
});
it('pessoa sem permissão não lê nem o registro financeiro',async()=>{
 let reads=0;
 const handler=createListBackofficeOrdersHandler(async()=>({user:{id:'u1',role:'cliente'}}),()=>[order],()=>[],()=>{reads++;return finance;});
 expect((await handler(new Request('http://x'))).status).toBe(403);expect(reads).toBe(0);
});
it('trocar status não inventa um recebimento no pedido direto',async()=>{
 let changes=0;
 const handler=createUpdateBackofficeOrderStatusHandler(async()=>({user:{id:'s1',role:'vendedor'}}),()=>({...order,status:'aguardando_pagamento'}),()=>{changes++;return order;},()=>({...finance,paidCents:0,balanceCents:5000}));
 const response=await handler(new Request('http://x',{method:'PATCH',body:JSON.stringify({status:'aguardando_arte'})}),'123');
 expect(response.status).toBe(409);expect(changes).toBe(0);
});
