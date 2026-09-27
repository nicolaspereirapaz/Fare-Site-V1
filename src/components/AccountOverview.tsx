import { ClipboardList, FileText, UserRound } from "lucide-react";

type AccountUser = {
  name: string;
  email: string;
  role: string;
};

export function AccountOverview({ user }: { user: AccountUser }) {
  return (
    <div className="account-page container-shell">
      <header className="account-heading">
        <span className="eyebrow">Minha conta</span>
        <h1>Olá, {user.name}</h1>
        <p>Acompanhe seus pedidos e mantenha seus dados atualizados.</p>
      </header>

      <div className="account-grid">
        <section className="account-card" aria-labelledby="orders-title">
          <ClipboardList aria-hidden="true" />
          <h2 id="orders-title">Pedidos</h2>
          <p>Nenhum pedido por enquanto.</p>
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
