"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

const post = async (body: object) => {
  const response = await fetch("/api/backoffice/profissionais", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({})) as { link?: string; message?: string };
  if (!response.ok) throw new Error(data.message ?? "Não foi possível concluir.");
  return data;
};

/** Link geral de cadastro profissional (tabela de Revelação Profissional): o mesmo para todos, até a equipe trocar. */
export function ProfessionalInvite() {
  const [link, setLink] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function load(novo = false) {
    if (novo && !window.confirm("Trocar o link? O link atual para de funcionar para quem ainda não se cadastrou.")) return;
    setBusy(true); setMessage("");
    try {
      setLink((await post({ action: "convite", novo })).link ?? null);
      if (novo) setMessage("Link trocado.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Erro."); }
    setBusy(false);
  }
  const text = link ? [
    "Olá! Aqui é da *Fare Foto*.",
    "Agora você pode enviar as fotos dos seus trabalhos direto pelo nosso site, com a tabela de *Revelação Profissional*.",
    "Pelo site as fotos chegam na qualidade original, sem a compressão do WhatsApp, e já com tamanho, papel e corte escolhidos por você. Assim elas saem *mais rápido e sem erros*.",
    `Faça seu cadastro por este link:\n${link}`,
    `Depois é só entrar em ${new URL(link).origin}/produtos/revelacao-de-fotos e enviar. Qualquer dúvida, é só chamar aqui!`,
  ].join("\n\n") : "";
  return (
    <div className="cl-invite">
      <button className="kb-secondary" disabled={busy} onClick={() => load()} type="button">{busy ? "Carregando…" : "Link para profissionais"}</button>
      {link ? (
        <div className="cl-invite-link">
          <input aria-label="Link do convite" readOnly value={link} onFocus={(event) => event.currentTarget.select()} />
          <button className="kb-secondary" onClick={async () => { try { await navigator.clipboard.writeText(link); setMessage("Link copiado."); } catch { setMessage("Selecione o link para copiar."); } }} type="button">Copiar</button>
          <a className="kb-secondary" href={`https://wa.me/?text=${encodeURIComponent(text)}`} rel="noreferrer" target="_blank">Enviar no WhatsApp</a>
          <button className="qe-btn-text" disabled={busy} onClick={() => load(true)} type="button">Trocar link</button>
          <small>Link geral: quem se cadastrar por ele entra na tabela profissional. Se vazar, troque o link.</small>
        </div>
      ) : null}
      {message ? <small role="status">{message}</small> : null}
    </div>
  );
}

/** Liga/desliga a tabela profissional de uma conta do site. */
export function ProfessionalToggle({ customerRef, professional }: { customerRef: string; professional: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function toggle() {
    setBusy(true); setMessage("");
    try { await post({ action: "marcar", ref: customerRef, on: !professional }); router.refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "Erro."); }
    setBusy(false);
  }
  return (
    <p className="cl-pro">
      {professional ? <strong className="cl-badge">Cliente profissional</strong> : <span>Tabela normal</span>}
      <button className="qe-btn-text" disabled={busy} onClick={toggle} type="button">{professional ? "Tirar tabela profissional" : "Usar tabela profissional"}</button>
      {message ? <small role="status">{message}</small> : null}
    </p>
  );
}
