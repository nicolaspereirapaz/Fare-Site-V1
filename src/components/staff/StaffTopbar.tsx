"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { staffAuthClient } from "@/lib/staff/client";

// Pedidos e Orçamentos são abas do Quadro; o menu não repete as abas.
const NAV = [["quadro", "/equipe", "Quadro"], ["clientes", "/equipe/clientes", "Clientes"]] as const;

const ROLE_LABELS: Record<string, string> = { admin: "Administrador", vendedor: "Vendedor" };

/** Barra do topo da área da equipe: marca, quem está logado e Sair. Sem nada da loja. */
/** current: item do menu da página aberta (destaca e marca aria-current). */
export function StaffTopbar({ name, role, current }: { name: string; role: string; current?: "quadro" | "clientes" }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    await staffAuthClient.signOut();
    router.push("/equipe/entrar");
    router.refresh();
  }

  return (
    <header className="staff-topbar">
      <div className="staff-topbar-inner container-shell">
        <Link className="staff-brand" href="/equipe">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="Fare Foto" height={50} src="/images/fare-foto-logo-slogan.svg" width={92} />
          <span>Equipe</span>
        </Link>
        <nav className="staff-topbar-nav" aria-label="Área da equipe">
          {NAV.map(([key, href, label]) => <Link aria-current={current === key ? "page" : undefined} href={href} key={key}>{label}</Link>)}
        </nav>
        <div className="staff-topbar-user">
          <span className="staff-topbar-name">{name}</span>
          <span className="staff-role">{ROLE_LABELS[role] ?? role}</span>
          <button className="staff-signout" disabled={pending} onClick={signOut} type="button">
            <LogOut aria-hidden="true" size={16} /> Sair
          </button>
        </div>
      </div>
    </header>
  );
}
