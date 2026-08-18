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
  hoje, lerData, lerValor, normalizar, somenteDigitos, texto, validarDocumento, verdadeiro,
  nomeLimpo,
} from "./dominio.js";
import { preparar, registrarHistorico, supervisorPorNome, usuarioPorNome } from "./banco.js";
import { gerarXlsx, lerXlsx } from "./xlsx.js";
import { SQL_DIAS_SEM_VERIFICAR, SQL_NIVEL, verificacoesDaProposta } from "./acompanhamento.js";
import { textoDeBusca } from "./importar.js";

export class ErroDeUso extends Error {
  constructor(mensagem, status = 400) {
    super(mensagem);
    this.status = status;
  }
}

const agora = () => new Date().toISOString().slice(0, 19).replace("T", " ");

/**
 * Campos que o usuário pode editar na ficha.
 *
 * `emitida_pelo_corretor` fica FORA de propósito: é a origem da proposta,
 * decidida no cadastro, e vale para sempre. Deixar editável transformaria um
 * fato em opinião.
 */
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

/**
 * Supervisor da proposta. Prioridade: escolha explícita > carteira do
 * corretor (cadastrada pelo Master) > nenhum. Assim, quando a ADM escolhe um
 * corretor já vinculado a um supervisor, a proposta já nasce com o
 * supervisor certo, sem precisar perguntar de novo.
 */
function resolverSupervisor(db, entrada) {
  if (entrada.supervisor_id) {
    const s = db.prepare("SELECT * FROM supervisores WHERE id = ?").get(Number(entrada.supervisor_id));
    if (!s) throw new ErroDeUso("Supervisor não encontrado.");
    return s;
  }
  if (nomeLimpo(entrada.nome_supervisor)) return supervisorPorNome(db, entrada.nome_supervisor);
  const corretor = nomeLimpo(entrada.corretor).toUpperCase();
  if (corretor) {
    const vinculo = db.prepare(`
      SELECT s.* FROM corretores c JOIN supervisores s ON s.id = c.supervisor_id
      WHERE c.nome = ? AND c.ativo = 1
    `).get(corretor);
    if (vinculo) return vinculo;
  }
  return null;
}

/**
 * A ADM responsável. Usuários só são cadastrados pelo Master (tela
 * Usuários) — por isso aqui só se BUSCA pelo id ou pelo nome; nunca se cria
 * um usuário novo a partir do cadastro de uma proposta.
 */
function resolverAdm(db, entrada) {
  if (entrada.usuario_id === "" || entrada.usuario_id === null) return null;
  if (entrada.usuario_id !== undefined) {
    const u = db.prepare("SELECT * FROM usuarios WHERE id = ?").get(Number(entrada.usuario_id));
    if (!u) throw new ErroDeUso("Responsável ADM não encontrado.");
    return u;
  }
  if (nomeLimpo(entrada.nome_adm)) {
    const u = db.prepare("SELECT * FROM usuarios WHERE nome = ?").get(nomeLimpo(entrada.nome_adm).toUpperCase());
    if (!u) throw new ErroDeUso("Responsável ADM não encontrado.");
    return u;
  }
  return null;
}

/** Campos que o cadastro manual de proposta obriga (a importação de planilha não passa por aqui). */
function validarObrigatorios(entrada) {
  const faltando = [];
  if (!texto(entrada.razao_social)) faltando.push("Empresa");
  if (!somenteDigitos(entrada.documento)) faltando.push("CPF/CNPJ");
  if (!nomeLimpo(entrada.corretor)) faltando.push("Corretor");
  if (!texto(entrada.operadora)) faltando.push("Operadora");
  if (!texto(entrada.usuario_id) && !nomeLimpo(entrada.nome_adm)) faltando.push("Responsável ADM");
  if (lerValor(entrada.valor) === null) faltando.push("Valor");
  if (!lerData(entrada.data_proposta)) faltando.push("Emissão");
  if (faltando.length) {
    throw new ErroDeUso(`Preencha antes de cadastrar: ${faltando.join(", ")}.`);
  }
}

