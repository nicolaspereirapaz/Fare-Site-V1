"use client";
import { useEffect, useState } from "react";

/** Cliente logado é profissional (cadastro pelo convite)? Então as fotos usam a tabela profissional. */
export function useProfessional() {
  const [pro, setPro] = useState(false);
  useEffect(() => {
    let active = true;
    fetch("/api/account/profissional", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { professional: false }))
      .then((data: { professional?: boolean }) => active && setPro(Boolean(data.professional)))
      .catch(() => undefined);
    return () => { active = false; };
  }, []);
  return pro;
}
