"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { staffAuthClient } from "@/lib/staff/client";

const ROLE_LABELS: Record<string, string> = { admin: "Administrador", vendedor: "Vendedor" };

/** Barra do topo da área da equipe: marca, quem está logado e Sair. Sem nada da loja. */
export function StaffTopbar({ name, role }: { name: string; role: string }) {
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
        <div className="staff-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="Fare Foto" height={50} src="/images/fare-foto-logo-slogan.svg" width={92} />
          <span>Equipe</span>
        </div>
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
