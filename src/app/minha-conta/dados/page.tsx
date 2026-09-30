import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountProfile } from "@/components/account/AccountProfile";
import { getCurrentSession } from "@/lib/auth/server";

export const metadata: Metadata = { title: "Dados pessoais" };

export default async function AccountProfilePage() {
  const session = await getCurrentSession();
  if (!session) redirect("/entrar");

  return (
    <>
      <header className="account-content-heading">
        <h1>Dados pessoais</h1>
        <p>Informações da sua conta na Fare Foto.</p>
      </header>
      <AccountProfile user={{ name: session.user.name, email: session.user.email }} />
    </>
  );
}
