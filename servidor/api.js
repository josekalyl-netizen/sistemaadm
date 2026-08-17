/**
 * API do sistema. REST simples em JSON, sem framework.
 *
 * Rotas:
 *   GET    /api/config                 etapas, supervisores, listas de filtro
 *   GET    /api/propostas              lista com busca + filtros + paginação
 *   GET    /api/propostas/:id          ficha completa (com histórico)
 *   POST   /api/propostas              cadastra uma proposta
 *   PATCH  /api/propostas/:id          edita campos (gera histórico)
 *   PATCH  /api/propostas/:id/status   muda a etapa (gera histórico)
 *   GET    /api/painel                 contagens do resumo
 *   POST   /api/supervisores           cria supervisor
 */

import {
  CODIGOS_ETAPA, ETAPAS, TIPOS_PENDENCIA, etapa, formatarDocumento, lerData,
  lerValor, normalizar, somenteDigitos, texto, validarDocumento,
} from "./dominio.js";
import { registrarHistorico, supervisorPorNome } from "./banco.js";
import { textoDeBusca } from "./importar.js";

export class ErroDeUso extends Error {
  constructor(mensagem, status = 400) {
    super(mensagem);
    this.status = status;
  }
}

const agora = () => new Date().toISOString().slice(0, 19).replace("T", " ");

/** Campos que o usuário pode editar na ficha — os mesmos da planilha. */
const EDITAVEIS = [
  "razao_social", "numero_proposta", "operadora", "corretor", "responsavel",
  "valor", "data_proposta", "data_validade", "cadastrado", "observacoes",
  "pendencia_tipo", "pendencia_detalhe", "nome_supervisor",
];

const ROTULO_CAMPO = {
  razao_social: "Estipulante", numero_proposta: "Proposta", operadora: "Operadora",
  corretor: "Corretor", responsavel: "Responsável", valor: "Valor",
  data_proposta: "Emissão", data_validade: "Validade", cadastrado: "Cadastrado",
  observacoes: "Observação", pendencia_tipo: "Pendência",
  pendencia_detalhe: "Detalhe da pendência", nome_supervisor: "Supervisor",
};

// --------------------------------------------------------------- consultas

const SELECT_BASE = `
  SELECT p.*, s.nome AS nome_supervisor
  FROM propostas p
  LEFT JOIN supervisores s ON s.id = p.supervisor_id
`;

/** Monta o WHERE a partir dos filtros. Todos são combináveis (E lógico). */
function montarFiltro(f = {}) {
  const cond = [];
  const args = [];

  if (f.busca) {
    // busca global: acha em qualquer etapa, por qualquer um dos campos
    const termos = normalizar(f.busca).split(" ").filter(Boolean).slice(0, 6);
    for (const t of termos) {
      const digitos = somenteDigitos(t);
      // "53.588.657" tem de achar o CNPJ mesmo com a pontuação; já um termo
      // sem dígitos ("AMIL") não pode cair na comparação de documento, senão
      // o LIKE '%%' casaria com todas as propostas.
      if (digitos) {
        cond.push("(p.busca LIKE ? OR p.documento LIKE ?)");
        args.push(`%${t}%`, `%${digitos}%`);
      } else {
        cond.push("p.busca LIKE ?");
        args.push(`%${t}%`);
      }
    }
  }
  if (f.status && CODIGOS_ETAPA.includes(f.status)) {
    cond.push("p.status_atual = ?");
    args.push(f.status);
  }
  if (f.supervisor_id) {
    cond.push("p.supervisor_id = ?");
    args.push(Number(f.supervisor_id));
  }
  if (f.operadora) {
    cond.push("p.operadora = ?");
    args.push(texto(f.operadora).toUpperCase());
  }
  if (f.corretor) {
    cond.push("p.corretor = ?");
    args.push(texto(f.corretor).toUpperCase());
  }
  if (f.responsavel) {
    cond.push("p.responsavel = ?");
    args.push(texto(f.responsavel).toUpperCase());
  }
  if (f.cadastrado === "sim") cond.push("p.cadastrado <> ''");
  if (f.cadastrado === "nao") cond.push("p.cadastrado = ''");
  if (f.de) {
    cond.push("p.data_proposta >= ?");
    args.push(lerData(f.de));
  }
  if (f.ate) {
    cond.push("p.data_proposta <= ?");
    args.push(lerData(f.ate));
  }

  return { onde: cond.length ? `WHERE ${cond.join(" AND ")}` : "", args };
}

