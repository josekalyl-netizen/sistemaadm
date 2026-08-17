/**
 * API do sistema. REST simples em JSON, sem framework.
 *
 * Rotas:
 *   GET    /api/config                    etapas, supervisores, listas de filtro
 *   GET    /api/propostas                 lista com busca + filtros + paginação
 *   GET    /api/propostas/:id             ficha completa (vidas + histórico)
 *   POST   /api/propostas                 cadastra uma proposta
 *   PATCH  /api/propostas/:id             edita campos (gera histórico)
 *   PATCH  /api/propostas/:id/status      muda a etapa (gera histórico)
 *   POST   /api/propostas/:id/vidas       adiciona uma vida
 *   DELETE /api/propostas/:id/vidas/:vid  remove uma vida
 *   GET    /api/painel                    contagens do dashboard
 *   POST   /api/supervisores              cria supervisor
 */

import {
  CODIGOS_ETAPA, ETAPAS, FAIXAS_ETARIAS, TIPOS_PENDENCIA, TIPOS_PROPOSTA,
  deduzirTipo, etapa, faixaEtaria, formatarDocumento, lerData, lerValor,
  normalizar, somenteDigitos, texto, validarDocumento,
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

// --------------------------------------------------------------- consultas

/** Campos que o usuário pode editar direto na ficha. */
const EDITAVEIS = [
  "razao_social", "nome_fantasia", "titular", "numero_proposta", "operadora",
  "produto", "corretor", "tipo", "observacoes", "responsavel",
  "pendencia_tipo", "pendencia_detalhe", "nome_supervisor",
  "valor", "vidas", "data_proposta", "data_validade", "data_implantacao",
];

const ROTULO_CAMPO = {
  razao_social: "Razão social", nome_fantasia: "Nome fantasia", titular: "Titular",
  numero_proposta: "Número da proposta", operadora: "Operadora", produto: "Produto",
  corretor: "Corretor", tipo: "Tipo", observacoes: "Observação",
  responsavel: "Responsável", pendencia_tipo: "Pendência",
  pendencia_detalhe: "Detalhe da pendência", valor: "Valor", vidas: "Quantidade de vidas",
  data_proposta: "Data da proposta", data_validade: "Validade",
  data_implantacao: "Data de implantação", nome_supervisor: "Supervisor",
};

function propostaComExtras(db, linha) {
  if (!linha) return null;
  const vidas = db.prepare(
    "SELECT id, nome, parentesco, idade, faixa FROM vidas WHERE proposta_id = ? ORDER BY parentesco DESC, id",
  ).all(linha.id);
  const historico = db.prepare(
    "SELECT quando, tipo, de, para, motivo, descricao, autor FROM historico WHERE proposta_id = ? ORDER BY id DESC",
  ).all(linha.id);

  const porFaixa = {};
  for (const f of FAIXAS_ETARIAS) porFaixa[f.codigo] = 0;
  for (const v of vidas) if (v.faixa && porFaixa[v.faixa] !== undefined) porFaixa[v.faixa] += 1;

  return { ...linha, vidas_lista: vidas, historico, vidas_por_faixa: porFaixa };
}

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
  if (f.empresa) {
    cond.push("p.busca LIKE ?");
    args.push(`%${normalizar(f.empresa)}%`);
  }
  if (f.documento) {
    cond.push("p.documento LIKE ?");
    args.push(`%${somenteDigitos(f.documento)}%`);
  }
  if (f.titular) {
    cond.push("(UPPER(p.titular) LIKE ? OR UPPER(p.razao_social) LIKE ?)");
    args.push(`%${normalizar(f.titular)}%`, `%${normalizar(f.titular)}%`);
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
  if (f.tipo) {
    cond.push("p.tipo = ?");
    args.push(texto(f.tipo));
  }
  if (f.de) {
    cond.push("p.data_proposta >= ?");
    args.push(lerData(f.de));
  }
  if (f.ate) {
    cond.push("p.data_proposta <= ?");
    args.push(lerData(f.ate));
  }
  if (f.implantada_de) {
    cond.push("p.data_implantacao >= ?");
    args.push(lerData(f.implantada_de));
  }
  if (f.implantada_ate) {
    cond.push("p.data_implantacao <= ?");
    args.push(lerData(f.implantada_ate));
  }
  if (f.vidas_min) {
    cond.push("COALESCE(p.vidas, (SELECT COUNT(*) FROM vidas v WHERE v.proposta_id = p.id)) >= ?");
    args.push(Number(f.vidas_min));
  }
  if (f.vidas_max) {
    cond.push("COALESCE(p.vidas, (SELECT COUNT(*) FROM vidas v WHERE v.proposta_id = p.id)) <= ?");
    args.push(Number(f.vidas_max));
  }

  return { onde: cond.length ? `WHERE ${cond.join(" AND ")}` : "", args };
}

const SELECT_BASE = `
  SELECT p.*, s.nome AS nome_supervisor,
         COALESCE(p.vidas, (SELECT COUNT(*) FROM vidas v WHERE v.proposta_id = p.id)) AS total_vidas
  FROM propostas p
  LEFT JOIN supervisores s ON s.id = p.supervisor_id
`;

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
  const limite = Math.min(Number(filtros.limite) || 50, 500);
  const pagina = Math.max(Number(filtros.pagina) || 1, 1);

  const total = db.prepare(`SELECT COUNT(*) AS n FROM propostas p ${onde}`).get(...args).n;
  const itens = db.prepare(`${SELECT_BASE} ${onde} ORDER BY ${ordem} LIMIT ? OFFSET ?`)
    .all(...args, limite, (pagina - 1) * limite);

  // contagem por etapa DENTRO do filtro atual (menos a própria etapa), para os
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
  return propostaComExtras(db, linha);
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
  if (!razao) throw new ErroDeUso("Informe a razão social (ou o nome do titular).");

  const supervisor = resolverSupervisor(db, entrada);
  if (!supervisor) throw new ErroDeUso("Escolha o supervisor responsável pela proposta.");

  const status = CODIGOS_ETAPA.includes(entrada.status_atual) ? entrada.status_atual : "nova";
  const documento = somenteDigitos(entrada.documento);

  const proposta = {
    supervisor_id: supervisor.id,
    responsavel: texto(entrada.responsavel).toUpperCase(),
    razao_social: razao,
    nome_fantasia: texto(entrada.nome_fantasia),
    documento,
    documento_exibido: formatarDocumento(entrada.documento) || texto(entrada.documento),
    titular: texto(entrada.titular),
    numero_proposta: texto(entrada.numero_proposta),
    operadora: texto(entrada.operadora).toUpperCase(),
    produto: texto(entrada.produto),
    corretor: texto(entrada.corretor).toUpperCase(),
    tipo: texto(entrada.tipo) || deduzirTipo(documento, entrada.operadora),
    valor: lerValor(entrada.valor),
    vidas: entrada.vidas === "" || entrada.vidas === undefined || entrada.vidas === null
      ? null : Number(entrada.vidas),
    data_proposta: lerData(entrada.data_proposta) || new Date().toISOString().slice(0, 10),
    data_validade: lerData(entrada.data_validade),
    data_implantacao: lerData(entrada.data_implantacao)
      || (status === "implantada" ? new Date().toISOString().slice(0, 10) : null),
    status_atual: status,
    pendencia_tipo: status === "pendente" ? texto(entrada.pendencia_tipo) : "",
    pendencia_detalhe: status === "pendente" ? texto(entrada.pendencia_detalhe) : "",
    observacoes: texto(entrada.observacoes),
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

  if (status === atual.status_atual && !pendencia_tipo && !pendencia_detalhe) {
    return obterProposta(db, id);
  }

  const campos = {
    status_atual: status,
    atualizado_em: agora(),
    pendencia_tipo: status === "pendente" ? texto(pendencia_tipo ?? atual.pendencia_tipo) : "",
    pendencia_detalhe: status === "pendente" ? texto(pendencia_detalhe ?? atual.pendencia_detalhe) : "",
    // ao concluir, carimba a data de implantação; ao sair, apaga
    data_implantacao: status === "implantada"
      ? (atual.data_implantacao || new Date().toISOString().slice(0, 10))
      : null,
  };

  db.prepare(`
    UPDATE propostas SET status_atual = ?, atualizado_em = ?, pendencia_tipo = ?,
           pendencia_detalhe = ?, data_implantacao = ? WHERE id = ?
  `).run(campos.status_atual, campos.atualizado_em, campos.pendencia_tipo,
         campos.pendencia_detalhe, campos.data_implantacao, Number(id));

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
      && (campos.pendencia_tipo !== atual.pendencia_tipo
          || campos.pendencia_detalhe !== atual.pendencia_detalhe)) {
    registrarHistorico(db, Number(id), {
      tipo: "pendencia",
      para: campos.pendencia_tipo,
      descricao: "Pendência atualizada."
        + (campos.pendencia_tipo ? ` Tipo: ${campos.pendencia_tipo}.` : "")
        + (campos.pendencia_detalhe ? ` ${campos.pendencia_detalhe}` : ""),
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
      if (!supervisor) continue;
      const antes = db.prepare("SELECT nome FROM supervisores WHERE id = ?").get(atual.supervisor_id);
      if (supervisor.id !== atual.supervisor_id) {
        set.supervisor_id = supervisor.id;
        mudancas.push(`Supervisor: "${antes?.nome || "—"}" → "${supervisor.nome}"`);
      }
      continue;
    }

    let novo = entrada[campo];
    if (campo === "valor") novo = lerValor(novo);
    else if (campo === "vidas") novo = novo === "" || novo === null ? null : Number(novo);
    else if (campo.startsWith("data_")) novo = lerData(novo);
    else if (["operadora", "corretor", "responsavel"].includes(campo)) novo = texto(novo).toUpperCase();
    else novo = texto(novo);

    const antes = atual[campo];
    const igual = (antes ?? null) === (novo ?? null) || String(antes ?? "") === String(novo ?? "");
    if (igual) continue;

    set[campo] = novo;
    mudancas.push(`${ROTULO_CAMPO[campo] || campo}: "${antes ?? ""}" → "${novo ?? ""}"`);
  }

  if ("documento" in entrada) {
    const digitos = somenteDigitos(entrada.documento);
    if (digitos !== atual.documento) {
      set.documento = digitos;
      set.documento_exibido = formatarDocumento(entrada.documento) || texto(entrada.documento);
      mudancas.push(`Documento: "${atual.documento_exibido}" → "${set.documento_exibido}"`);
    }
  }

  if (!mudancas.length) return obterProposta(db, Number(id));

  set.atualizado_em = agora();
  const depois = { ...atual, ...set };
  set.busca = textoDeBusca(depois);

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

export function adicionarVida(db, id, entrada, autor = "operacional") {
  const proposta = db.prepare("SELECT id FROM propostas WHERE id = ?").get(Number(id));
  if (!proposta) throw new ErroDeUso("Proposta não encontrada.", 404);

  const nome = texto(entrada.nome);
  if (!nome) throw new ErroDeUso("Informe o nome da vida.");
  const idade = entrada.idade === "" || entrada.idade === null || entrada.idade === undefined
    ? null : Number(entrada.idade);
  if (idade !== null && (!Number.isFinite(idade) || idade < 0 || idade > 130)) {
    throw new ErroDeUso("Idade inválida.");
  }
  const parentesco = entrada.parentesco === "dependente" ? "dependente" : "titular";

  db.prepare("INSERT INTO vidas (proposta_id, nome, parentesco, idade, faixa) VALUES (?, ?, ?, ?, ?)")
    .run(Number(id), nome, parentesco, idade, faixaEtaria(idade) || "");
  db.prepare("UPDATE propostas SET atualizado_em = ? WHERE id = ?").run(agora(), Number(id));

  registrarHistorico(db, Number(id), {
    tipo: "edicao",
    descricao: `Vida incluída: ${nome} (${parentesco}${idade !== null ? `, ${idade} anos` : ""}).`,
    autor,
  });
  return obterProposta(db, Number(id));
}

export function removerVida(db, id, vidaId, autor = "operacional") {
  const vida = db.prepare("SELECT * FROM vidas WHERE id = ? AND proposta_id = ?")
    .get(Number(vidaId), Number(id));
  if (!vida) throw new ErroDeUso("Vida não encontrada.", 404);

  db.prepare("DELETE FROM vidas WHERE id = ?").run(Number(vidaId));
  db.prepare("UPDATE propostas SET atualizado_em = ? WHERE id = ?").run(agora(), Number(id));
  registrarHistorico(db, Number(id), {
    tipo: "edicao",
    descricao: `Vida removida: ${vida.nome}.`,
    autor,
  });
  return obterProposta(db, Number(id));
}

// ------------------------------------------------------------------- painel

export function painel(db, filtros = {}) {
  const { onde, args } = montarFiltro({ ...filtros, status: null });

  const porEtapa = Object.fromEntries(CODIGOS_ETAPA.map((c) => [c, 0]));
  for (const l of db.prepare(
    `SELECT p.status_atual AS etapa, COUNT(*) AS n FROM propostas p ${onde} GROUP BY p.status_atual`,
  ).all(...args)) porEtapa[l.etapa] = l.n;

  const soma = db.prepare(`
    SELECT COUNT(*) AS total,
           COALESCE(SUM(COALESCE(p.vidas, (SELECT COUNT(*) FROM vidas v WHERE v.proposta_id = p.id))), 0) AS vidas,
           COALESCE(SUM(CASE WHEN p.status_atual = 'implantada'     THEN p.valor END), 0) AS valor_implantado,
           COALESCE(SUM(CASE WHEN p.status_atual = 'pendente'       THEN p.valor END), 0) AS valor_pendente,
           COALESCE(SUM(CASE WHEN p.status_atual = 'em_implantacao' THEN p.valor END), 0) AS valor_em_implantacao
    FROM propostas p ${onde}
  `).get(...args);

  const porSupervisor = db.prepare(`
    SELECT COALESCE(s.nome, 'SEM SUPERVISOR') AS supervisor, s.id AS supervisor_id,
           COUNT(*) AS total,
           SUM(CASE WHEN p.status_atual = 'pendente'       THEN 1 ELSE 0 END) AS pendentes,
           SUM(CASE WHEN p.status_atual = 'em_implantacao' THEN 1 ELSE 0 END) AS em_implantacao,
           SUM(CASE WHEN p.status_atual = 'implantada'     THEN 1 ELSE 0 END) AS implantadas
    FROM propostas p LEFT JOIN supervisores s ON s.id = p.supervisor_id
    ${onde} GROUP BY s.id ORDER BY total DESC
  `).all(...args);

  const recentes = db.prepare(`
    ${SELECT_BASE} ${onde} ORDER BY p.atualizado_em DESC, p.id DESC LIMIT 8
  `).all(...args);

  return {
    total: soma.total,
    total_vidas: soma.vidas,
    valor_implantado: soma.valor_implantado,
    valor_pendente: soma.valor_pendente,
    valor_em_implantacao: soma.valor_em_implantacao,
    por_etapa: porEtapa,
    por_supervisor: porSupervisor,
    recentes,
  };
}

/** Listas que alimentam os campos de filtro (só o que existe no banco). */
export function config(db) {
  const distintos = (coluna) => db.prepare(
    `SELECT ${coluna} AS v, COUNT(*) AS n FROM propostas WHERE ${coluna} <> '' GROUP BY ${coluna} ORDER BY n DESC`,
  ).all().map((r) => r.v);

  return {
    etapas: ETAPAS,
    tipos_pendencia: TIPOS_PENDENCIA,
    tipos_proposta: TIPOS_PROPOSTA,
    faixas_etarias: FAIXAS_ETARIAS,
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
  const existe = db.prepare("SELECT id FROM supervisores WHERE nome = ?").get(nome);
  if (existe) throw new ErroDeUso("Já existe um supervisor com esse nome.", 409);
  supervisorPorNome(db, nome);
  return db.prepare("SELECT id, nome, 0 AS total FROM supervisores WHERE nome = ?").get(nome);
}

/** Conferência de documento usada pelo formulário de cadastro. */
export function conferirDocumento(valor) {
  const r = validarDocumento(valor);
  return { ...r, formatado: formatarDocumento(valor) };
}
