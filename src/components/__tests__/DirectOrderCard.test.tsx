import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KanbanCardBody } from '@/components/backofficeShared';
const finance={paidCents:2000,balanceCents:3000,createdBy:'Bia',internalNotes:'',deliveryDate:'2026-10-23',deliveryMode:'retirada' as const,installments:null,dueDate:null,payments:[]};
describe('cartão financeiro do pedido',()=>{
 it('destaca dívida e prazo sem mostrar livro financeiro',()=>{
  render(<KanbanCardBody code="FF-A1" total={50} title="Ana" summary="Banner" finance={finance} />);
  expect(screen.getByText(/Cliente deve/)).toHaveTextContent('30,00');
  expect(screen.getByText(/Entrega prevista/)).toHaveTextContent('23/10/2026');
 });
 it('dívida desaparece quando quitado e não é inferida para legado',()=>{
  const {rerender}=render(<KanbanCardBody code="FF-A1" total={50} title="Ana" summary="Banner" finance={{...finance,balanceCents:0,paidCents:5000}} />);
  expect(screen.queryByText(/Cliente deve/)).not.toBeInTheDocument();
  rerender(<KanbanCardBody code="FF-A1" total={50} title="Ana" summary="Banner" />);
  expect(screen.queryByText(/Cliente deve/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Entrega prevista/)).not.toBeInTheDocument();
 });
});