const ORDENACOES = {
  recentes: "p.atualizado_em DESC, p.id DESC",
  data: "p.data_proposta DESC, p.id DESC",
  valor: "p.valor DESC NULLS LAST",
  empresa: "p.razao_social COLLATE NOCASE",
  etapa: "CASE p.status_atual " + ETAPAS.map((e) => `WHEN '${e.codigo}' THEN ${e.ordem}`).join(" ") + " END, p.atualizado_em DESC",
};

export function listarPropostas(db, filtros = {}) {
  const { onde, args } = montarFiltro(filtros);
  const ordem = ORDENACOES[filtros.ordem] || ORDENACOES.recentes;
  const limite = Math.min(Number(filtros.limite) || 60, 500);
  const pagina = Math.max(Number(filtros.pagina) || 1, 1);

  const total = db.prepare(`SELECT COUNT(*) AS n FROM propostas p ${onde}`).get(...args).n;
  const itens = db.prepare(`${SELECT_BASE} ${onde} ORDER BY ${ordem} LIMIT ? OFFSET ?`)
    .all(...args, limite, (pagina - 1) * limite);

  // contagem por etapa DENTRO do filtro atual (sem a própria etapa), para os
  // números das áreas acompanharem a busca e os demais filtros.
  const semStatus = montarFiltro({ ...filtros, status: null });
  const contagem = Object.fromEntries(CODIGOS_ETAPA.map((c) => [c, 0]));
  for (const linha of db.prepare(
    `SELECT p.status_atual AS etapa, COUNT(*) AS n FROM propostas p ${semStatus.onde} GROUP BY p.status_atual`,
  ).all(...semStatus.args)) {
    contagem[linha.etapa] = linha.n;
  }

  return {
    total,
    pagina,
    limite,
    paginas: Math.max(Math.ceil(total / limite), 1),
    contagem_por_etapa: contagem,
    total_no_filtro: Object.values(contagem).reduce((a, b) => a + b, 0),
    itens,
  };
}

export function obterProposta(db, id) {
  const linha = db.prepare(`${SELECT_BASE} WHERE p.id = ?`).get(Number(id));
  if (!linha) throw new ErroDeUso("Proposta não encontrada.", 404);
  const historico = db.prepare(
    "SELECT quando, tipo, de, para, motivo, descricao, autor FROM historico WHERE proposta_id = ? ORDER BY id DESC",
  ).all(linha.id);
  return { ...linha, historico };
}

// ------------------------------------------------------------------ escrita

function resolverSupervisor(db, entrada) {
  if (entrada.supervisor_id) {
    const s = db.prepare("SELECT * FROM supervisores WHERE id = ?").get(Number(entrada.supervisor_id));
    if (!s) throw new ErroDeUso("Supervisor não encontrado.");
    return s;
  }
  if (texto(entrada.nome_supervisor)) return supervisorPorNome(db, entrada.nome_supervisor);
  return null;
}

