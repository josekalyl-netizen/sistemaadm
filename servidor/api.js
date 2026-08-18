/**
 * API do sistema. REST simples em JSON, sem framework.
 *
 * Organizada nos módulos do projeto:
 *   propostas    cadastro, busca, filtros, etapas
 *   usuários     as ADMs; é o vínculo que define quem vê o quê
 *   verificação  o botão "Verificar" e o histórico de acompanhamento
 *   mensagens    o texto pronto para mandar ao corretor
 *   master       produtividade por ADM e relatórios (rotas em servidor.js)
 */

import {
  CODIGOS_ETAPA, ETAPAS, NIVEIS, TIPOS_PENDENCIA, etapa, formatarDocumento,
  hoje, lerData, lerValor, normalizar, somenteDigitos, texto, validarDocumento,
} from "./dominio.js";
import { preparar, registrarHistorico, supervisorPorNome, usuarioPorNome } from "./banco.js";
import { SQL_DIAS_SEM_VERIFICAR, SQL_NIVEL, verificacoesDaProposta } from "./acompanhamento.js";
import { textoDeBusca } from "./importar.js";

export class ErroDeUso extends Error {
  constructor(mensagem, status = 400) {
    super(mensagem);
    this.status = status;
  }
}

const agora = () => new Date().toISOString().slice(0, 19).replace("T", " ");

/** Campos que o usuário pode editar na ficha. */
const EDITAVEIS = [
  "razao_social", "numero_proposta", "operadora", "corretor", "responsavel",
  "valor", "data_proposta", "data_validade", "cadastrado", "observacoes",
  "pendencia_tipo", "pendencia_detalhe", "nome_supervisor", "usuario_id",
];

const ROTULO_CAMPO = {
  razao_social: "Empresa", numero_proposta: "Proposta", operadora: "Operadora",
  corretor: "Corretor", responsavel: "Responsável", valor: "Valor",
  data_proposta: "Emissão", data_validade: "Validade", cadastrado: "Cadastrado",
  observacoes: "Observação", pendencia_tipo: "Pendência",
  pendencia_detalhe: "Detalhe da pendência", nome_supervisor: "Supervisor",
  usuario_id: "Responsável ADM",
};

// --------------------------------------------------------------- consultas

/**
 * Toda leitura de proposta traz junto o nível de acompanhamento e os dias sem
 * verificação — são campos calculados, não guardados, para nunca ficarem
 * desatualizados esperando alguém rodar uma rotina.
 */
const SELECT_BASE = `
  SELECT p.*,
         s.nome AS nome_supervisor,
         u.nome AS nome_adm,
         v.nome AS nome_verificou,
         ${SQL_DIAS_SEM_VERIFICAR} AS dias_sem_verificar,
         ${SQL_NIVEL}              AS nivel
  FROM propostas p
  LEFT JOIN supervisores s ON s.id = p.supervisor_id
  LEFT JOIN usuarios     u ON u.id = p.usuario_id
  LEFT JOIN usuarios     v ON v.id = p.verificada_por
`;

