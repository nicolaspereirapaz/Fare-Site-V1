import { redirect } from "next/navigation";
import { AccountNav } from "@/components/account/AccountNav";
import { getCurrentSession } from "@/lib/auth/server";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession();
  if (!session) redirect("/entrar");

  return (
    <section className="account-section">
      <div className="account-shell container-shell">
        <aside className="account-sidebar">
          <div className="account-hello">
            <strong>Olá, {session.user.name.split(" ")[0]}</strong>
          </div>
          <AccountNav />
        </aside>
        <div className="account-content">{children}</div>
      </div>
    </section>
  );
}