export function criarProposta(db, entrada, autor = "operacional") {
  const razao = texto(entrada.razao_social);
  if (!razao) throw new ErroDeUso("Informe o nome da estipulante.");

  const supervisor = resolverSupervisor(db, entrada);
  if (!supervisor) throw new ErroDeUso("Escolha o supervisor responsável pela proposta.");

  const status = CODIGOS_ETAPA.includes(entrada.status_atual) ? entrada.status_atual : "nova";

  const proposta = {
    supervisor_id: supervisor.id,
    responsavel: texto(entrada.responsavel).toUpperCase(),
    razao_social: razao,
    documento: somenteDigitos(entrada.documento),
    documento_exibido: formatarDocumento(entrada.documento) || texto(entrada.documento),
    numero_proposta: texto(entrada.numero_proposta),
    operadora: texto(entrada.operadora).toUpperCase(),
    corretor: texto(entrada.corretor).toUpperCase(),
    valor: lerValor(entrada.valor),
    data_proposta: lerData(entrada.data_proposta) || new Date().toISOString().slice(0, 10),
    data_validade: lerData(entrada.data_validade),
    cadastrado: texto(entrada.cadastrado).toUpperCase(),
    observacoes: texto(entrada.observacoes),
    status_atual: status,
    pendencia_tipo: status === "pendente" ? texto(entrada.pendencia_tipo) : "",
    pendencia_detalhe: status === "pendente" ? texto(entrada.pendencia_detalhe) : "",
    situacao_origem: "",
    origem_arquivo: "cadastro manual",
    origem_aba: "",
    chave_natural: "",
  };
  proposta.busca = textoDeBusca(proposta);

  // Aviso de duplicidade: mesmo número de proposta + mesmo documento.
  if (proposta.numero_proposta && proposta.documento) {
    const igual = db.prepare(
      "SELECT id, razao_social FROM propostas WHERE numero_proposta = ? AND documento = ?",
    ).get(proposta.numero_proposta, proposta.documento);
    if (igual && !entrada.confirmar_duplicada) {
      throw new ErroDeUso(
        `Já existe a proposta ${proposta.numero_proposta} para este documento (#${igual.id} — ${igual.razao_social}).`,
        409,
      );
    }
  }

  const campos = Object.keys(proposta);
  const r = db.prepare(
    `INSERT INTO propostas (${campos.join(", ")}) VALUES (${campos.map(() => "?").join(", ")})`,
  ).run(...campos.map((c) => proposta[c] ?? null));
  const id = Number(r.lastInsertRowid);

  registrarHistorico(db, id, {
    tipo: "criacao",
    para: status,
    descricao: `Proposta cadastrada em "${etapa(status).nome}" · supervisor ${supervisor.nome}`,
    autor,
  });
  return obterProposta(db, id);
}

/**
 * Muda a etapa. É a operação central do sistema: como a proposta é uma só e a
 * etapa é um campo, mudar o status já reorganiza a proposta em toda a interface
 * — nada é copiado nem movido.
 */
export function mudarStatus(db, id, { status, motivo, pendencia_tipo, pendencia_detalhe, autor }) {
  const atual = db.prepare("SELECT * FROM propostas WHERE id = ?").get(Number(id));
  if (!atual) throw new ErroDeUso("Proposta não encontrada.", 404);
  if (!CODIGOS_ETAPA.includes(status)) throw new ErroDeUso("Etapa inválida.");

  if (status === atual.status_atual && pendencia_tipo === undefined && pendencia_detalhe === undefined) {
    return obterProposta(db, id);
  }

  const novoTipo = status === "pendente" ? texto(pendencia_tipo ?? atual.pendencia_tipo) : "";
  const novoDetalhe = status === "pendente" ? texto(pendencia_detalhe ?? atual.pendencia_detalhe) : "";

  db.prepare(`
    UPDATE propostas SET status_atual = ?, atualizado_em = ?,
           pendencia_tipo = ?, pendencia_detalhe = ? WHERE id = ?
  `).run(status, agora(), novoTipo, novoDetalhe, Number(id));

  if (status !== atual.status_atual) {
    registrarHistorico(db, Number(id), {
      tipo: "status",
      de: atual.status_atual,
      para: status,
      motivo: texto(motivo),
      descricao: `Status alterado de "${etapa(atual.status_atual)?.nome || atual.status_atual}" `
        + `para "${etapa(status).nome}".`,
      autor: texto(autor) || "operacional",
    });
  }
  if (status === "pendente"
      && (novoTipo !== atual.pendencia_tipo || novoDetalhe !== atual.pendencia_detalhe)) {
    registrarHistorico(db, Number(id), {
      tipo: "pendencia",
      para: novoTipo,
      descricao: "Pendência atualizada."
        + (novoTipo ? ` Tipo: ${novoTipo}.` : "")
        + (novoDetalhe ? ` ${novoDetalhe}` : ""),
      autor: texto(autor) || "operacional",
    });
  }

  return obterProposta(db, Number(id));
}

