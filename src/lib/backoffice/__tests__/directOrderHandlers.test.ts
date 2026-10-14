import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import { createDirectOrderHandler } from '@/lib/backoffice/directOrderHandlers';
import { findOrderById } from '@/lib/orders/repository';
import { getOrderFinance } from '@/lib/orders/payments';
const post = (body: unknown) => new Request('http://x/api/backoffice/pedido-editor', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body) });
const body = { customerRef:'conta:u1', idempotencyKey:'pedido-123456', paymentMethod:'pix', payment:{ amountCents:2000, paidAt:'2026-10-14' }, installments:null, dueDate:null, deliveryDate:'2026-10-23', deliveryMode:'retirada', internalNotes:'Só equipe', items:[{id:'a',source:'avulso',name:'Banner',cost:1,quantity:10,priceOverride:'5,00',gravacoes:[]}] };
function setup(role: string | null = 'vendedor') {
 const db = new DatabaseSync(':memory:');
 db.exec("CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT,email TEXT,emailVerified INTEGER);CREATE TABLE fare_customer_profiles(user_id TEXT PRIMARY KEY,phone TEXT,document TEXT,company_name TEXT,trade_name TEXT);INSERT INTO user VALUES('u1','Ana','ana@exemplo.com',1);INSERT INTO fare_customer_profiles VALUES('u1','11988887777','','','');");
 const deps={getSession:vi.fn().mockResolvedValue(role?{user:{id:'s1',name:'Bia',role}}:null),database:()=>db,catalog:async()=>({lookup:()=>null,browse:()=>({items:[],total:0,page:1,pages:1,colorCounts:{}})})};
 return {db,handler:createDirectOrderHandler(deps)};
}
describe('API de pedido direto',()=>{
 it('só permite equipe (401/403)',async()=>{
  expect((await setup(null).handler(post(body))).status).toBe(401);
  expect((await setup('cliente').handler(post(body))).status).toBe(403);
 });
 it('cria pedido com saldo e entrega, sem linha de orçamento',async()=>{
  const {db,handler}=setup();const response=await handler(post({...body,total:0.01,paidCents:1}));expect(response.status).toBe(201);
  const data=await response.json();const order=findOrderById(db,data.id)!;
  expect(order).toMatchObject({status:'aguardando_arte',totalCents:5000,customer:{name:'Ana'}});
  expect(getOrderFinance(db,data.id)).toMatchObject({paidCents:2000,balanceCents:3000,createdBy:'Bia',deliveryDate:'2026-10-23'});
  expect(db.prepare("SELECT count(*) n FROM sqlite_schema WHERE name='fare_quotes'").get()).toMatchObject({n:0});
 });
 it('cliente obrigatório e não aceita saldo negativo ou forma desconhecida',async()=>{
  for(const invalid of [{customerRef:''},{payment:{amountCents:5001,paidAt:'2026-10-14'}},{paymentMethod:'cripto'}]){
   const {handler}=setup();expect((await handler(post({...body,...invalid}))).status).toBe(400);
  }
 });
 it('preço é recalculado e o pagamento não cria orçamento por repetição',async()=>{
  const {db,handler}=setup();const a=await(await handler(post(body))).json();const b=await(await handler(post(body))).json();expect(a.id).toBe(b.id);
  expect(getOrderFinance(db,a.id)?.payments).toHaveLength(1);
 });
 it('sem recebimento entra em Aguardando pagamento',async()=>{
  const {handler}=setup();const r=await handler(post({...body,payment:{amountCents:0,paidAt:null}}));expect(r.status).toBe(201);expect(await r.json()).toMatchObject({orderStatus:'aguardando_pagamento'});
 });
});
