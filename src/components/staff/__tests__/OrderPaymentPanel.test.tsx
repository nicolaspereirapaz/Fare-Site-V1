import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach,expect,it,vi} from 'vitest';
import {OrderPaymentPanel} from '@/components/staff/OrderPaymentPanel';
const finance={paidCents:2000,balanceCents:3000,createdBy:'Bia',internalNotes:'',deliveryDate:'2026-10-23',deliveryMode:'retirada' as const,installments:null,dueDate:null,payments:[]};
afterEach(()=>vi.unstubAllGlobals());
it('registra recebimento real e pede releitura do cartão',async()=>{
 const onRecorded=vi.fn();vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({finance:{...finance,paidCents:5000,balanceCents:0}}),{status:200})));
 const user=userEvent.setup();render(<OrderPaymentPanel orderId="o1" status="aguardando_retirada" paymentMethod="pix" finance={finance} onRecorded={onRecorded} />);
 expect(screen.getByText(/Falta pagar/)).toHaveTextContent('30,00');
 await user.click(screen.getByRole('button',{name:'Registrar pagamento'}));
 await user.click(screen.getByRole('button',{name:'Confirmar recebimento'}));
 await waitFor(()=>expect(onRecorded).toHaveBeenCalledOnce());
 const body=JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
 expect(body).toMatchObject({amountCents:3000,paymentMethod:'pix'});
 expect(body).toHaveProperty('idempotencyKey');
});
it('quitado e cancelado não permitem novos recebimentos',()=>{
 const {rerender}=render(<OrderPaymentPanel orderId="o1" status="aguardando_retirada" paymentMethod="pix" finance={{...finance,balanceCents:0}} onRecorded={()=>{}} />);
 expect(screen.queryByRole('button',{name:'Registrar pagamento'})).not.toBeInTheDocument();
 rerender(<OrderPaymentPanel orderId="o1" status="cancelado" paymentMethod="pix" finance={finance} onRecorded={()=>{}} />);
 expect(screen.queryByRole('button',{name:'Registrar pagamento'})).not.toBeInTheDocument();
});
it('pagamento confirmado continua confirmado quando a releitura falha; retry só consulta',async()=>{
 const onRecorded=vi.fn().mockRejectedValueOnce(new Error('rede')).mockResolvedValue(undefined);
 const updated={...finance,paidCents:5000,balanceCents:0};
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({finance:updated}),{status:201})));
 const user=userEvent.setup();render(<OrderPaymentPanel orderId="o1" status="aguardando_retirada" paymentMethod="pix" finance={finance} onRecorded={onRecorded} />);
 await user.click(screen.getByRole('button',{name:'Registrar pagamento'}));
 await user.click(screen.getByRole('button',{name:'Confirmar recebimento'}));
 await waitFor(()=>expect(screen.getByText(/Falta pagar/)).toHaveTextContent('0,00'));
 expect(screen.queryByRole('button',{name:'Registrar pagamento'})).not.toBeInTheDocument();
 await user.click(screen.getByRole('button',{name:'Atualizar quadro'}));
 expect(onRecorded).toHaveBeenCalledTimes(2);expect(fetch).toHaveBeenCalledOnce();
});
it('resposta perdida congela payload e reenvia a mesma chave sem alterar o recebimento',async()=>{
 const send=vi.fn().mockRejectedValueOnce(new TypeError('rede')).mockResolvedValueOnce(new Response(JSON.stringify({finance:{...finance,paidCents:3000,balanceCents:2000}}),{status:201}));
 vi.stubGlobal('fetch',send);const user=userEvent.setup();render(<OrderPaymentPanel orderId="o1" status="aguardando_retirada" paymentMethod="pix" finance={finance} onRecorded={()=>{}} />);
 await user.click(screen.getByRole('button',{name:'Registrar pagamento'}));
 await user.clear(screen.getByLabelText('Valor recebido (R$)'));await user.type(screen.getByLabelText('Valor recebido (R$)'), '10,00');
 await user.click(screen.getByRole('button',{name:'Confirmar recebimento'}));
 await screen.findByRole('alert');expect(screen.getByLabelText('Valor recebido (R$)')).toBeDisabled();expect(screen.getByLabelText('Forma do recebimento')).toBeDisabled();
 await user.click(screen.getByRole('button',{name:'Confirmar recebimento'}));
 await waitFor(()=>expect(send).toHaveBeenCalledTimes(2));expect(send.mock.calls[1][1].body).toBe(send.mock.calls[0][1].body);
 await waitFor(()=>expect(screen.getByText(/Falta pagar/)).toHaveTextContent('20,00'));
});