/** Monta o WHERE a partir dos filtros. Todos são combináveis (E lógico). */
function montarFiltro(f = {}) {
  const cond = [];
  const args = { hoje: hoje() };

  if (f.busca) {
    const termos = normalizar(f.busca).split(" ").filter(Boolean).slice(0, 6);
    termos.forEach((t, i) => {
      const digitos = somenteDigitos(t);
      // "53.588.657" tem de achar o CNPJ mesmo com a pontuação; já um termo
      // sem dígitos ("AMIL") não pode cair na comparação de documento, senão
      // o LIKE '%%' casaria com todas as propostas.
      if (digitos) {
        cond.push(`(p.busca LIKE :t${i} OR p.documento LIKE :d${i})`);
        args[`t${i}`] = `%${t}%`;
        args[`d${i}`] = `%${digitos}%`;
      } else {
        cond.push(`p.busca LIKE :t${i}`);
        args[`t${i}`] = `%${t}%`;
      }
    });
  }

  // O vínculo com a ADM é a principal regra de organização do sistema:
  // "sem" isola justamente as propostas que ninguém está acompanhando.
  if (f.usuario_id === "sem") {
    cond.push("p.usuario_id IS NULL");
  } else if (f.usuario_id) {
    cond.push("p.usuario_id = :uid");
    args.uid = Number(f.usuario_id);
  }

  if (f.status && CODIGOS_ETAPA.includes(f.status)) {
    cond.push("p.status_atual = :status");
    args.status = f.status;
  }
  if (f.nivel) {
    const niveis = String(f.nivel).split(",").filter((n) => NIVEIS.some((x) => x.codigo === n));
    if (niveis.length) {
      cond.push(`(${SQL_NIVEL}) IN (${niveis.map((n) => `'${n}'`).join(", ")})`);
    }
  }
  if (f.supervisor_id) {
    cond.push("p.supervisor_id = :sid");
    args.sid = Number(f.supervisor_id);
  }
  if (f.operadora) {
    cond.push("p.operadora = :operadora");
    args.operadora = texto(f.operadora).toUpperCase();
  }
  if (f.corretor) {
    cond.push("p.corretor = :corretor");
    args.corretor = texto(f.corretor).toUpperCase();
  }
  if (f.cadastrado === "sim") cond.push("p.cadastrado <> ''");
  if (f.cadastrado === "nao") cond.push("p.cadastrado = ''");
  if (f.de) {
    cond.push("p.data_proposta >= :de");
    args.de = lerData(f.de);
  }
  if (f.ate) {
    cond.push("p.data_proposta <= :ate");
    args.ate = lerData(f.ate);
  }
  if (f.implantada_de) {
    cond.push("p.implantada_em >= :impde");
    args.impde = lerData(f.implantada_de);
  }
  if (f.implantada_ate) {
    cond.push("p.implantada_em <= :impate");
    args.impate = lerData(f.implantada_ate);
  }

  return { onde: cond.length ? `WHERE ${cond.join(" AND ")}` : "", args };
}

