import { erroCompetencia, idDps, montarDps, SERVICOS, so, type ServicoId, type Tomador } from "./dps";
import { liberarNumero, marcarCancelada, marcarEmitida, marcarIncerta, reservarNumero, salvarCliente, xmlDaNota } from "./db";
import { montarCancelamento, MOTIVOS_CANCELAMENTO, type MotivoCancelamento } from "./evento";
import { ambiente, assinar, consultarDps, enviarDps, enviarEvento } from "./sefin";

/** competencia: AAAA-MM-DD; vazia = dia da emissão. */
export type Pedido = { servico: ServicoId; descricao: string; valorCentavos: number; tomador?: Tomador; competencia?: string };

/** 1 min para trás: a Sefin rejeita emissão "no futuro" se o relógio do PC estiver adiantado (E0008). */
const agoraEmissao = () => new Date(Date.now() - 60_000);

export type Resultado =
  | { ok: true; chave: string; nNFSe?: string; numeroDps: number }
  | { ok: false; erros: string[] };

/** Confere o que veio da tela antes de gastar um número de DPS. */
export function validarPedido(p: Partial<Pedido>): string[] {
  const erros: string[] = [];
  if (!p.servico || !(p.servico in SERVICOS)) erros.push("Escolha o serviço.");
  if (!p.descricao?.trim()) erros.push("Preencha a descrição.");
  else if (p.descricao.length > 2000) erros.push("Descrição muito longa (máx. 2000 caracteres).");
  if (!Number.isInteger(p.valorCentavos) || (p.valorCentavos ?? 0) <= 0) erros.push("Valor inválido.");
  if (p.competencia != null && p.competencia !== "") {
    const erro = typeof p.competencia === "string" ? erroCompetencia(p.competencia, agoraEmissao()) : "Data de competência inválida.";
    if (erro) erros.push(erro);
  }
  if (p.tomador) {
    const doc = so(p.tomador.doc ?? "");
    if (doc.length !== 11 && doc.length !== 14) erros.push("CPF/CNPJ do cliente deve ter 11 ou 14 dígitos.");
    if (!p.tomador.nome?.trim()) erros.push("Preencha o nome do cliente.");
  }
  return erros;
}

/** emitidaPor: nome de quem da equipe emitiu (fica no histórico). */
export async function emitir(p: Pedido, emitidaPor?: string): Promise<Resultado> {
  const erros = validarPedido(p);
  if (erros.length) return { ok: false, erros };

  const amb = ambiente();
  const serie = process.env.NFSE_SERIE?.trim() || "1";
  const pTot = process.env.NFSE_PTOTTRIB_SN?.trim();
  const tomador = p.tomador ? { ...p.tomador, doc: so(p.tomador.doc) } : undefined;

  const reserva = reservarNumero(
    { ambiente: amb, serie, servico: p.servico, descricao: p.descricao, valorCentavos: p.valorCentavos, tomadorNome: tomador?.nome, emitidaPor },
    (n) => idDps(serie, n),
  );
  const { id, xml } = montarDps({
    ambiente: amb, serie, numero: reserva.numero,
    emissao: agoraEmissao(),
    competencia: p.competencia || undefined,
    servico: p.servico, descricao: p.descricao, valorCentavos: p.valorCentavos, tomador,
    pTotTribSN: pTot ? Number(pTot.replace(",", ".")) : undefined,
  });

  let assinado: string;
  try {
    assinado = assinar(xml);
  } catch (e) {
    liberarNumero(reserva.id);
    return { ok: false, erros: [(e as Error).message] };
  }

  try {
    const r = await enviarDps(assinado);
    if (!r.ok) {
      liberarNumero(reserva.id);
      return { ok: false, erros: r.erros };
    }
    marcarEmitida(reserva.id, r.chave, r.nNFSe, r.xmlNfse);
    if (tomador) salvarCliente(tomador);
    return { ok: true, chave: r.chave, nNFSe: r.nNFSe, numeroDps: reserva.numero };
  } catch (e) {
    // Erro de rede: a nota pode ter sido gerada mesmo assim. Pergunta antes de liberar o número.
    const chave = await consultarDps(id).catch(() => undefined);
    if (chave) {
      marcarEmitida(reserva.id, chave);
      if (tomador) salvarCliente(tomador);
      return { ok: true, chave, numeroDps: reserva.numero };
    }
    if (chave === null) liberarNumero(reserva.id);
    else marcarIncerta(reserva.id);
    return { ok: false, erros: [`Falha de comunicação: ${(e as Error).message}`, chave === null ? "A nota não foi gerada. Pode tentar de novo." : "Não deu para confirmar se a nota saiu. Confira no portal antes de tentar de novo."] };
  }
}

/** Cancela uma NFS-e emitida (evento e101101). O motivo escrito precisa de 15 a 255 caracteres. */
export async function cancelar(chave: string, cMotivo: MotivoCancelamento, xMotivo: string): Promise<{ ok: true } | { ok: false; erros: string[] }> {
  const motivo = xMotivo?.trim() ?? "";
  if (!(cMotivo in MOTIVOS_CANCELAMENTO)) return { ok: false, erros: ["Escolha o motivo do cancelamento."] };
  if (motivo.length < 15 || motivo.length > 255) return { ok: false, erros: ["Explique o motivo com 15 a 255 caracteres."] };
  const nota = xmlDaNota(chave);
  if (!nota) return { ok: false, erros: ["Nota não encontrada neste emissor."] };
  if (nota.cancelada) return { ok: false, erros: ["Esta nota já está cancelada."] };

  let assinado: string;
  try {
    assinado = assinar(montarCancelamento({ ambiente: ambiente(), chave, cMotivo, xMotivo: motivo, quando: new Date(Date.now() - 60_000) }), "infPedReg");
  } catch (e) {
    return { ok: false, erros: [(e as Error).message] };
  }
  try {
    const r = await enviarEvento(chave, assinado);
    if (!r.ok) return { ok: false, erros: r.erros };
    marcarCancelada(chave, r.xmlEvento);
    return { ok: true };
  } catch (e) {
    return { ok: false, erros: [`Falha de comunicação: ${(e as Error).message}`, "Confira no portal se a nota foi cancelada antes de tentar de novo."] };
  }
}
