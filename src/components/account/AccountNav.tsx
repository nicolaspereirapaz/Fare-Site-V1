"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, FileText, UserRound } from "lucide-react";
import { SignOutButton } from "@/components/SignOutButton";

const SECTIONS = [
  { href: "/minha-conta/pedidos", label: "Pedidos", icon: ClipboardList },
  { href: "/minha-conta/orcamentos", label: "Orçamentos", icon: FileText },
  { href: "/minha-conta/dados", label: "Dados pessoais", icon: UserRound },
] as const;

export function AccountNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Minha conta" className="account-nav">
      <ul>
        {SECTIONS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link aria-current={active ? "page" : undefined} className={active ? "active" : undefined} href={href}>
                <Icon aria-hidden="true" size={19} />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="account-nav-footer">
        <SignOutButton />
      </div>
    </nav>
  );
}
