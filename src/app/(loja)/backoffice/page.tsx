import { redirect } from "next/navigation";

/** O painel saiu da loja: agora fica na área da equipe, com login próprio. */
export default function OldBackofficePage() {
  redirect("/equipe");
}
