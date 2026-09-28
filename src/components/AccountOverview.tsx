import { ClipboardList, FileText, UserRound } from "lucide-react";
import type { PaymentMethod } from "@/lib/orders/repository";
import type { StatusPedido } from "@/lib/backoffice/orderStatus";

type AccountUser = {
  name: string;
  email: string;
  role: string;
};

export type AccountOrder = {
  id: string;
  status: StatusPedido;
  paymentMethod: PaymentMethod;
  totalCents: number | null;
  createdAt: string;
  items: Array<{
    productName: string;
    quantity: number;
    quantityRange?: string;
  }>;
};

const STATUS_LABELS: Record<StatusPedido, string> = {
  aguardando_pagamento: "Aguardando pagamento",
  pagamento_confirmado: "Pagamento confirmado",
  aguardando_personalizacao: "Aguardando personalização",
  personalizacao_em_aprovacao: "Personalização em aprovação",
  personalizacao_aprovada: "Personalização aprovada",
  em_producao: "Em produção",
  pronto_para_envio: "Pronto para envio",
  em_transporte_ou_retirada: "Em transporte ou retirada",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  pix: "Pix",
  cartao_credito: "Cartão de crédito",
  cartao_debito: "Cartão de débito",
  boleto: "Boleto",
  faturamento_empresa: "Faturamento para empresa",
};

const formatCurrency = (cents: number) => new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
}).format(cents / 100);

export function AccountOverview({ user, orders }: { user: AccountUser; orders: AccountOrder[] }) {
  return (
    <div className="account-page container-shell">
      <header className="account-heading">
        <span className="eyebrow">Minha conta</span>
        <h1>Olá, {user.name}</h1>
        <p>Acompanhe seus pedidos e mantenha seus dados atualizados.</p>
      </header>

      <div className="account-grid">
        <section className="account-card account-orders" aria-labelledby="orders-title">
          <ClipboardList aria-hidden="true" />
          <h2 id="orders-title">Pedidos</h2>
          {!orders.length ? <p>Nenhum pedido por enquanto.</p> : (
            <div className="account-order-list">
              {orders.map((order) => (
                <article className="account-order" key={order.id}>
                  <div className="account-order-heading">
                    <h3>Pedido #{order.id}</h3>
                    <span>{STATUS_LABELS[order.status]}</span>
                  </div>
                  <p>Pagamento: <span>{PAYMENT_LABELS[order.paymentMethod]}</span></p>
                  <ul>
                    {order.items.map((item, index) => (
                      <li key={`${order.id}-${index}`}>
                        {item.productName} × {item.quantityRange ?? item.quantity}
                      </li>
                    ))}
                  </ul>
                  <strong>{order.totalCents === null ? "Valor sob consulta" : formatCurrency(order.totalCents)}</strong>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="account-card" aria-labelledby="quotes-title">
          <FileText aria-hidden="true" />
          <h2 id="quotes-title">Orçamentos</h2>
          <p>Nenhum orçamento por enquanto.</p>
        </section>

        <section className="account-card" aria-labelledby="profile-title">
          <UserRound aria-hidden="true" />
          <h2 id="profile-title">Dados pessoais</h2>
          <dl>
            <div><dt>Nome</dt><dd>{user.name}</dd></div>
            <div><dt>E-mail</dt><dd>{user.email}</dd></div>
            <div><dt>Perfil</dt><dd>{user.role}</dd></div>
          </dl>
        </section>
      </div>
    </div>
  );
}