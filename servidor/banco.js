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
export const VERSAO_ESQUEMA = 3;

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS supervisores (
  id         INTEGER PRIMARY KEY,
  nome       TEXT NOT NULL UNIQUE,
  ativo      INTEGER NOT NULL DEFAULT 1,
  criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Carteira de corretores por supervisor. Cadastrada só pelo Master (upload de
-- CSV "corretor,supervisor"); sem dado sensível, só o vínculo. É o que
-- preenche sozinho o supervisor no cadastro de proposta quando a ADM escolhe
-- o corretor.
CREATE TABLE IF NOT EXISTS corretores (
  id            INTEGER PRIMARY KEY,
  nome          TEXT NOT NULL UNIQUE,
  supervisor_id INTEGER REFERENCES supervisores(id),
  ativo         INTEGER NOT NULL DEFAULT 1,
  criado_em     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_corretores_supervisor ON corretores(supervisor_id);

-- As ADMs que acompanham as propostas (e o Master). Cadastradas na tela
-- Usuários; é esta lista que alimenta o campo "Responsável ADM".
CREATE TABLE IF NOT EXISTS usuarios (
  id         INTEGER PRIMARY KEY,
  nome       TEXT NOT NULL UNIQUE,
  papel      TEXT NOT NULL DEFAULT 'adm',   -- 'adm' | 'master'
  ativo      INTEGER NOT NULL DEFAULT 1,
  criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS propostas (
  id                INTEGER PRIMARY KEY,

  -- de quem é a proposta
  supervisor_id     INTEGER REFERENCES supervisores(id),
  usuario_id        INTEGER REFERENCES usuarios(id),  -- ADM responsável (pode ficar vazio)
  responsavel       TEXT NOT NULL DEFAULT '',         -- nome como veio da planilha

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

  -- acompanhamento diário
  ultima_verificacao TEXT,                        -- datetime da última verificação
  verificada_por    INTEGER REFERENCES usuarios(id),
  implantada_em     TEXT,                         -- data em que entrou em "Implantada"
  cancelada_em      TEXT,                         -- data em que entrou em "Cancelada"

  -- marca permanente: a proposta foi emitida pelo próprio corretor
  emitida_pelo_corretor INTEGER NOT NULL DEFAULT 0,

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
CREATE INDEX IF NOT EXISTS ix_propostas_usuario    ON propostas(usuario_id);
CREATE INDEX IF NOT EXISTS ix_propostas_verif      ON propostas(ultima_verificacao);
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

-- Cada clique em "Verificar proposta". É o registro bruto do acompanhamento:
-- tudo que o Master audita sai daqui.
CREATE TABLE IF NOT EXISTS verificacoes (
  id           INTEGER PRIMARY KEY,
  proposta_id  INTEGER NOT NULL REFERENCES propostas(id) ON DELETE CASCADE,
  usuario_id   INTEGER REFERENCES usuarios(id),
  dia          TEXT NOT NULL,        -- AAAA-MM-DD (para contar por dia sem converter)
  quando       TEXT NOT NULL,        -- AAAA-MM-DD HH:MM:SS
  etapa        TEXT NOT NULL DEFAULT '',
  observacao   TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_verif_dia      ON verificacoes(dia, usuario_id);
CREATE INDEX IF NOT EXISTS ix_verif_proposta ON verificacoes(proposta_id, id DESC);

-- Fechamento do dia por ADM. O dia de hoje é sempre calculado ao vivo; quando
-- vira a meia-noite, o número daquele dia é congelado aqui — senão o passado
-- mudaria sozinho conforme as propostas fossem sendo implantadas.
CREATE TABLE IF NOT EXISTS dia_resumo (
  dia               TEXT NOT NULL,
  usuario_id        INTEGER,               -- null = propostas sem responsável
  novas             INTEGER NOT NULL DEFAULT 0,
  para_acompanhar   INTEGER NOT NULL DEFAULT 0,
  acompanhadas      INTEGER NOT NULL DEFAULT 0,
  nao_acompanhadas  INTEGER NOT NULL DEFAULT 0,
  atrasadas         INTEGER NOT NULL DEFAULT 0,
  implantadas       INTEGER NOT NULL DEFAULT 0,
  fechado_em        TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (dia, usuario_id)
);

-- Qual mensagem pronta já foi usada para cada corretor, para não repetir.
CREATE TABLE IF NOT EXISTS mensagens_uso (
  id           INTEGER PRIMARY KEY,
  corretor     TEXT NOT NULL,
  etapa        TEXT NOT NULL,
  indice       INTEGER NOT NULL,
  proposta_id  INTEGER,
  canal        TEXT NOT NULL DEFAULT 'whatsapp',   -- 'whatsapp' ou 'email'
  quando       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_msg_uso ON mensagens_uso(corretor, etapa, id DESC);

/* ---------------------------------------------------------------- 8. configuração
   Decisões do próprio sistema que precisam sobreviver ao reinício. Hoje só
   guarda se a importação automática das planilhas continua valendo: depois de
   zerar o banco de propósito, um banco vazio não pode ser confundido com
   "primeira execução" e reimportar tudo de volta. */
CREATE TABLE IF NOT EXISTS configuracao (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
`;

let bancoAberto = null;
let recriado = false;

export function abrirBanco() {
  if (bancoAberto) return bancoAberto;
  mkdirSync(dirname(CAMINHO_BANCO), { recursive: true });
  const db = new DatabaseSync(CAMINHO_BANCO);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");

  // Banco de uma versão anterior: apaga e deixa o esquema novo ser criado.
  // Precisa acontecer ANTES do esquema — "CREATE TABLE IF NOT EXISTS" não
  // altera a tabela velha, e os índices novos quebrariam em colunas que ela
  // não tem. Nada se perde: tudo vem das planilhas na importação.
  if (precisaRecriar(db)) {
    db.exec(`
      DROP TABLE IF EXISTS dia_resumo;
      DROP TABLE IF EXISTS verificacoes;
      DROP TABLE IF EXISTS mensagens_uso;
      DROP TABLE IF EXISTS historico;
      DROP TABLE IF EXISTS vidas;
      DROP TABLE IF EXISTS propostas;
    `);
    recriado = true;
  }

  db.exec(ESQUEMA);
  migrarColunasNovas(db);
  semearSupervisores(db);
  bancoAberto = db;
  return db;
}

/**
 * Colunas novas em banco já existente — SEMPRE por ALTER TABLE, nunca por
 * recriação: ao contrário de `precisaRecriar`, este banco já tem propostas
 * reais cadastradas à mão, verificações e histórico que não estão em
 * nenhuma planilha. Perder isso não é uma opção.
 */
function migrarColunasNovas(db) {
  const usoMsg = db.prepare("PRAGMA table_info(mensagens_uso)").all().map((c) => c.name);
  if (!usoMsg.includes("canal")) {
    // o que já foi usado até aqui era tudo WhatsApp — o padrão da coluna já diz isso
    db.exec("ALTER TABLE mensagens_uso ADD COLUMN canal TEXT NOT NULL DEFAULT 'whatsapp'");
  }

  const colunas = db.prepare("PRAGMA table_info(propostas)").all().map((c) => c.name);
  if (!colunas.includes("emitida_pelo_corretor")) {
    db.exec("ALTER TABLE propostas ADD COLUMN emitida_pelo_corretor INTEGER NOT NULL DEFAULT 0");
  }
  if (!colunas.includes("cancelada_em")) {
    db.exec("ALTER TABLE propostas ADD COLUMN cancelada_em TEXT");
    // aproximação: para o que já estava cancelado, usa a data da proposta —
    // não é a data real do cancelamento, mas é melhor do que ficar nulo e
    // nunca entrar no valor "cancelado no mês" de nenhum relatório.
    db.exec("UPDATE propostas SET cancelada_em = data_proposta WHERE status_atual = 'cancelada' AND cancelada_em IS NULL");
  }
}

/** true quando a tabela de propostas existe mas é de um esquema antigo. */
function precisaRecriar(db) {
  const existe = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='propostas'",
  ).get();
  if (!existe) return false;
  const colunas = db.prepare("PRAGMA table_info(propostas)").all().map((c) => c.name);
  return !colunas.includes("cadastrado") || !colunas.includes("usuario_id");
}

/** Informa à preparação que o banco foi refeito nesta execução. */
export function bancoFoiRecriado() {
  return recriado;
}

export function fecharBanco() {
  if (bancoAberto) {
    bancoAberto.close();
    bancoAberto = null;
  }
}

/** Busca (ou cria) a ADM pelo nome. O nome é a identidade do usuário. */
export function usuarioPorNome(db, nome, papel = "adm") {
  const limpo = String(nome || "").trim().toUpperCase();
  if (!limpo) return null;
  const achado = db.prepare("SELECT * FROM usuarios WHERE nome = ?").get(limpo);
  if (achado) return achado;
  db.prepare("INSERT INTO usuarios (nome, papel) VALUES (?, ?)").run(limpo, papel);
  return db.prepare("SELECT * FROM usuarios WHERE nome = ?").get(limpo);
}

/**
 * Prepara uma consulta aceitando parâmetros nomeados que ela não usa.
 *
 * As consultas do sistema são montadas por pedaços (filtros combináveis), então
 * o mesmo objeto de argumentos serve para variações da mesma query — uma delas
 * pode não citar `:hoje`, por exemplo. Sem isto, o node:sqlite recusa.
 */
export function preparar(db, sql) {
  const consulta = db.prepare(sql);
  consulta.setAllowUnknownNamedParameters(true);
  return consulta;
}

/** Busca (ou cria) o supervisor pelo nome. Nome é a identidade do supervisor. */
/**
 * A equipe de supervisão do grupo. Fica no código porque é fixa: são as
 * pessoas, não um cadastro que muda toda semana.
 *
 * Em caixa alta porque é assim que todo nome de supervisor é guardado no banco
 * (ver supervisorPorNome) — se entrassem diferente, o mesmo supervisor viraria
 * dois no dia em que uma planilha trouxesse o nome de outro jeito.
 */
export const SUPERVISORES_PADRAO = [
  "KALYL SOARES",
  "LARISSA LARA",
  "LUCAS SOUZA",
  "LUCAS VINICIUS",
  "KATHELLYN GODOY",
];

/**
 * Cria a equipe só quando não existe supervisor nenhum — primeira execução, ou
 * logo depois de zerar o sistema. Quem já tem sua lista montada não é
 * atropelado, e quem apagou um supervisor de propósito não o vê voltar (a
 * menos que apague todos).
 */
export function semearSupervisores(db) {
  const quantos = db.prepare("SELECT COUNT(*) AS n FROM supervisores").get().n;
  if (quantos > 0) return;
  const inserir = db.prepare("INSERT INTO supervisores (nome) VALUES (?)");
  for (const nome of SUPERVISORES_PADRAO) inserir.run(nome);
}

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
