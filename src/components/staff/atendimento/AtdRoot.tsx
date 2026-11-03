import { cookies } from "next/headers";
import { THEME_COOKIE } from "@/lib/atendimento/themeCookie";

/** Envolve as páginas do Atendimento (topo + conteúdo) e aplica o tema escolhido (claro/escuro). */
export async function AtdRoot({ children }: { children: React.ReactNode }) {
  const dark = (await cookies()).get(THEME_COOKIE)?.value === "escuro";
  return (
    <div className="atd-root" data-atd-theme={dark ? "dark" : "light"}>
      {children}
    </div>
  );
}
