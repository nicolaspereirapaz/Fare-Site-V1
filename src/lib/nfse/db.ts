import type { DatabaseSync } from "node:sqlite";
import { database } from "@/lib/auth";
import type { Tomador } from "./dps";

/** Tabelas do emissor de NFS-e no banco do site. Migração idempotente no primeiro acesso, como o resto do site. */
let migrado = false;
function banco(): DatabaseSync {
  if (migrado) return database;
  database.exec(`
    CREATE TABLE IF NOT EXISTS fare_nfse_tomadores (doc TEXT PRIMARY KEY, dados TEXT NOT NULL, atualizado_em TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS fare_nfse_notas (
      id INTEGER PRIMARY KEY,
      ambiente INTEGER NOT NULL,
      serie TEXT NOT NULL,
      numero INTEGER NOT NULL,
      id_dps TEXT NOT NULL,
      servico TEXT NOT NULL,
      descricao TEXT NOT NULL,
      valor_centavos INTEGER NOT NULL,
      tomador_nome TEXT,
      status TEXT NOT NULL,
      chave TEXT,
      n_nfse TEXT,
      xml_nfse TEXT,
      xml_evento TEXT,
      emitida_por TEXT,
      criado_em TEXT NOT NULL,
      UNIQUE (ambiente, serie, numero)
    );`);
  migrado = true;
  return database;
}

export function buscarTomadorSalvo(doc: string): Tomador | null {
  const row = banco().prepare("SELECT dados FROM fare_nfse_tomadores WHERE doc = ?").get(doc) as { dados: string } | undefined;
  return row ? (JSON.parse(row.dados) as Tomador) : null;
}

export function salvarCliente(t: Tomador) {
  banco().prepare("INSERT INTO fare_nfse_tomadores (doc, dados, atualizado_em) VALUES (?, ?, ?) ON CONFLICT(doc) DO UPDATE SET dados = excluded.dados, atualizado_em = excluded.atualizado_em")
    .run(t.doc, JSON.stringify(t), new Date().toISOString());
}

type NovaNota = { ambiente: number; serie: string; servico: string; descricao: string; valorCentavos: number; tomadorNome?: string; emitidaPor?: string };

/**
 * Reserva o próximo número da DPS antes de enviar, para dois envios nunca usarem o mesmo número.
 * Também libera o número se a nota for rejeitada (liberarNumero).
 */
export function reservarNumero(n: NovaNota, idDps: (numero: number) => string) {
  const d = banco();
  d.exec("BEGIN IMMEDIATE");
  try {
    const { proximo } = d.prepare("SELECT COALESCE(MAX(numero), 0) + 1 AS proximo FROM fare_nfse_notas WHERE ambiente = ? AND serie = ?").get(n.ambiente, n.serie) as { proximo: number };
    const { lastInsertRowid } = d.prepare(
      "INSERT INTO fare_nfse_notas (ambiente, serie, numero, id_dps, servico, descricao, valor_centavos, tomador_nome, status, emitida_por, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'enviando', ?, ?)",
    ).run(n.ambiente, n.serie, proximo, idDps(proximo), n.servico, n.descricao, n.valorCentavos, n.tomadorNome ?? null, n.emitidaPor ?? null, new Date().toISOString());
    d.exec("COMMIT");
    return { id: Number(lastInsertRowid), numero: proximo };
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}

export function marcarEmitida(id: number, chave: string, nNFSe?: string, xmlNfse?: string) {
  banco().prepare("UPDATE fare_nfse_notas SET status = 'emitida', chave = ?, n_nfse = ?, xml_nfse = ? WHERE id = ?").run(chave, nNFSe ?? null, xmlNfse ?? null, id);
}

/** Rejeitada: a DPS não virou nota, então o número pode ser reaproveitado. */
export function liberarNumero(id: number) {
  banco().prepare("DELETE FROM fare_nfse_notas WHERE id = ?").run(id);
}

/** Sem resposta e sem confirmação: o número fica preso até alguém conferir no portal. */
export function marcarIncerta(id: number) {
  banco().prepare("UPDATE fare_nfse_notas SET status = 'incerta' WHERE id = ?").run(id);
}

export function xmlDaNota(chave: string) {
  const row = banco().prepare("SELECT xml_nfse, status FROM fare_nfse_notas WHERE chave = ?").get(chave) as { xml_nfse: string | null; status: string } | undefined;
  return row?.xml_nfse ? { xml: row.xml_nfse, cancelada: row.status === "cancelada" } : null;
}

export function marcarCancelada(chave: string, xmlEvento: string) {
  banco().prepare("UPDATE fare_nfse_notas SET status = 'cancelada', xml_evento = ? WHERE chave = ?").run(xmlEvento, chave);
}

export type NotaLista = {
  id: number; ambiente: number; numero: number; servico: string; descricao: string; valor_centavos: number;
  tomador_nome: string | null; status: string; chave: string | null; n_nfse: string | null; emitida_por: string | null; criado_em: string;
};

export function ultimasNotas(limite = 50) {
  return banco().prepare("SELECT id, ambiente, numero, servico, descricao, valor_centavos, tomador_nome, status, chave, n_nfse, emitida_por, criado_em FROM fare_nfse_notas ORDER BY id DESC LIMIT ?").all(limite) as NotaLista[];
}
