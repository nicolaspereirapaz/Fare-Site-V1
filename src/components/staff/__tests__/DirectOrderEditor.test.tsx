import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuoteEditor } from "@/components/staff/QuoteEditor";
const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock('@/components/staff/ProductConfigModal', () => ({ ProductConfigModal: ({ onSave }: { onSave: (item: unknown) => void }) => <button onClick={() => onSave({ id: 'item-1', source: 'avulso', name: 'Banner', cost: 1, quantity: 10, gravacoes: [], priceOverride: '5,00' })}>Adicionar item de teste</button> }));
const customer = { ref: 'painel:cliente1', name: 'Cliente QA', company: '', phone: '11988887777', kind: 'painel' };
const totals = { subtotal: 50, discount: 0, total: 50, cost: 10, margin: 40, pending: 0 };
const response = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
beforeEach(() => {
 push.mockClear();
 vi.stubGlobal('fetch', vi.fn(async (url: string) => {
  if (url.includes('/clientes?')) return response({ customers: [customer] });
  if (url.endsWith('/previa')) return response({ preview: [{ id: 'item-1', ok: true, unitPrice: 5, total: 50, cost: 10, productCost: 1, gravacoes: [], manual: { cost: false, price: true }, suggestedPrice: 12 }], totals });
  return response({ id: 'pedido-1', status: 'aguardando_arte' });
 }));
});
afterEach(() => vi.unstubAllGlobals());
describe('mesmo editor no modo pedido direto', () => {
 it('cliente obrigatório, pagamento e entrega; não mostra explicação financeira', () => {
  render(<QuoteEditor mode="order" />);
  expect(screen.getByRole('heading', { name: 'Novo pedido' })).toBeInTheDocument();
  expect(screen.getByLabelText('Data prevista de entrega')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Criar pedido' })).toBeDisabled();
  expect(screen.queryByText('Registro para o financeiro')).not.toBeInTheDocument();
  expect(screen.queryByText(/Sem cliente, fica como/)).not.toBeInTheDocument();
 });
 it('cria o pedido sem criar um orçamento e envia recebido em centavos', async () => {
  const user = userEvent.setup();render(<QuoteEditor mode="order" />);
  await user.type(screen.getByLabelText('Buscar cliente'), 'Cliente');
  await user.click(await screen.findByRole('option', { name: /Cliente QA/ }));
  await user.click(screen.getByRole('button', { name: 'Item fora do catálogo' }));
  await user.click(screen.getByRole('button', { name: 'Adicionar item de teste' }));
  await user.clear(screen.getByLabelText('Quanto o cliente já pagou (R$)'));
  await user.type(screen.getByLabelText('Quanto o cliente já pagou (R$)'), '20,00');
  await user.type(screen.getByLabelText('Data prevista de entrega'), '2026-10-23');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Criar pedido' })).toBeEnabled());
  await user.click(screen.getByRole('button', { name: 'Criar pedido' }));
  await waitFor(() => expect(push).toHaveBeenCalledWith('/equipe?aba=pedidos'));
  const calls = vi.mocked(fetch).mock.calls;
  const call = calls.find(([url]) => url === '/api/backoffice/pedido-editor');
  expect(call).toBeDefined();
  expect(JSON.parse(String(call![1]?.body))).toMatchObject({ customerRef: 'painel:cliente1', payment: { amountCents: 2000 }, deliveryDate: '2026-10-23', paymentMethod: 'pix' });
  expect(calls.some(([url]) => url === '/api/backoffice/orcamento-editor')).toBe(false);
 });
 it('orçamento permanece sem campos de pagamento', () => {
  render(<QuoteEditor />);
  expect(screen.getByRole('heading', { name: 'Novo orçamento' })).toBeInTheDocument();
  expect(screen.queryByLabelText('Quanto o cliente já pagou (R$)')).not.toBeInTheDocument();
 });
});
