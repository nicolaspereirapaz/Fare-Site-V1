"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { CustomerPicker } from "@/components/staff/QuoteEditor";
import type { Customer } from "@/components/staff/quoteEditorShared";
import { formatCep } from "@/lib/account/documents";
import { centavos, horaBrasilia, SERVICOS, type ServicoId, type Tomador } from "@/lib/nfse/dps";
import { MOTIVOS_CANCELAMENTO, type MotivoCancelamento } from "@/lib/nfse/evento";
import type { NotaLista } from "@/lib/nfse/db";

const JUNDIAI = "3525904";
const VAZIO = { doc: "", nome: "", cep: "", cMun: JUNDIAI, logradouro: "", numero: "", complemento: "", bairro: "", email: "", fone: "" };
type Campos = typeof VAZIO;
type Modo = "cadastro" | "documento" | "nenhum";

const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
const STATUS: Record<string, string> = { emitida: "Emitida", cancelada: "Cancelada", incerta: "Conferir no portal", enviando: "Enviando" };
const ORIGEM: Record<string, string> = {
  cadastro: "Dados do cadastro do site. Confira antes de emitir.",
  historico: "Cliente de nota anterior.",
  receita: "Dados da Receita Federal. Confira antes de emitir.",
};

function paraCampos(t: Tomador): Campos {
  return { ...VAZIO, ...Object.fromEntries(Object.entries(t).filter(([, v]) => v != null && v !== "")) } as Campos;
}

/** Endereço pelo CEP (ViaCEP). Diferente do lookupCep do cadastro, traz o código IBGE da cidade, que a nota exige. */
async function enderecoPorCep(cep: string) {
  const r = await fetch(`https://viacep.com.br/ws/${cep.replace(/\D/g, "")}/json/`).catch(() => null);
  const j = r?.ok ? ((await r.json().catch(() => null)) as { erro?: unknown; logradouro?: string; bairro?: string; localidade?: string; uf?: string; ibge?: string } | null) : null;
  return j && !j.erro && j.ibge ? j : null;
}

async function pedirJson<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: "no-store", ...init });
  return (await r.json()) as T;
}

