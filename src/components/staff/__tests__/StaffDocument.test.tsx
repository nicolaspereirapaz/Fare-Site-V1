import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StaffDocumentPage, ProductSnapshot } from '@/components/staff/StaffDocumentPage';
import type { StaffDocument } from '@/lib/backoffice/documentDetails';
const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
const item = { id:'i1', productName:'Squeeze original', slug:'avulso', quantity:100, selections:{'Variação':'Preto'}, unitPrice:24.96, imageUrl:null, costing:{custoProduto:9.48,personalizacao:'Laser',detalhe:'',personalizacaoUnitaria:2.5,custoPersonalizacaoTotal:250,freteFornecedor:100,tecnica:{tipo:'laser'},por:'Maria',em:'2026-10-15',gravacoes:[{tecnica:{tipo:'laser',larguraCm:99},local:'Frente',descricao:'Laser',detalhe:'',custoUnitario:2.5,custoTotal:250}]}};
const doc: StaffDocument = { kind:'order',id:'order1',code:'PED-123ABC',status:'aguardando_arte',customer:{name:'Cliente',phone:'11999999999'},items:[item],total:2496,discount:null,createdAt:'2026-10-15T12:00:00Z',updatedAt:'2026-10-15T12:00:00Z',createdBy:'Maria',internalNotes:'',finance:null,paymentMethod:'pix',proposalSentAt:null,orderId:null,history:[] };
beforeEach(() => {push.mockClear(); vi.stubGlobal('fetch',vi.fn(async () => Response.json({document:doc})));});
afterEach(() => {vi.unstubAllGlobals();});
describe('consulta completa com snapshot do editor',()=>{
 it('pedido tem ações reais de documento, sem Pix/sinal mínimo',async()=>{
  render(<StaffDocumentPage kind="order" id="order1" canCancel={false}/>);
  expect(await screen.findByRole('heading',{name:'PED-123ABC'})).toBeInTheDocument();
  expect(screen.getByRole('link',{name:/Ver HTML/})).toHaveAttribute('href','/api/backoffice/orders/order1/documento?ver=1');
  expect(screen.getByRole('link',{name:/Baixar HTML/})).toHaveAttribute('href','/api/backoffice/orders/order1/documento');
  expect(screen.getByRole('button',{name:/Enviar no WhatsApp/})).toBeInTheDocument();
  expect(screen.queryByText(/Sinal mínimo/)).not.toBeInTheDocument();
  expect(screen.queryByText('50.344.377/0001-36')).not.toBeInTheDocument();
  expect(screen.getByRole('link',{name:/Voltar/})).toHaveAttribute('href','/equipe');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
 });
 it('orçamento tem sinal 50%, chave exata copiável e link separado para editar',async()=>{
  const user=userEvent.setup();const writeText=vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText}});
  vi.mocked(fetch).mockResolvedValue(Response.json({document:{...doc,kind:'quote',code:'ORC-123ABC',status:'aguardando_pagamento'}}));
  render(<StaffDocumentPage kind="quote" id="quote1" canCancel={false}/>);
  expect(await screen.findByText('Sinal mínimo (50%)')).toBeInTheDocument();
  expect(screen.getByText('R$ 1.248,00')).toBeInTheDocument();
  await user.click(screen.getByRole('button',{name:/Copiar chave/}));
  await waitFor(()=>expect(writeText).toHaveBeenCalledWith('50.344.377/0001-36'));
  // No topo (fácil de achar) e no Andamento.
  const edits=screen.getAllByRole('link',{name:/Editar orçamento/});
  expect(edits).toHaveLength(2);
  for(const link of edits)expect(link).toHaveAttribute('href','/equipe/orcamentos/quote1');
  expect(screen.getByRole('button',{name:'Fechar Orçamento'})).toBeInTheDocument();
 });
 it('avança por cada etapa do caminho e mantém a consulta aberta',async()=>{
  const user=userEvent.setup();const steps:string[]=[];let current=doc;
  vi.mocked(fetch).mockImplementation(async(_url,init)=>{if(init?.method==='PATCH'){const status=JSON.parse(String(init.body)).status;steps.push(status);current={...current,status};return Response.json({});}return Response.json({document:current});});
  render(<StaffDocumentPage kind="order" id="order1" canCancel={false}/>);
  await user.selectOptions(await screen.findByLabelText('Etapa'),'em_producao');
  await waitFor(()=>expect(steps).toEqual(['criando_arte','aguardando_producao','em_producao']));
  await waitFor(()=>expect(screen.getByLabelText('Etapa')).toHaveValue('em_producao'));
 });
 it('volta etapa e exibe erro da API sem inventar sucesso',async()=>{
  const user=userEvent.setup();vi.mocked(fetch).mockImplementation(async(_url,init)=>init?.method==='PATCH'?Response.json({error:'INVALID_TRANSITION'},{status:409}):Response.json({document:{...doc,status:'aguardando_retirada'}}));
  render(<StaffDocumentPage kind="order" id="order1" canCancel={false}/>);
  await user.selectOptions(await screen.findByLabelText('Etapa'),'em_producao');
  expect(await screen.findByRole('alert')).toHaveTextContent('Essa transição de status não é permitida.');
  expect(screen.getByLabelText('Etapa')).toHaveValue('aguardando_retirada');
 });
 it('cancelar só para administrador e confirmação recusada não envia PATCH',async()=>{
  const user=userEvent.setup();vi.stubGlobal('confirm',vi.fn(()=>false));
  const {rerender}=render(<StaffDocumentPage kind="order" id="order1" canCancel={false}/>);
  await screen.findByRole('heading',{name:'PED-123ABC'});expect(screen.queryByRole('button',{name:'Cancelar pedido'})).not.toBeInTheDocument();
  rerender(<StaffDocumentPage kind="order" id="order1" canCancel/>);
  await user.click(screen.getByRole('button',{name:'Cancelar pedido'}));expect(confirm).toHaveBeenCalled();
  expect(vi.mocked(fetch).mock.calls.some(([,init])=>init?.method==='PATCH')).toBe(false);
 });
 it('Finalizar pedido usa a transição real para concluido',async()=>{
  const user=userEvent.setup();let current={...doc,status:'aguardando_feedback'};
  vi.mocked(fetch).mockImplementation(async(_url,init)=>{if(init?.method==='PATCH'){current={...current,status:JSON.parse(String(init.body)).status};return Response.json({});}return Response.json({document:current});});
  render(<StaffDocumentPage kind="order" id="order1" canCancel={false}/>);
  await user.click(await screen.findByRole('button',{name:'Finalizar pedido'}));
  await waitFor(()=>expect(current.status).toBe('concluido'));
 });
 it('laser não inventa dimensões; campos do produto são somente leitura',()=>{
  render(<ProductSnapshot item={item} index={0}/>);
  expect(screen.getByRole('heading',{name:'Produto'})).toBeInTheDocument();
  expect(screen.getByRole('heading',{name:'Gravação'})).toBeInTheDocument();
  expect(screen.getByRole('heading',{name:'Preço de venda'})).toBeInTheDocument();
  expect(screen.getByText('Frente')).toBeInTheDocument();
  expect(screen.queryByText('Largura (cm)')).not.toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
 });
 it('DTF exibe as dimensões reais com a mesma vírgula e unidade do editor',()=>{
  const dtf={...item,costing:{...item.costing,gravacoes:[{...item.costing.gravacoes[0],tecnica:{tipo:'dtf-uv',larguraCm:12.5,alturaCm:7},descricao:'DTF UV'}]}};
  render(<ProductSnapshot item={dtf} index={0}/>);
  expect(screen.getByText('Largura (cm)')).toBeInTheDocument();expect(screen.getByText('12,5')).toBeInTheDocument();
  expect(screen.getByText('Altura (cm)')).toBeInTheDocument();expect(screen.getByText('7')).toBeInTheDocument();
 });
});
