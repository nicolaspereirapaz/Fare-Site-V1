import type { Metadata } from "next";
import { StaffInviteForm } from "@/components/staff/StaffForms";
import { staffDatabase } from "@/lib/staff/auth";
import { isStaffInviteValid } from "@/lib/staff/members";

export const metadata: Metadata = { title: "Criar senha" };

type SearchParams = Promise<{ token?: string | string[] }>;

/** Link do convite: a pessoa da equipe cria a própria senha (uso único, vale 48 h). */
export default async function StaffInvitePage({ searchParams }: { searchParams: SearchParams }) {
  const { token: raw } = await searchParams;
  const token = (Array.isArray(raw) ? raw[0] : raw) ?? null;
  // Convite vencido/usado já aparece como inválido ao abrir, sem deixar a pessoa digitar à toa.
  const valid = token !== null && isStaffInviteValid(staffDatabase, token);
  return <main className="staff-auth"><StaffInviteForm token={valid ? token : null} /></main>;
}
