import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { StaffSignInForm } from "@/components/staff/StaffForms";
import { getStaffSession } from "@/lib/staff/server";

export const metadata: Metadata = { title: "Entrar" };

export default async function StaffSignInPage() {
  if (await getStaffSession()) redirect("/equipe");
  return <main className="staff-auth"><StaffSignInForm /></main>;
}
