/**
 * Banco de dados — SQLite embutido no Node (módulo `node:sqlite`, sem
 * dependência externa). O arquivo fica em dados/sistema.db.
 *
 * Modelo: UMA linha por proposta, com as mesmas colunas da planilha da
 * operação. O campo `status_atual` é a única fonte de verdade sobre a etapa —
 * não existem tabelas separadas por etapa.
 */

import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
export const CAMINHO_BANCO = process.env.SISTEMA_DB
  || join(AQUI, "..", "dados", "sistema.db");

/**
 * Muda quando as colunas mudam. Se o banco na máquina for de uma versão
 * anterior, a preparação recria a partir das planilhas em vez de quebrar.
 */
export const VERSAO_ESQUEMA = 2;

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS supervisores (
  id         INTEGER PRIMARY KEY,
  nome       TEXT NOT NULL UNIQUE,
  ativo      INTEGER NOT NULL DEFAULT 1,
  criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS propostas (
  id                INTEGER PRIMARY KEY,

  -- de quem é a proposta
  supervisor_id     INTEGER REFERENCES supervisores(id),
  responsavel       TEXT NOT NULL DEFAULT '',

  -- os campos da planilha
  razao_social      TEXT NOT NULL,                -- NOME DA ESTIPULANTE
  documento         TEXT NOT NULL DEFAULT '',     -- CNPJ/CPF, só dígitos
  documento_exibido TEXT NOT NULL DEFAULT '',     -- como aparece pro usuário
  numero_proposta   TEXT NOT NULL DEFAULT '',     -- PROPOSTA
  operadora         TEXT NOT NULL DEFAULT '',
  corretor          TEXT NOT NULL DEFAULT '',
  valor             REAL,
  data_proposta     TEXT,                         -- EMISSÃO (AAAA-MM-DD)
  data_validade     TEXT,                         -- VALIDADE
  cadastrado        TEXT NOT NULL DEFAULT '',     -- CADASTRADO ("SIM", "NA PASTA 17/08"…)
  observacoes       TEXT NOT NULL DEFAULT '',

  -- etapa: a única fonte de verdade
  status_atual      TEXT NOT NULL DEFAULT 'nova',
  pendencia_tipo    TEXT NOT NULL DEFAULT '',
  pendencia_detalhe TEXT NOT NULL DEFAULT '',

  -- rastro da planilha de origem
  situacao_origem   TEXT NOT NULL DEFAULT '',     -- SITUAÇÃO como estava escrita
  origem_arquivo    TEXT NOT NULL DEFAULT '',
  origem_aba        TEXT NOT NULL DEFAULT '',
  chave_natural     TEXT NOT NULL DEFAULT '',

  criado_em         TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em     TEXT NOT NULL DEFAULT (datetime('now')),

  -- coluna pronta para a busca global (preenchida pela aplicação)
  busca             TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS ix_propostas_status     ON propostas(status_atual);
CREATE INDEX IF NOT EXISTS ix_propostas_supervisor ON propostas(supervisor_id);
CREATE INDEX IF NOT EXISTS ix_propostas_documento  ON propostas(documento);
CREATE INDEX IF NOT EXISTS ix_propostas_data       ON propostas(data_proposta);
CREATE UNIQUE INDEX IF NOT EXISTS ux_propostas_chave
  ON propostas(chave_natural) WHERE chave_natural <> '';

-- Histórico automático: escrito pela aplicação a cada alteração relevante.
CREATE TABLE IF NOT EXISTS historico (
  id           INTEGER PRIMARY KEY,
  proposta_id  INTEGER NOT NULL REFERENCES propostas(id) ON DELETE CASCADE,
  quando       TEXT NOT NULL DEFAULT (datetime('now')),
  tipo         TEXT NOT NULL,        -- 'criacao' | 'status' | 'pendencia' | 'edicao' | 'importacao'
  de           TEXT NOT NULL DEFAULT '',
  para         TEXT NOT NULL DEFAULT '',
  motivo       TEXT NOT NULL DEFAULT '',
  descricao    TEXT NOT NULL DEFAULT '',
  autor        TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_historico_proposta ON historico(proposta_id, id DESC);
`;

let bancoAberto = null;

export function abrirBanco() {
  if (bancoAberto) return bancoAberto;
  mkdirSync(dirname(CAMINHO_BANCO), { recursive: true });
  const db = new DatabaseSync(CAMINHO_BANCO);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(ESQUEMA);
  bancoAberto = db;
  return db;
}

export function fecharBanco() {
  if (bancoAberto) {
    bancoAberto.close();
    bancoAberto = null;
  }
}

/** true quando o banco no disco é de uma versão anterior das colunas. */
export function esquemaDesatualizado(db) {
  const colunas = db.prepare("PRAGMA table_info(propostas)").all().map((c) => c.name);
  return !colunas.includes("cadastrado");
}

/** Busca (ou cria) o supervisor pelo nome. Nome é a identidade do supervisor. */
export function supervisorPorNome(db, nome) {
  const limpo = String(nome || "").trim().toUpperCase();
  if (!limpo) return null;
  const achado = db.prepare("SELECT * FROM supervisores WHERE nome = ?").get(limpo);
  if (achado) return achado;
  db.prepare("INSERT INTO supervisores (nome) VALUES (?)").run(limpo);
  return db.prepare("SELECT * FROM supervisores WHERE nome = ?").get(limpo);
}

/** Registra uma linha de histórico. Chamado pela aplicação, nunca pelo usuário. */
export function registrarHistorico(db, propostaId, evento) {
  db.prepare(`
    INSERT INTO historico (proposta_id, tipo, de, para, motivo, descricao, autor)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    propostaId,
    evento.tipo,
    evento.de ?? "",
    evento.para ?? "",
    evento.motivo ?? "",
    evento.descricao ?? "",
    evento.autor ?? "",
  );
}
