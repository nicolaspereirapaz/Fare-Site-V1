import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountProfileForm } from "@/components/account/AccountProfileForm";
import { isProfileComplete } from "@/lib/account/profile";
import { getCustomerProfile } from "@/lib/account/profileRepository";
import { database } from "@/lib/auth";
import { getCurrentSession } from "@/lib/auth/server";

export const metadata: Metadata = { title: "Dados pessoais" };

export default async function AccountProfilePage() {
  const session = await getCurrentSession();
  if (!session) redirect("/entrar");
  const profile = { ...getCustomerProfile(database, session.user.id), name: session.user.name };
  const complete = isProfileComplete(profile);

  return (
    <>
      <header className="account-content-heading">
        <h1>Dados pessoais</h1>
        <p>Cadastro de pessoa física (CPF) ou jurídica (CNPJ), usado nos seus pedidos e na nota fiscal.</p>
      </header>
      {!complete ? (
        <p className="profile-incomplete">Complete seu cadastro para agilizar seus pedidos.</p>
      ) : null}
      <AccountProfileForm initial={{ ...profile, email: session.user.email, complete }} />
    </>
  );
}
