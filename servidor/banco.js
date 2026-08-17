/**
 * Banco de dados — SQLite embutido no Node (módulo `node:sqlite`, sem
 * dependência externa). O arquivo fica em dados/sistema.db.
 *
 * Modelo: UMA linha por proposta. O campo `status_atual` é a única fonte de
 * verdade sobre a etapa — não existem tabelas separadas por etapa.
 */

import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
export const CAMINHO_BANCO = process.env.SISTEMA_DB
  || join(AQUI, "..", "dados", "sistema.db");

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS supervisores (
  id         INTEGER PRIMARY KEY,
  nome       TEXT NOT NULL UNIQUE,
  ativo      INTEGER NOT NULL DEFAULT 1,
  criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS propostas (
  id                INTEGER PRIMARY KEY,

  -- de quem é a proposta: supervisor dono + operador responsável
  supervisor_id     INTEGER REFERENCES supervisores(id),
  responsavel       TEXT NOT NULL DEFAULT '',

  -- empresa
  razao_social      TEXT NOT NULL,
  nome_fantasia     TEXT NOT NULL DEFAULT '',
  documento         TEXT NOT NULL DEFAULT '',   -- só dígitos (CNPJ ou CPF)
  documento_exibido TEXT NOT NULL DEFAULT '',   -- como aparece pro usuário
  titular           TEXT NOT NULL DEFAULT '',

  -- proposta
  numero_proposta   TEXT NOT NULL DEFAULT '',
  operadora         TEXT NOT NULL DEFAULT '',
  produto           TEXT NOT NULL DEFAULT '',
  corretor          TEXT NOT NULL DEFAULT '',
  tipo              TEXT NOT NULL DEFAULT 'outro',
  valor             REAL,
  vidas             INTEGER,                    -- informado; se null, conta a tabela vidas

  -- datas do processo
  data_proposta     TEXT,                       -- AAAA-MM-DD (emissão)
  data_validade     TEXT,
  data_implantacao  TEXT,

  -- etapa: a única fonte de verdade
  status_atual      TEXT NOT NULL DEFAULT 'nova',
  pendencia_tipo    TEXT NOT NULL DEFAULT '',
  pendencia_detalhe TEXT NOT NULL DEFAULT '',
  observacoes       TEXT NOT NULL DEFAULT '',

  -- rastro da planilha de origem
  situacao_origem   TEXT NOT NULL DEFAULT '',
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

CREATE TABLE IF NOT EXISTS vidas (
  id           INTEGER PRIMARY KEY,
  proposta_id  INTEGER NOT NULL REFERENCES propostas(id) ON DELETE CASCADE,
  nome         TEXT NOT NULL,
  parentesco   TEXT NOT NULL DEFAULT 'titular',  -- 'titular' | 'dependente'
  idade        INTEGER,
  faixa        TEXT NOT NULL DEFAULT '',
  criado_em    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_vidas_proposta ON vidas(proposta_id);

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