export function NfseEmissor({ ambiente }: { ambiente: 1 | 2 }) {
  const [notas, setNotas] = useState<NotaLista[]>([]);
  const [servico, setServico] = useState<ServicoId>("impressao");
  const [descricao, setDescricao] = useState<string>(SERVICOS.impressao.descricao);
  const [valor, setValor] = useState("");
  /** AAAA-MM-DD; vazio = hoje. */
  const [competencia, setCompetencia] = useState("");
  const [modo, setModo] = useState<Modo>("cadastro");
  const [escolhido, setEscolhido] = useState<Customer | null>(null);
  const [cli, setCli] = useState<Campos>(VAZIO);
  const [aviso, setAviso] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erros, setErros] = useState<string[]>([]);
  const [ok, setOk] = useState<{ chave: string; nNFSe?: string } | null>(null);
  const [cancelando, setCancelando] = useState<string | null>(null);
  const [cepInfo, setCepInfo] = useState<string | null>(null);
  /** Último CPF/CNPJ consultado: não repete a busca a cada tecla. */
  const buscado = useRef("");

  const recarregar = useCallback(async () => {
    const j = await pedirJson<{ notas?: NotaLista[] }>("/api/equipe/nfse").catch(() => ({ notas: [] }));
    setNotas(j.notas ?? []);
  }, []);
  useEffect(() => {
    let ativo = true;
    pedirJson<{ notas?: NotaLista[] }>("/api/equipe/nfse").then((j) => ativo && setNotas(j.notas ?? [])).catch(() => undefined);
    return () => { ativo = false; };
  }, []);

  const digitos = cli.doc.replace(/\D/g, "");
  const docValido = digitos.length === 11 || digitos.length === 14;
  const mostraCliente = modo === "documento" ? docValido : modo === "cadastro" && escolhido != null;

  function limparCliente() {
    buscado.current = "";
    setEscolhido(null);
    setCli(VAZIO);
    setAviso(null);
    setCepInfo(null);
  }

  async function trocarCep(bruto: string) {
    const cep = formatCep(bruto);
    setCli((c) => ({ ...c, cep }));
    setCepInfo(null);
    if (cep.length !== 9) return;
    setCepInfo("Buscando endereço…");
    const e = await enderecoPorCep(cep);
    if (!e) return setCepInfo("CEP não encontrado; preencha abaixo.");
    setCepInfo(`${e.localidade}/${e.uf}`);
    // CEP geral da cidade vem sem rua/bairro: não apaga o que já foi digitado.
    setCli((c) => (c.cep === cep ? { ...c, cMun: e.ibge!, logradouro: e.logradouro || c.logradouro, bairro: e.bairro || c.bairro } : c));
  }

  function trocarModo(m: Modo) {
    setModo(m);
    limparCliente();
  }

  function trocarServico(s: ServicoId) {
    // Só troca a descrição se ela ainda for a padrão do serviço anterior.
    if (descricao === SERVICOS[servico].descricao) setDescricao(SERVICOS[s].descricao);
    setServico(s);
  }

  async function escolherCliente(c: Customer) {
    setEscolhido(c);
    setBuscando(true);
    const j = await pedirJson<{ origem: string | null; tomador: Tomador | null }>(`/api/equipe/nfse/tomador?ref=${encodeURIComponent(c.ref)}`).catch(() => ({ origem: null, tomador: null }));
    setBuscando(false);
    if (!j.tomador) return setAviso("Não consegui ler esse cadastro. Digite os dados abaixo.");
    setCli(paraCampos(j.tomador));
    setAviso(j.tomador.doc ? ORIGEM[j.origem ?? ""] ?? null : "Este cadastro não tem CPF/CNPJ. Digite abaixo para emitir no nome dele.");
  }

  /** Digitou o CPF/CNPJ: completo, já busca (histórico do emissor; CNPJ também na Receita). */
  function trocarDoc(bruto: string) {
    setCli((c) => ({ ...c, doc: bruto }));
    const doc = bruto.replace(/\D/g, "");
    // No cadastro, CPF já vem com o nome da pessoa: só o CNPJ busca (nota no nome da empresa).
    if (doc.length === 14 || (doc.length === 11 && modo === "documento")) void buscarDocumento(doc);
  }

  async function buscarDocumento(doc = digitos) {
    if ((doc.length !== 11 && doc.length !== 14) || buscado.current === doc) return;
    buscado.current = doc;
    setAviso(null);
    setBuscando(true);
    const j = await pedirJson<{ origem: string | null; tomador: Tomador | null }>(`/api/equipe/nfse/tomador?doc=${doc}`).catch(() => ({ origem: null, tomador: null }));
    setBuscando(false);
    const atual = (c: Campos) => c.doc.replace(/\D/g, "") === doc;
    if (modo === "cadastro") {
      if (!j.tomador) return setAviso("CNPJ não encontrado na Receita: preencha os dados.");
      const t = paraCampos(j.tomador);
      // Empresa do cliente do cadastro: nome e endereço da Receita; telefone e e-mail do cadastro, se tiver.
      setCli((c) => (atual(c) ? { ...t, doc: c.doc, email: c.email || t.email, fone: c.fone || t.fone } : c));
      return setAviso(ORIGEM[j.origem ?? ""] ?? null);
    }
    if (j.tomador) {
      const t = paraCampos(j.tomador);
      setCli((c) => (atual(c) ? { ...t, doc: c.doc } : c));
      setAviso(ORIGEM[j.origem ?? ""] ?? null);
    } else {
      setCli((c) => (atual(c) ? { ...VAZIO, doc: c.doc } : c));
      setAviso(doc.length === 11 ? "CPF novo: preencha o nome (endereço é opcional)." : "CNPJ não encontrado: preencha os dados.");
    }
  }

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErros([]);
    setOk(null);
    const valorCentavos = centavos(valor);
    if (valorCentavos == null) return setErros(["Valor inválido. Use, por exemplo, 39,90."]);
    if (modo !== "nenhum" && !docValido) return setErros(["Informe o CPF (11 dígitos) ou CNPJ (14 dígitos) do cliente, ou escolha \"Sem cliente\"."]);
    if (modo !== "nenhum" && !cli.nome.trim()) return setErros(["Preencha o nome do cliente."]);
    const dia = competencia ? ` com competência em ${competencia.split("-").reverse().join("/")}` : "";
    if (ambiente === 1 && !window.confirm(`Emitir NOTA FISCAL DE VERDADE de ${brl(valorCentavos)}${modo === "nenhum" ? " sem cliente" : ` para ${cli.nome}`}${dia}?`)) return;

    const tomador = modo === "nenhum" ? undefined : { ...Object.fromEntries(Object.entries(cli).map(([k, v]) => [k, v.trim() || undefined])), doc: digitos };
    setEnviando(true);
    try {
      const j = await pedirJson<{ ok: true; chave: string; nNFSe?: string } | { ok: false; erros: string[] }>("/api/equipe/nfse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ servico, descricao, valorCentavos, tomador, competencia }),
      });
      if (j.ok) {
        setOk({ chave: j.chave, nNFSe: j.nNFSe });
        setValor("");
        setCompetencia("");
        limparCliente();
        setDescricao(SERVICOS[servico].descricao);
      } else setErros(j.erros);
    } catch {
      setErros(["Sem resposta do servidor. Confira a lista antes de tentar de novo."]);
    } finally {
      setEnviando(false);
      void recarregar();
    }
  }

  const campo = (k: keyof Campos, rotulo: string, extra?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <label className="qe-field"><span>{rotulo}</span><input onChange={(e) => setCli({ ...cli, [k]: e.target.value })} value={cli[k]} {...extra} /></label>
  );

  return (
    <div className="qe-layout nf-layout">
      <form className="qe-card nf-form" onSubmit={enviar}>
        <h2>Nova nota</h2>

        <div className="nf-opcoes" role="group" aria-label="Serviço">
          {(Object.keys(SERVICOS) as ServicoId[]).map((s) => (
            <button aria-pressed={servico === s} key={s} onClick={() => trocarServico(s)} type="button">
              {SERVICOS[s].nome}
              <small>Cód. {SERVICOS[s].cTribNac.replace(/(\d\d)(\d\d)(\d\d)/, "$1.$2.$3")} / {SERVICOS[s].cTribMun}</small>
            </button>
          ))}
        </div>

        <fieldset className="nf-cliente">
          <legend>Cliente</legend>
          <div className="nf-abas" role="tablist" aria-label="Como informar o cliente">
            {([["cadastro", "Do cadastro"], ["documento", "Digitar CPF/CNPJ"], ["nenhum", "Sem cliente"]] as const).map(([m, rotulo]) => (
              <button aria-selected={modo === m} key={m} onClick={() => trocarModo(m)} role="tab" type="button">{rotulo}</button>
            ))}
          </div>

          {modo === "cadastro" && !escolhido ? <CustomerPicker onPick={escolherCliente} /> : null}
          {modo === "cadastro" && escolhido ? (
            <div className="qe-client">
              <div><b>{escolhido.company || escolhido.name}</b><small>{[escolhido.document, escolhido.phone, escolhido.email].filter(Boolean).join(" · ")}</small></div>
              <button className="qe-btn-text" onClick={limparCliente} type="button">Trocar</button>
            </div>
          ) : null}
          {modo === "documento" ? (
            <label className="qe-field"><span>CPF ou CNPJ</span><input autoFocus inputMode="numeric" onBlur={() => void buscarDocumento()} onChange={(e) => trocarDoc(e.target.value)} placeholder="Só números ou com pontos" value={cli.doc} /></label>
          ) : null}
          {modo === "nenhum" ? <p className="qe-hint">A nota sai sem cliente identificado (consumidor final).</p> : null}
          {buscando ? <p className="qe-hint">Buscando dados…</p> : null}
          {aviso ? <p className="qe-warn">{aviso}</p> : null}

          {mostraCliente ? (
            <div className="nf-campos">
              {modo === "cadastro" ? (
                <label className="qe-field"><span>CPF ou CNPJ</span><input inputMode="numeric" onChange={(e) => trocarDoc(e.target.value)} placeholder="CNPJ completo preenche os dados da empresa" required value={cli.doc} /></label>
              ) : null}
              {campo("nome", digitos.length === 14 ? "Razão social" : "Nome", { required: true })}
              <div className="qe-grid-3">
                <label className="qe-field">
                  <span>CEP</span>
                  <input autoComplete="postal-code" inputMode="numeric" onChange={(e) => void trocarCep(e.target.value)} placeholder="00000-000" value={cli.cep} />
                  {cepInfo ? <small className="qe-fhint">{cepInfo}</small> : null}
                </label>
                {campo("cMun", "Código IBGE da cidade", { inputMode: "numeric", title: "Jundiaí = 3525904. Preenchido sozinho pelo CEP, pelo cadastro ou pela Receita." })}
                {campo("numero", "Número")}
              </div>
              {campo("logradouro", "Rua")}
              <div className="qe-grid-3">
                {campo("complemento", "Complemento")}
                {campo("bairro", "Bairro")}
                {campo("fone", "Telefone", { inputMode: "tel" })}
              </div>
              {campo("email", "E-mail", { type: "email" })}
              <p className="qe-hint">Endereço é opcional; se for preencher, precisa de CEP, cidade, rua, número e bairro.</p>
            </div>
          ) : null}
        </fieldset>

        <label className="qe-field"><span>Descrição do serviço</span><textarea maxLength={2000} onChange={(e) => setDescricao(e.target.value)} required rows={2} value={descricao} /></label>
        <div className="nf-linha">
          <label className="qe-field"><span>Valor (R$)</span><input inputMode="decimal" onChange={(e) => setValor(e.target.value)} placeholder="0,00" required value={valor} /></label>
          <label className="qe-field">
            <span>Data de competência</span>
            <input max={horaBrasilia(new Date()).dCompet} onChange={(e) => setCompetencia(e.target.value)} type="date" value={competencia} />
            <small className="qe-fhint">Dia do serviço. Em branco: hoje.</small>
          </label>
        </div>

        {erros.length ? <ul className="nf-erros" role="alert">{erros.map((m) => <li key={m}>{m}</li>)}</ul> : null}
        {ok ? (
          <div className="nf-ok" role="status">
            Nota {ok.nNFSe ? `nº ${ok.nNFSe} ` : ""}emitida. <a href={`/api/equipe/nfse/${ok.chave}/pdf`} rel="noreferrer" target="_blank">Abrir PDF</a> · <a href={`/api/equipe/nfse/${ok.chave}/xml`}>XML</a>
            <code>{ok.chave}</code>
          </div>
        ) : null}

        <button className="qe-btn qe-btn-primary nf-emitir" disabled={enviando || buscando} type="submit">{enviando ? "Emitindo…" : ambiente === 1 ? "Emitir nota fiscal" : "Emitir nota de teste"}</button>
      </form>

      <section className="qe-card nf-lista">
        <h2>Últimas notas</h2>
        {notas.length ? (
          <ul>
            {notas.map((n) => (
              <li className={`nf-nota is-${n.status}`} key={n.id}>
                <div className="nf-nota-topo">
                  <b>{n.n_nfse ? `Nº ${n.n_nfse}` : `DPS ${n.numero}`}{n.ambiente === 2 ? " · teste" : ""}</b>
                  <span>{brl(n.valor_centavos)}</span>
                </div>
                <small>{n.tomador_nome ?? "Sem cliente"} · {SERVICOS[n.servico as ServicoId]?.nome ?? n.servico}</small>
                <small>{dataHora(n.criado_em)}{n.emitida_por ? ` · ${n.emitida_por}` : ""} · <span className="nf-status">{STATUS[n.status] ?? n.status}</span></small>
                {n.chave ? (
                  <div className="nf-acoes">
                    <a href={`/api/equipe/nfse/${n.chave}/pdf`} rel="noreferrer" target="_blank">PDF</a>
                    <a href={`/api/equipe/nfse/${n.chave}/xml`}>XML</a>
                    {n.status === "emitida" ? <button className="qe-btn-text" onClick={() => setCancelando(cancelando === n.chave ? null : n.chave)} type="button">Cancelar nota</button> : null}
                  </div>
                ) : null}
                {cancelando === n.chave && n.chave ? <Cancelamento chave={n.chave} onFeito={() => { setCancelando(null); void recarregar(); }} /> : null}
              </li>
            ))}
          </ul>
        ) : <p className="qe-hint">Nenhuma nota emitida por aqui ainda.</p>}
      </section>
    </div>
  );
}