export function criarProposta(db, entrada, autor = "operacional") {
  validarObrigatorios(entrada);

  const razao = texto(entrada.razao_social);
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
    corretor: nomeLimpo(entrada.corretor).toUpperCase(),
    valor: lerValor(entrada.valor),
    data_proposta: lerData(entrada.data_proposta) || hoje(),
    data_validade: lerData(entrada.data_validade),
    cadastrado: texto(entrada.cadastrado).toUpperCase(),
    observacoes: texto(entrada.observacoes),
    // Marca permanente, decidida no cadastro: quem emitiu a proposta foi o
    // próprio corretor. Não é etapa nem status — é origem, e origem não muda.
    emitida_pelo_corretor: verdadeiro(entrada.emitida_pelo_corretor) ? 1 : 0,
    status_atual: status,
    pendencia_tipo: status === "pendente" ? texto(entrada.pendencia_tipo) : "",
    pendencia_detalhe: status === "pendente" ? texto(entrada.pendencia_detalhe) : "",
    ultima_verificacao: null,
    verificada_por: null,
    implantada_em: status === "implantada" ? hoje() : null,
    cancelada_em: status === "cancelada" ? hoje() : null,
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
      + (adm ? ` · responsável ${adm.nome}` : " · SEM RESPONSÁVEL ADM")
      + (proposta.emitida_pelo_corretor ? " · emitida pelo corretor" : ""),
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
  // a data de implantação/cancelamento é carimbada quando a proposta chega
  // naquela etapa e apagada se ela voltar atrás — são elas que alimentam
  // "implantadas no dia" e "cancelado no mês" (em R$, no dashboard).
  const implantadaEm = status === "implantada" ? (atual.implantada_em || hoje()) : null;
  const canceladaEm = status === "cancelada" ? (atual.cancelada_em || hoje()) : null;

  db.prepare(`
    UPDATE propostas SET status_atual = ?, atualizado_em = ?,
           pendencia_tipo = ?, pendencia_detalhe = ?, implantada_em = ?, cancelada_em = ? WHERE id = ?
  `).run(status, agora(), novoTipo, novoDetalhe, implantadaEm, canceladaEm, Number(id));

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
      mudancas.push(`Supervisor: ${antes?.nome || "—"} → ${supervisor.nome}`);
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
      mudancas.push(`Responsável ADM: ${antes} → ${adm?.nome || "SEM RESPONSÁVEL"}`);
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
    mudancas.push(`${ROTULO_CAMPO[campo] || campo}: ${antes ?? "—"} → ${novo ?? "—"}`);
  }

  if ("documento" in entrada) {
    const digitos = somenteDigitos(entrada.documento);
    if (digitos !== atual.documento) {
      set.documento = digitos;
      set.documento_exibido = formatarDocumento(entrada.documento) || texto(entrada.documento);
      mudancas.push(`CNPJ: ${atual.documento_exibido} → ${set.documento_exibido}`);
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
  const nome = nomeLimpo(entrada.nome).toUpperCase();
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
    const nome = nomeLimpo(entrada.nome).toUpperCase();
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

// ---------------------------------------------------------------- corretores

/** Carteira de corretores cadastrada pelo Master — alimenta o cadastro de proposta. */
export function listarCorretores(db) {
  return db.prepare(`
    SELECT c.id, c.nome, c.supervisor_id, s.nome AS supervisor_nome
    FROM corretores c LEFT JOIN supervisores s ON s.id = c.supervisor_id
    WHERE c.ativo = 1 ORDER BY s.nome, c.nome
  `).all();
}

/**
 * O coração da importação de carteira: pares [corretor, supervisor].
 *
 * Corretor que já existe tem o supervisor atualizado — é assim que se corrige
 * um vínculo errado, sem apagar nada. Supervisor que ainda não existe é criado
 * na hora (ver supervisorPorNome), então a carteira inteira sobe de uma vez,
 * sem cadastrar supervisor antes.
 *
 * Vincular o corretor ao supervisor aqui é o que faz a proposta nascer com o
 * supervisor certo depois: no cadastro, o sistema segue esse vínculo sozinho
 * (ver resolverSupervisor).
 */
function importarCorretores(db, pares) {
  let importados = 0;
  let atualizados = 0;
  let ignorados = 0;

  for (const [corretorBruto, supervisorBruto] of pares) {
    const nome = nomeLimpo(corretorBruto).toUpperCase();
    const nomeSupervisor = nomeLimpo(supervisorBruto);
    // cabeçalho da planilha, em qualquer capitalização
    if (nome === "CORRETOR") continue;
    if (!nome && !nomeSupervisor) continue;
    if (!nome || !nomeSupervisor) { ignorados += 1; continue; }

    const supervisor = supervisorPorNome(db, nomeSupervisor);
    const existente = db.prepare("SELECT id, supervisor_id, ativo FROM corretores WHERE nome = ?").get(nome);
    if (existente) {
      // linha repetida que não muda nada não conta como atualização
      if (existente.supervisor_id === supervisor.id && existente.ativo === 1) continue;
      db.prepare("UPDATE corretores SET supervisor_id = ?, ativo = 1 WHERE id = ?").run(supervisor.id, existente.id);
      atualizados += 1;
    } else {
      db.prepare("INSERT INTO corretores (nome, supervisor_id) VALUES (?, ?)").run(nome, supervisor.id);
      importados += 1;
    }
  }

  if (!importados && !atualizados && !ignorados) {
    throw new ErroDeUso("Não encontrei nenhuma linha preenchida com corretor e supervisor.");
  }
  return { importados, atualizados, ignorados };
}

/**
 * Cadastro avulso de um corretor: nome digitado, supervisor escolhido entre os
 * que existem. É o caminho de todo dia — subir planilha é para carteira nova
 * ou correção em massa.
 */
export function criarCorretor(db, entrada) {
  const nome = nomeLimpo(entrada.nome).toUpperCase();
  if (!nome) throw new ErroDeUso("Informe o nome do corretor.");

  const supervisor = db.prepare("SELECT * FROM supervisores WHERE id = ? AND ativo = 1")
    .get(Number(entrada.supervisor_id));
  if (!supervisor) throw new ErroDeUso("Escolha o supervisor responsável.");

  const existente = db.prepare("SELECT id, supervisor_id, ativo FROM corretores WHERE nome = ?").get(nome);
  if (existente) {
    if (existente.supervisor_id === supervisor.id && existente.ativo === 1) {
      throw new ErroDeUso(`${nome} já está na carteira de ${supervisor.nome}.`);
    }
    db.prepare("UPDATE corretores SET supervisor_id = ?, ativo = 1 WHERE id = ?").run(supervisor.id, existente.id);
    return { nome, supervisor: supervisor.nome, atualizado: true };
  }

  db.prepare("INSERT INTO corretores (nome, supervisor_id) VALUES (?, ?)").run(nome, supervisor.id);
  return { nome, supervisor: supervisor.nome, atualizado: false };
}

/**
 * A carteira inteira, agrupada por supervisor — é o que a tela do Master
 * desenha. Traz também os desativados, para não sumirem sem explicação, e a
 * contagem de propostas de cada um, que é o que decide se dá para excluir.
 */
export function carteira(db) {
  const supervisores = db.prepare(`
    SELECT s.id, s.nome, s.ativo,
           (SELECT COUNT(*) FROM propostas p WHERE p.supervisor_id = s.id) AS propostas
    FROM supervisores s ORDER BY s.ativo DESC, s.nome
  `).all();

  const corretores = db.prepare(`
    SELECT c.id, c.nome, c.ativo, c.supervisor_id,
           (SELECT COUNT(*) FROM propostas p WHERE p.corretor = c.nome) AS propostas
    FROM corretores c ORDER BY c.ativo DESC, c.nome
  `).all();

  return supervisores.map((s) => ({
    ...s,
    corretores: corretores.filter((c) => c.supervisor_id === s.id),
  })).concat(
    corretores.some((c) => !c.supervisor_id)
      ? [{ id: null, nome: "Sem supervisor", ativo: 1, propostas: 0,
           corretores: corretores.filter((c) => !c.supervisor_id) }]
      : [],
  );
}

export function criarSupervisor(db, entrada) {
  const nome = nomeLimpo(entrada.nome).toUpperCase();
  if (!nome) throw new ErroDeUso("Informe o nome do supervisor.");
  const existente = db.prepare("SELECT id, ativo FROM supervisores WHERE nome = ?").get(nome);
  if (existente) {
    if (existente.ativo) throw new ErroDeUso(`${nome} já está cadastrado.`);
    db.prepare("UPDATE supervisores SET ativo = 1 WHERE id = ?").run(existente.id);
    return { nome, reativado: true };
  }
  db.prepare("INSERT INTO supervisores (nome) VALUES (?)").run(nome);
  return { nome, reativado: false };
}

/**
 * Editar um corretor sem desfazer nada: trocar o nome, passar para outro
 * supervisor, ou as duas coisas.
 *
 * Renomear atualiza também o nome copiado dentro das propostas — lá o corretor
 * é texto, e deixar o antigo faria a proposta sumir da carteira dele. Trocar de
 * supervisor mexe só na carteira: as propostas antigas continuam com o
 * supervisor que tinham quando foram feitas, porque foi ele quem as
 * acompanhou. Quem muda de mão é o corretor, não o histórico.
 */
export function editarCorretor(db, id, entrada) {
  const corretor = db.prepare("SELECT * FROM corretores WHERE id = ?").get(Number(id));
  if (!corretor) throw new ErroDeUso("Corretor não encontrado.", 404);

  const mudou = [];

  if (entrada.nome !== undefined) {
    const nome = nomeLimpo(entrada.nome).toUpperCase();
    if (!nome) throw new ErroDeUso("O nome não pode ficar vazio.");
    if (nome !== corretor.nome) {
      const outro = db.prepare("SELECT id FROM corretores WHERE nome = ? AND id <> ?").get(nome, corretor.id);
      if (outro) throw new ErroDeUso(`Já existe outro corretor chamado ${nome}.`, 409);
      db.prepare("UPDATE corretores SET nome = ? WHERE id = ?").run(nome, corretor.id);
      db.prepare("UPDATE propostas SET corretor = ? WHERE corretor = ?").run(nome, corretor.nome);
      mudou.push(`${corretor.nome} agora é ${nome}`);
    }
  }

  if (entrada.supervisor_id !== undefined && Number(entrada.supervisor_id) !== corretor.supervisor_id) {
    const supervisor = db.prepare("SELECT * FROM supervisores WHERE id = ? AND ativo = 1")
      .get(Number(entrada.supervisor_id));
    if (!supervisor) throw new ErroDeUso("Escolha o supervisor responsável.");
    db.prepare("UPDATE corretores SET supervisor_id = ? WHERE id = ?").run(supervisor.id, corretor.id);
    mudou.push(`passou para a carteira de ${supervisor.nome}`);
  }

  if (!mudou.length) return { mudou: false, resumo: "Nada mudou." };
  return { mudou: true, resumo: `${mudou.join(" e ")}.` };
}

/** Renomear supervisor. O vínculo é por id, então a carteira segue junto. */
export function editarSupervisor(db, id, entrada) {
  const supervisor = db.prepare("SELECT * FROM supervisores WHERE id = ?").get(Number(id));
  if (!supervisor) throw new ErroDeUso("Supervisor não encontrado.", 404);

  const nome = nomeLimpo(entrada.nome).toUpperCase();
  if (!nome) throw new ErroDeUso("O nome não pode ficar vazio.");
  if (nome === supervisor.nome) return { mudou: false, resumo: "Nada mudou." };

  const outro = db.prepare("SELECT id FROM supervisores WHERE nome = ? AND id <> ?").get(nome, supervisor.id);
  if (outro) throw new ErroDeUso(`Já existe outro supervisor chamado ${nome}.`, 409);

  db.prepare("UPDATE supervisores SET nome = ? WHERE id = ?").run(nome, supervisor.id);
  return { mudou: true, resumo: `${supervisor.nome} agora é ${nome}.` };
}

/**
 * Excluir, nas três tabelas, segue uma regra só: some de vez quando nada
 * depende dele; quando alguma proposta depende, é desativado.
 *
 * Apagar de verdade quem já aparece em proposta antiga deixaria o histórico
 * mentindo — relatório sem responsável, proposta sem corretor. Desativar tira
 * a pessoa das listas de hoje e preserva o que já aconteceu.
 */
function excluirOuDesativar(db, tabela, id, propostas, rotulo) {
  const linha = db.prepare(`SELECT id, nome, ativo FROM ${tabela} WHERE id = ?`).get(Number(id));
  if (!linha) throw new ErroDeUso(`${rotulo} não encontrado.`, 404);

  if (propostas > 0) {
    if (!linha.ativo) throw new ErroDeUso(`${linha.nome} já está desativado, e não dá para apagar: aparece em ${propostas} proposta${propostas === 1 ? "" : "s"}.`);
    db.prepare(`UPDATE ${tabela} SET ativo = 0 WHERE id = ?`).run(linha.id);
    return { nome: linha.nome, desativado: true, propostas };
  }

  db.prepare(`DELETE FROM ${tabela} WHERE id = ?`).run(linha.id);
  return { nome: linha.nome, desativado: false, propostas: 0 };
}

export function excluirUsuario(db, id) {
  const usuario = db.prepare("SELECT * FROM usuarios WHERE id = ?").get(Number(id));
  if (!usuario) throw new ErroDeUso("Usuário não encontrado.", 404);
  if (usuario.papel === "master") throw new ErroDeUso("O usuário Master não pode ser excluído.");
  const n = db.prepare("SELECT COUNT(*) AS n FROM propostas WHERE usuario_id = ?").get(usuario.id).n;
  return excluirOuDesativar(db, "usuarios", usuario.id, n, "Usuário");
}

export function excluirCorretor(db, id) {
  const corretor = db.prepare("SELECT * FROM corretores WHERE id = ?").get(Number(id));
  if (!corretor) throw new ErroDeUso("Corretor não encontrado.", 404);
  const n = db.prepare("SELECT COUNT(*) AS n FROM propostas WHERE corretor = ?").get(corretor.nome).n;
  return excluirOuDesativar(db, "corretores", corretor.id, n, "Corretor");
}

export function excluirSupervisor(db, id) {
  const supervisor = db.prepare("SELECT * FROM supervisores WHERE id = ?").get(Number(id));
  if (!supervisor) throw new ErroDeUso("Supervisor não encontrado.", 404);

  // Corretor órfão não existe: ou se move a carteira antes, ou o vínculo se
  // perderia em silêncio e o supervisor da próxima proposta viria vazio.
  const naCarteira = db.prepare("SELECT COUNT(*) AS n FROM corretores WHERE supervisor_id = ? AND ativo = 1")
    .get(supervisor.id).n;
  if (naCarteira > 0) {
    throw new ErroDeUso(
      `${supervisor.nome} ainda tem ${naCarteira} corretor${naCarteira === 1 ? "" : "es"} na carteira. ` +
      "Passe esses corretores para outro supervisor antes de excluir.",
    );
  }

  const n = db.prepare("SELECT COUNT(*) AS n FROM propostas WHERE supervisor_id = ?").get(supervisor.id).n;
  return excluirOuDesativar(db, "supervisores", supervisor.id, n, "Supervisor");
}

/** Volta alguém desativado para as listas de hoje. */
export function reativar(db, tabela, id) {
  if (!["usuarios", "corretores", "supervisores"].includes(tabela)) {
    throw new ErroDeUso("Tabela inválida.");
  }
  const linha = db.prepare(`SELECT id, nome FROM ${tabela} WHERE id = ?`).get(Number(id));
  if (!linha) throw new ErroDeUso("Não encontrado.", 404);
  db.prepare(`UPDATE ${tabela} SET ativo = 1 WHERE id = ?`).run(linha.id);
  return { nome: linha.nome };
}

/** Importa "corretor,supervisor" em texto (uma linha por corretor). */
export function importarCorretoresCSV(db, csv) {
  const pares = String(csv || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split(/[,;\t]/));
  return importarCorretores(db, pares);
}

/** Importa a mesma coisa vinda de uma planilha .xlsx: coluna A e coluna B. */
export function importarCorretoresXlsx(db, buffer) {
  let linhas;
  try {
    linhas = lerXlsx(buffer);
  } catch (erro) {
    throw new ErroDeUso(`Não consegui ler a planilha: ${erro.message}`);
  }
  return importarCorretores(db, linhas.map((l) => [l[0], l[1]]));
}

/**
 * Planilha modelo para subir carteira. Quando já existem corretores, o modelo
 * sai preenchido com a carteira atual: dá para conferir, corrigir um vínculo
 * e acrescentar os novos no fim, tudo no mesmo arquivo. Reimportar sem mexer
 * não muda nada.
 */
export function modeloCorretoresXlsx(db) {
  const atuais = listarCorretores(db).map((c) => [c.nome, c.supervisor_nome || ""]);
  return gerarXlsx([["Corretor", "Supervisor"], ...atuais], {
    aba: "Corretores",
    larguras: [38, 30],
  });
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
    corretores_cadastro: listarCorretores(db),
    hoje: hoje(),
  };
}

/** Conferência de documento usada pelo formulário de cadastro. */
export function conferirDocumento(valor) {
  return { ...validarDocumento(valor), formatado: formatarDocumento(valor) };
}

/** Anos e meses com propostas implantadas — alimenta a navegação da tela Implantadas. */
export function implantadasPorMes(db) {
  return db.prepare(`
    SELECT substr(implantada_em, 1, 4) AS ano, substr(implantada_em, 6, 2) AS mes,
           COUNT(*) AS quantidade, SUM(valor) AS valor
    FROM propostas
    WHERE status_atual = 'implantada' AND implantada_em IS NOT NULL AND implantada_em <> ''
    GROUP BY ano, mes ORDER BY ano DESC, mes DESC
  `).all();
}
