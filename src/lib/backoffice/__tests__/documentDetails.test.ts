// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createDocumentDetailsHandler } from '@/lib/backoffice/documentDetails';
import type { Order } from '@/lib/orders/repository';
const order:Order={id:'123abc-456',userId:'client',idempotencyKey:'example-key',status:'aguardando_arte',paymentMethod:'pix',customer:{name:'Cliente'},items:[{id:'i1',productName:'Brinde',slug:'avulso',quantity:3,selections:{'Variação':'Preto'},unitPrice:10,costing:{custoProduto:2,personalizacao:'DTF',detalhe:'',personalizacaoUnitaria:1,custoPersonalizacaoTotal:3,freteFornecedor:0,tecnica:{tipo:'dtf-uv',larguraCm:12.5,alturaCm:7},por:'Maria',em:'2026-10-15'}}],discount:null,totalCents:3000,createdAt:'2026-10-15T12:00:00Z',updatedAt:'2026-10-15T12:00:00Z'};
const request=new Request('http://localhost/api/backoffice/orders/order1');
describe('snapshot protegido da página de consulta',()=>{
 it.each([null,{user:{id:'client',role:'cliente'}}])('bloqueia sem consultar banco/catálogo: %o',async session=>{
  const find=vi.fn();const imageOf=vi.fn();const read=createDocumentDetailsHandler({kind:'order',getSession:async()=>session,find,imageOf});
  expect((await read(request,order.id)).status).toBe(session?403:401);expect(find).not.toHaveBeenCalled();expect(imageOf).not.toHaveBeenCalled();
 });
 it('mantém preço e técnica persistidos, não recalcula e usa prefixo PED-',async()=>{
  const imageOf=vi.fn().mockRejectedValue(new Error('CDN indisponível'));
  const read=createDocumentDetailsHandler({kind:'order',getSession:async()=>({user:{id:'staff',role:'vendedor'}}),find:()=>order,imageOf});
  const response=await read(request,order.id);const data=await response.json();expect(response.status).toBe(200);expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(data.document).toMatchObject({code:'PED-123ABC',total:30,finance:null,items:[{unitPrice:10,imageUrl:null,costing:order.items[0].costing}]});
 });
 it('enriquece a consulta com catálogo sem alterar o snapshot salvo',async()=>{
  const original=JSON.stringify(order.items);
  const productOf=vi.fn().mockResolvedValue({imageUrl:'https://catalog.example/real.jpg',catalogInfo:{description:'Descrição do catálogo.',printingAreas:[]}});
  const read=createDocumentDetailsHandler({kind:'order',getSession:async()=>({user:{id:'staff',role:'admin'}}),find:()=>order,imageOf:async()=>null,productOf});
  const response=await read(request,order.id);const data=await response.json();
  expect(data.document.items[0]).toMatchObject({imageUrl:'https://catalog.example/real.jpg',catalogInfo:{description:'Descrição do catálogo.',printingAreas:[]},costing:order.items[0].costing});
  expect(productOf).toHaveBeenCalledTimes(1);expect(JSON.stringify(order.items)).toBe(original);
 });
 it('não encontrado retorna 404',async()=>{
  const read=createDocumentDetailsHandler({kind:'quote',getSession:async()=>({user:{id:'staff',role:'admin'}}),find:()=>null,imageOf:async()=>null});
  expect((await read(request,'missing')).status).toBe(404);
 });
});
