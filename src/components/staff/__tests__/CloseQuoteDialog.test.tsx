import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { CloseQuoteDialog } from '@/components/staff/CloseQuoteDialog';
const quote={id:'q1',code:'ORC-EXEMPLO',customerName:'Cliente',total:1250,updatedAt:'2026-10-16T12:00:00Z'};
const onClosed=vi.fn();
beforeEach(()=>{onClosed.mockClear();vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({order:{id:'order1',code:'PED-EXEMPLO',status:'aguardando_arte'}})));});
afterEach(()=>vi.unstubAllGlobals());
const setup=()=>render(<CloseQuoteDialog quote={quote} onClose={()=>undefined} onClosed={onClosed}/>);
describe('fechamento guiado aprovado',()=>{
 it('mostra total e abre sem presumir recebimento',()=>{
  setup();expect(within(screen.getByLabelText('Total do orçamento')).getByText('R$ 1.250,00')).toBeInTheDocument();
  expect(screen.getByLabelText('Valor recebido agora')).toHaveValue('');expect(screen.getByRole('button',{name:'Confirmar e gerar pedido'})).toBeDisabled();
 });
 it('50% preenche recebido e saldo a partir do total original',async()=>{
  const user=userEvent.setup();setup();await user.click(screen.getByRole('button',{name:/50% de sinal/}));
  expect(screen.getByLabelText('Valor recebido agora')).toHaveValue('625,00');
  expect(within(screen.getByLabelText('Resumo do recebimento')).getAllByText('R$ 625,00')).toHaveLength(2);
  await user.click(screen.getByRole('button',{name:'Confirmar e gerar pedido'}));
  await waitFor(()=>expect(onClosed).toHaveBeenCalled());
  const sent=JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));expect(sent).toMatchObject({payment:{amountCents:62500},paymentOnPickup:false});expect(sent.items).toBeUndefined();
 });
 it('valor total quita e outro valor permanece editável',async()=>{
  const user=userEvent.setup();setup();await user.click(screen.getByRole('button',{name:/^Valor total/}));
  expect(screen.getByLabelText('Valor recebido agora')).toHaveValue('1250,00');expect(within(screen.getByLabelText('Resumo do recebimento')).getByText('R$ 0,00')).toBeInTheDocument();
  await user.click(screen.getByRole('button',{name:/Outro valor/}));await user.type(screen.getByLabelText('Valor recebido agora'),'100,00');
  expect(within(screen.getByLabelText('Resumo do recebimento')).getByText('R$ 1.150,00')).toBeInTheDocument();
 });
 it('total na retirada informa intenção explícita, zero recebido e sem forma presumida',async()=>{
  const user=userEvent.setup();setup();await user.click(screen.getByRole('button',{name:/Total na retirada/}));
  expect(screen.getByLabelText('Valor recebido agora')).toHaveValue('0,00');expect(screen.getByLabelText('Valor recebido agora')).toBeDisabled();
  expect(screen.queryByLabelText('Forma de pagamento')).not.toBeInTheDocument();expect(screen.getByLabelText('Forma de entrega')).toHaveValue('retirada');expect(screen.getByLabelText('Forma de entrega')).toBeDisabled();
  await user.click(screen.getByRole('button',{name:'Confirmar · pagar na retirada'}));await waitFor(()=>expect(onClosed).toHaveBeenCalled());
  const sent=JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));expect(sent).toMatchObject({paymentOnPickup:true,payment:{amountCents:0,paidAt:null},deliveryMode:'retirada',installments:null,dueDate:null});
 });
 it('zero sem acordo de retirada não é confundido com liberação para produção',async()=>{
  const user=userEvent.setup();setup();await user.click(screen.getByRole('button',{name:'Ainda não houve pagamento'}));
  expect(screen.getByText(/sem liberar a arte/)).toBeInTheDocument();await user.click(screen.getByRole('button',{name:'Criar aguardando pagamento'}));
  await waitFor(()=>expect(onClosed).toHaveBeenCalled());expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body)).paymentOnPickup).toBe(false);
 });
 it('bloqueia valor maior que o total sem efetuar POST',async()=>{
  const user=userEvent.setup();setup();await user.type(screen.getByLabelText('Valor recebido agora'),'1500,00');
  expect(screen.getByRole('button',{name:'Confirmar e gerar pedido'})).toBeDisabled();expect(screen.getByRole('alert')).toHaveTextContent(/maior que o total/);expect(fetch).not.toHaveBeenCalled();
 });
 it('resposta incerta congela e reenvia chave/payload idênticos',async()=>{
  vi.mocked(fetch).mockRejectedValueOnce(new Error('network'));
  const user=userEvent.setup();setup();await user.click(screen.getByRole('button',{name:/Total na retirada/}));await user.click(screen.getByRole('button',{name:'Confirmar · pagar na retirada'}));
  const retry=await screen.findByRole('button',{name:'Confirmar novamente'});expect(screen.getByRole('button',{name:/50% de sinal/})).toBeDisabled();
  await user.click(retry);await waitFor(()=>expect(onClosed).toHaveBeenCalled());expect(vi.mocked(fetch).mock.calls[0][1]?.body).toBe(vi.mocked(fetch).mock.calls[1][1]?.body);
 });
});