const ORDENACOES = {
  recentes: "p.atualizado_em DESC, p.id DESC",
  atraso: `${SQL_DIAS_SEM_VERIFICAR} DESC, p.id DESC`,
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

  const total = preparar(db, `SELECT COUNT(*) AS n FROM propostas p ${onde}`).get(args).n;
  const itens = preparar(db, `${SELECT_BASE} ${onde} ORDER BY ${ordem} LIMIT :limite OFFSET :pulo`)
    .all({ ...args, limite, pulo: (pagina - 1) * limite });

  // contagem por etapa DENTRO do filtro atual (sem a própria etapa), para os
  // números das áreas acompanharem a busca e os demais filtros.
  const semStatus = montarFiltro({ ...filtros, status: null });
  const contagem = Object.fromEntries(CODIGOS_ETAPA.map((c) => [c, 0]));
  for (const linha of preparar(db,
    `SELECT p.status_atual AS etapa, COUNT(*) AS n FROM propostas p ${semStatus.onde} GROUP BY p.status_atual`,
  ).all(semStatus.args)) {
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
  const linha = preparar(db, `${SELECT_BASE} WHERE p.id = :id`).get({ hoje: hoje(), id: Number(id) });
  if (!linha) throw new ErroDeUso("Proposta não encontrada.", 404);
  const historico = db.prepare(
    "SELECT quando, tipo, de, para, motivo, descricao, autor FROM historico WHERE proposta_id = ? ORDER BY id DESC",
  ).all(linha.id);
  return { ...linha, historico, verificacoes: verificacoesDaProposta(db, linha.id) };
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

/** A ADM responsável. Pode ficar vazia — vira "proposta sem responsável". */
function resolverAdm(db, entrada) {
  if (entrada.usuario_id === "" || entrada.usuario_id === null) return null;
  if (entrada.usuario_id !== undefined) {
    const u = db.prepare("SELECT * FROM usuarios WHERE id = ?").get(Number(entrada.usuario_id));
    if (!u) throw new ErroDeUso("Responsável ADM não encontrado.");
    return u;
  }
  if (texto(entrada.nome_adm)) return usuarioPorNome(db, entrada.nome_adm);
  return null;
}

export function criarProposta(db, entrada, autor = "operacional") {
  const razao = texto(entrada.razao_social);
  if (!razao) throw new ErroDeUso("Informe o nome da empresa.");

  const supervisor = resolverSupervisor(db, entrada);
  const adm = resolverAdm(db, entrada);
  const status = CODIGOS_ETAPA.includes(entrada.status_atual) ? entrada.status_atual : "nova";

  const proposta = {
    supervisor_id: supervisor?.id ?? null,
    usuario_id: adm?.id ?? null,
    responsavel: adm?.nome || texto(entrada.responsavel).toUpperCase(),
    razao_social: razao,
    documento: somenteDigitos(entrada.documento),
    documento_exibido: formatarDocumento(entrada.documento) || texto(entrada.documento),
    numero_proposta: texto(entrada.numero_proposta),
    operadora: texto(entrada.operadora).toUpperCase(),
    corretor: texto(entrada.corretor).toUpperCase(),
    valor: lerValor(entrada.valor),
    data_proposta: lerData(entrada.data_proposta) || hoje(),
    data_validade: lerData(entrada.data_validade),
    cadastrado: texto(entrada.cadastrado).toUpperCase(),
    observacoes: texto(entrada.observacoes),
    status_atual: status,
    pendencia_tipo: status === "pendente" ? texto(entrada.pendencia_tipo) : "",
    pendencia_detalhe: status === "pendente" ? texto(entrada.pendencia_detalhe) : "",
    ultima_verificacao: null,
    verificada_por: null,
    implantada_em: status === "implantada" ? hoje() : null,
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
    descricao: `Proposta cadastrada em "${etapa(status).nome}"`
      + (adm ? ` · responsável ${adm.nome}` : " · SEM RESPONSÁVEL ADM"),
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
  // a data de implantação é carimbada quando a proposta chega em "Implantada"
  // e apagada se ela voltar atrás — é ela que alimenta "implantadas no dia".
  const implantadaEm = status === "implantada" ? (atual.implantada_em || hoje()) : null;

  db.prepare(`
    UPDATE propostas SET status_atual = ?, atualizado_em = ?,
           pendencia_tipo = ?, pendencia_detalhe = ?, implantada_em = ? WHERE id = ?
  `).run(status, agora(), novoTipo, novoDetalhe, implantadaEm, Number(id));

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

    if (campo === "usuario_id") {
      const adm = resolverAdm(db, entrada);
      const novoId = adm?.id ?? null;
      if (novoId === atual.usuario_id) continue;
      const antes = atual.usuario_id
        ? db.prepare("SELECT nome FROM usuarios WHERE id = ?").get(atual.usuario_id)?.nome
        : "SEM RESPONSÁVEL";
      set.usuario_id = novoId;
      set.responsavel = adm?.nome || "";
      mudancas.push(`Responsável ADM: "${antes}" → "${adm?.nome || "SEM RESPONSÁVEL"}"`);
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
      mudancas.push(`CNPJ: "${atual.documento_exibido}" → "${set.documento_exibido}"`);
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

/** Atribuir ADM em lote — o Master distribui as propostas sem responsável. */
export function atribuirAdm(db, { ids = [], usuario_id, autor = "master" }) {
  const adm = db.prepare("SELECT * FROM usuarios WHERE id = ?").get(Number(usuario_id));
  if (!adm) throw new ErroDeUso("Responsável ADM não encontrado.");
  if (!ids.length) throw new ErroDeUso("Escolha ao menos uma proposta.");

  const atualizar = db.prepare(
    "UPDATE propostas SET usuario_id = ?, responsavel = ?, atualizado_em = ? WHERE id = ?",
  );
  let quantas = 0;
  for (const id of ids) {
    const p = db.prepare("SELECT id, usuario_id FROM propostas WHERE id = ?").get(Number(id));
    if (!p || p.usuario_id === adm.id) continue;
    atualizar.run(adm.id, adm.nome, agora(), p.id);
    registrarHistorico(db, p.id, {
      tipo: "edicao",
      descricao: `Responsável ADM definido: ${adm.nome}`,
      autor,
    });
    quantas += 1;
  }
  return { atribuidas: quantas, usuario: adm.nome };
}

// ------------------------------------------------------------------ usuários

export function listarUsuarios(db) {
  return db.prepare(`
    SELECT u.id, u.nome, u.papel, u.ativo,
           COUNT(p.id) AS total,
           COUNT(p.id) FILTER (WHERE p.status_atual NOT IN ('implantada','cancelada')) AS abertas
    FROM usuarios u LEFT JOIN propostas p ON p.usuario_id = u.id
    GROUP BY u.id ORDER BY u.ativo DESC, u.nome
  `).all();
}

export function criarUsuario(db, entrada) {
  const nome = texto(entrada.nome).toUpperCase();
  if (!nome) throw new ErroDeUso("Informe o nome da ADM.");
  if (db.prepare("SELECT id FROM usuarios WHERE nome = ?").get(nome)) {
    throw new ErroDeUso("Já existe um usuário com esse nome.", 409);
  }
  usuarioPorNome(db, nome, entrada.papel === "master" ? "master" : "adm");
  return db.prepare("SELECT id, nome, papel, ativo, 0 AS total, 0 AS abertas FROM usuarios WHERE nome = ?").get(nome);
}

/**
 * Desativar não apaga: a ADM some do seletor e do cadastro, mas continua
 * aparecendo no histórico e nos relatórios do que ela já acompanhou.
 */
export function alterarUsuario(db, id, entrada) {
  const usuario = db.prepare("SELECT * FROM usuarios WHERE id = ?").get(Number(id));
  if (!usuario) throw new ErroDeUso("Usuário não encontrado.", 404);

  if (entrada.nome !== undefined) {
    const nome = texto(entrada.nome).toUpperCase();
    if (!nome) throw new ErroDeUso("O nome não pode ficar vazio.");
    const outro = db.prepare("SELECT id FROM usuarios WHERE nome = ? AND id <> ?").get(nome, usuario.id);
    if (outro) throw new ErroDeUso("Já existe outro usuário com esse nome.", 409);
    db.prepare("UPDATE usuarios SET nome = ? WHERE id = ?").run(nome, usuario.id);
    db.prepare("UPDATE propostas SET responsavel = ? WHERE usuario_id = ?").run(nome, usuario.id);
  }
  if (entrada.ativo !== undefined) {
    db.prepare("UPDATE usuarios SET ativo = ? WHERE id = ?").run(entrada.ativo ? 1 : 0, usuario.id);
  }
  return db.prepare("SELECT id, nome, papel, ativo FROM usuarios WHERE id = ?").get(usuario.id);
}

// ------------------------------------------------------------------- config

/** Listas que alimentam os campos de filtro (só o que existe no banco). */
export function config(db) {
  const distintos = (coluna) => db.prepare(
    `SELECT ${coluna} AS v FROM propostas WHERE ${coluna} <> '' GROUP BY ${coluna} ORDER BY COUNT(*) DESC`,
  ).all().map((r) => r.v);

  return {
    etapas: ETAPAS,
    niveis: NIVEIS,
    tipos_pendencia: TIPOS_PENDENCIA,
    usuarios: listarUsuarios(db).filter((u) => u.ativo),
    supervisores: db.prepare(`
      SELECT s.id, s.nome, COUNT(p.id) AS total
      FROM supervisores s LEFT JOIN propostas p ON p.supervisor_id = s.id
      WHERE s.ativo = 1 GROUP BY s.id ORDER BY s.nome
    `).all(),
    operadoras: distintos("operadora"),
    corretores: distintos("corretor"),
    hoje: hoje(),
  };
}

/** Conferência de documento usada pelo formulário de cadastro. */
export function conferirDocumento(valor) {
  return { ...validarDocumento(valor), formatado: formatarDocumento(valor) };
}
