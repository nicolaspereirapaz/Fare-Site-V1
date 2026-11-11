/** Pedido de registro de evento de cancelamento (e101101), leiaute pedRegEvento v1.01. Módulo puro. */
import { horaBrasilia, PRESTADOR } from "./dps";

export const MOTIVOS_CANCELAMENTO = { "1": "Erro na emissão", "2": "Serviço não prestado", "9": "Outros" } as const;
export type MotivoCancelamento = keyof typeof MOTIVOS_CANCELAMENTO;

const esc = (s: string) => s.trim().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

export function montarCancelamento(d: { ambiente: 1 | 2; chave: string; cMotivo: MotivoCancelamento; xMotivo: string; quando: Date }) {
  const { dhEmi } = horaBrasilia(d.quando);
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<pedRegEvento xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01">` +
    // Id = "PRE" + chave (50) + código do evento (6).
    `<infPedReg Id="PRE${d.chave}101101">` +
    `<tpAmb>${d.ambiente}</tpAmb><verAplic>FareNFSe-0.1</verAplic><dhEvento>${dhEmi}</dhEvento>` +
    `<CNPJAutor>${PRESTADOR.cnpj}</CNPJAutor><chNFSe>${d.chave}</chNFSe>` +
    `<e101101><xDesc>Cancelamento de NFS-e</xDesc><cMotivo>${d.cMotivo}</cMotivo><xMotivo>${esc(d.xMotivo)}</xMotivo></e101101>` +
    `</infPedReg></pedRegEvento>`
  );
}
