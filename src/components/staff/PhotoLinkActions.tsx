"use client";

import { useState } from "react";
import { Copy, ExternalLink, ImagePlus, MessageCircle } from "lucide-react";

/** Link das fotos do orçamento/pedido: o cliente anexa, recorta, escolhe papel e quantidades e envia. */
export function PhotoLinkActions({ kind, id }: { kind: "quote" | "order"; id: string }) {
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create(): Promise<{ url: string; message: string; whatsappUrl: string | null }> {
    const response = await fetch("/api/backoffice/fotos-link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, id }),
    });
    const data = (await response.json()) as { url: string; message: string; whatsappUrl: string | null; error?: string };
    if (!response.ok) throw new Error(data.error ?? "Não foi possível gerar o link.");
    return data;
  }

  async function run(mode: "whatsapp" | "copy" | "open") {
    // Abre a aba já no clique (senão o navegador bloqueia o pop-up depois do await).
    const tab = mode !== "copy" ? window.open("about:blank", "_blank") : null;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const link = await create();
      if (mode === "open" && tab) {
        tab.location.href = link.url;
        return;
      }
      if (mode === "whatsapp" && link.whatsappUrl && tab) {
        tab.location.href = link.whatsappUrl;
        return;
      }
      tab?.close();
      await navigator.clipboard.writeText(mode === "copy" ? link.url : link.message);
      setInfo(mode === "copy" ? "Link copiado." : "Cliente sem WhatsApp cadastrado: a mensagem com o link foi copiada.");
    } catch (caught) {
      tab?.close();
      setError(caught instanceof Error ? caught.message : "Erro inesperado.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="kb-proposal">
      <div className="kb-proposal-head">
        <h3><ImagePlus aria-hidden="true" size={15} /> Link das fotos</h3>
        <span>O cliente envia, recorta e escolhe o papel</span>
      </div>
      <div className="kb-proposal-actions">
        <button className="kb-secondary" disabled={busy} onClick={() => run("copy")} type="button"><Copy aria-hidden="true" size={15} /> Copiar link</button>
        <button className="kb-secondary" disabled={busy} onClick={() => run("open")} type="button"><ExternalLink aria-hidden="true" size={15} /> Abrir link</button>
        <button className="kb-proposal-send" disabled={busy} onClick={() => run("whatsapp")} type="button"><MessageCircle aria-hidden="true" size={15} /> {busy ? "Gerando…" : "Enviar link no WhatsApp"}</button>
      </div>
      <p className="kb-proposal-hint">Quando o cliente enviar, as quantidades e o papel escolhidos atualizam este documento e as fotos vão para a pasta Pedidos.</p>
      {info ? <p className="kb-proposal-hint">{info}</p> : null}
      {error ? <p className="kb-dialog-warning" role="alert">{error}</p> : null}
    </section>
  );
}