export function editarProposta(db, id, entrada, autor = "operacional") {
  const atual = db.prepare("SELECT * FROM propostas WHERE id = ?").get(Number(id));
  if (!atual) throw new ErroDeUso("Proposta não encontrada.", 404);

  const mudancas = [];
  const set = {};

  for (const campo of EDITAVEIS) {
    if (!(campo in entrada)) continue;

    if (campo === "nome_supervisor") {
      const supervisor = resolverSupervisor(db, entrada);
      if (!supervisor || supervisor.id === atual.supervisor_id) continue;
      const antes = db.prepare("SELECT nome FROM supervisores WHERE id = ?").get(atual.supervisor_id);
      set.supervisor_id = supervisor.id;
      mudancas.push(`Supervisor: "${antes?.nome || "—"}" → "${supervisor.nome}"`);
      continue;
    }

    let novo = entrada[campo];
    if (campo === "valor") novo = lerValor(novo);
    else if (campo.startsWith("data_")) novo = lerData(novo);
    else if (["operadora", "corretor", "responsavel", "cadastrado"].includes(campo)) {
      novo = texto(novo).toUpperCase();
    } else novo = texto(novo);

    const antes = atual[campo];
    if ((antes ?? null) === (novo ?? null) || String(antes ?? "") === String(novo ?? "")) continue;

    set[campo] = novo;
    mudancas.push(`${ROTULO_CAMPO[campo] || campo}: "${antes ?? ""}" → "${novo ?? ""}"`);
  }

  if ("documento" in entrada) {
    const digitos = somenteDigitos(entrada.documento);
    if (digitos !== atual.documento) {
      set.documento = digitos;
      set.documento_exibido = formatarDocumento(entrada.documento) || texto(entrada.documento);
      mudancas.push(`CNPJ/CPF: "${atual.documento_exibido}" → "${set.documento_exibido}"`);
    }
  }

  if (!mudancas.length) return obterProposta(db, Number(id));

  set.atualizado_em = agora();
  set.busca = textoDeBusca({ ...atual, ...set });

  const campos = Object.keys(set);
  db.prepare(`UPDATE propostas SET ${campos.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`)
    .run(...campos.map((c) => set[c] ?? null), Number(id));

  registrarHistorico(db, Number(id), {
    tipo: "edicao",
    descricao: mudancas.join(" · "),
    autor: texto(autor) || "operacional",
  });

  return obterProposta(db, Number(id));
}

// ------------------------------------------------------------------- painel

export function painel(db, filtros = {}) {
  const { onde, args } = montarFiltro({ ...filtros, status: null });

  const soma = db.prepare(`
    SELECT COUNT(*) AS total,
           COALESCE(SUM(CASE WHEN p.status_atual = 'implantada' THEN p.valor END), 0) AS valor_implantado,
           COALESCE(SUM(CASE WHEN p.status_atual = 'pendente'   THEN p.valor END), 0) AS valor_pendente
    FROM propostas p ${onde}
  `).get(...args);

  return {
    total: soma.total,
    valor_implantado: soma.valor_implantado,
    valor_pendente: soma.valor_pendente,
  };
}

/** Listas que alimentam os campos de filtro (só o que existe no banco). */
export function config(db) {
  const distintos = (coluna) => db.prepare(
    `SELECT ${coluna} AS v FROM propostas WHERE ${coluna} <> '' GROUP BY ${coluna} ORDER BY COUNT(*) DESC`,
  ).all().map((r) => r.v);

  return {
    etapas: ETAPAS,
    tipos_pendencia: TIPOS_PENDENCIA,
    supervisores: db.prepare(`
      SELECT s.id, s.nome, COUNT(p.id) AS total
      FROM supervisores s LEFT JOIN propostas p ON p.supervisor_id = s.id
      WHERE s.ativo = 1 GROUP BY s.id ORDER BY s.nome
    `).all(),
    operadoras: distintos("operadora"),
    corretores: distintos("corretor"),
    responsaveis: distintos("responsavel"),
  };
}

export function criarSupervisor(db, entrada) {
  const nome = texto(entrada.nome).toUpperCase();
  if (!nome) throw new ErroDeUso("Informe o nome do supervisor.");
  if (db.prepare("SELECT id FROM supervisores WHERE nome = ?").get(nome)) {
    throw new ErroDeUso("Já existe um supervisor com esse nome.", 409);
  }
  supervisorPorNome(db, nome);
  return db.prepare("SELECT id, nome, 0 AS total FROM supervisores WHERE nome = ?").get(nome);
}

/** Conferência de documento usada pelo formulário de cadastro. */
export function conferirDocumento(valor) {
  return { ...validarDocumento(valor), formatado: formatarDocumento(valor) };
}
