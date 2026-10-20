"use client";
import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const CONSENT_KEY = "fare-cookies";
const CONSENT_EVENT = "fare-cookies-change";
type Choice = "aceito" | "recusado" | null;

/** Escolha guardada no navegador (o servidor não sabe: "carregando" até abrir no navegador). */
function readChoice(): Choice {
  try {
    const saved = localStorage.getItem(CONSENT_KEY);
    return saved === "aceito" || saved === "recusado" ? saved : null;
  } catch {
    return null;
  }
}
function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CONSENT_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CONSENT_EVENT, onChange);
  };
}

declare global {
  interface Window { fbq?: (...args: unknown[]) => void }
}

/**
 * Google Analytics 4 e Meta Pixel, carregados só depois que o visitante aceita os cookies (LGPD).
 * Sem ids configurados no servidor, nada aparece (nem o aviso).
 */
export function Analytics({ gaId, pixelId }: { gaId: string | null; pixelId: string | null }) {
  const stored = useSyncExternalStore(subscribe, readChoice, () => "carregando" as const);
  // Navegador sem armazenamento: a escolha vale só nesta visita.
  const [thisVisit, setThisVisit] = useState<Choice>(null);
  const choice = thisVisit ?? stored;
  const pathname = usePathname();
  const firstPage = useRef(true);

  // Meta Pixel conta cada página aberta pelo menu (a primeira já sai no próprio script); o GA4 conta sozinho.
  useEffect(() => {
    if (choice !== "aceito") return;
    if (firstPage.current) { firstPage.current = false; return; }
    window.fbq?.("track", "PageView");
  }, [pathname, choice]);

  if (!gaId && !pixelId) return null;

  function decide(value: "aceito" | "recusado") {
    try { localStorage.setItem(CONSENT_KEY, value); } catch { /* vale só nesta visita */ }
    setThisVisit(value);
    window.dispatchEvent(new Event(CONSENT_EVENT));
  }

  return (
    <>
      {choice === "aceito" && gaId ? (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`} strategy="afterInteractive" />
          <Script id="ga4" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config',${JSON.stringify(gaId)});`}
          </Script>
        </>
      ) : null}
      {choice === "aceito" && pixelId ? (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init',${JSON.stringify(pixelId)});fbq('track','PageView');`}
        </Script>
      ) : null}
      {choice === null ? (
        <div className="cookie-banner" role="region" aria-label="Aviso de cookies">
          <p>Usamos cookies do Google e da Meta para entender as visitas e melhorar nossos anúncios. Você escolhe. <a href="/privacidade">Saiba mais</a></p>
          <div>
            <button className="button button-secondary" onClick={() => decide("recusado")} type="button">Recusar</button>
            <button className="button button-primary" onClick={() => decide("aceito")} type="button">Aceitar</button>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** "Mudar minha escolha": apaga a escolha e recarrega; o aviso de cookies aparece de novo. */
export function CookieChoiceReset() {
  return (
    <button
      className="button button-secondary"
      onClick={() => {
        try { localStorage.removeItem(CONSENT_KEY); } catch { /* sem armazenamento: nada guardado */ }
        window.location.reload(); // recarrega para descarregar o Google e a Meta, se estavam aceitos
      }}
      type="button"
    >
      Mudar minha escolha de cookies
    </button>
  );
}