function Cancelamento({ chave, onFeito }: { chave: string; onFeito: () => void }) {
  const [cMotivo, setCMotivo] = useState<MotivoCancelamento>("1");
  const [xMotivo, setXMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erros, setErros] = useState<string[]>([]);

  async function confirmar() {
    if (!window.confirm("Cancelar esta nota fiscal? Não dá para desfazer.")) return;
    setEnviando(true);
    setErros([]);
    const j = await pedirJson<{ ok: boolean; erros?: string[] }>(`/api/equipe/nfse/${chave}/cancelar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cMotivo, xMotivo }),
    }).catch(() => ({ ok: false, erros: ["Sem resposta do servidor. Confira no portal antes de tentar de novo."] }));
    setEnviando(false);
    if (j.ok) onFeito();
    else setErros(j.erros ?? ["Não foi possível cancelar."]);
  }

  return (
    <div className="nf-cancelar">
      <label className="qe-field"><span>Motivo</span>
        <select onChange={(e) => setCMotivo(e.target.value as MotivoCancelamento)} value={cMotivo}>
          {Object.entries(MOTIVOS_CANCELAMENTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label className="qe-field"><span>Explique (mínimo 15 letras)</span><textarea maxLength={255} onChange={(e) => setXMotivo(e.target.value)} rows={2} value={xMotivo} /></label>
      {erros.length ? <ul className="nf-erros" role="alert">{erros.map((m) => <li key={m}>{m}</li>)}</ul> : null}
      <button className="qe-btn qe-btn-secondary" disabled={enviando || xMotivo.trim().length < 15} onClick={confirmar} type="button">{enviando ? "Cancelando…" : "Confirmar cancelamento"}</button>
    </div>
  );
}
