"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { THEME_COOKIE } from "@/lib/atendimento/themeCookie";

const root = () => (typeof document === "undefined" ? null : document.querySelector<HTMLElement>(".atd-root"));

function subscribe(onChange: () => void) {
  const element = root();
  if (!element) return () => undefined;
  const observer = new MutationObserver(onChange);
  observer.observe(element, { attributes: true, attributeFilter: ["data-atd-theme"] });
  return () => observer.disconnect();
}

const readDark = () => root()?.dataset.atdTheme === "dark";

/** Botão claro/escuro: troca na hora e guarda a escolha (cookie de 1 ano, só neste navegador). */
export function ThemeToggle({ className = "at-btn at-toolbar-btn" }: { className?: string }) {
  const dark = useSyncExternalStore(subscribe, readDark, () => false);

  function toggle() {
    const element = root();
    if (!element) return;
    const next = !dark;
    element.dataset.atdTheme = next ? "dark" : "light";
    document.cookie = `${THEME_COOKIE}=${next ? "escuro" : "claro"}; path=/equipe; max-age=31536000; samesite=lax`;
  }

  return (
    <button aria-label={dark ? "Usar tema claro" : "Usar tema escuro"} className={className} onClick={toggle} title={dark ? "Tema claro" : "Tema escuro"} type="button">
      {dark ? <Sun aria-hidden="true" size={16} /> : <Moon aria-hidden="true" size={16} />}
    </button>
  );
}
