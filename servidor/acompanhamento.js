/**
 * MÓDULO 2 e 3 — ACOMPANHAMENTO e ALERTAS
 *
 * O que este módulo resolve: saber, todo dia, se cada proposta foi olhada por
 * alguém — e, quando não foi, há quantos dias está largada.
 *
 * A peça central é o botão "Verificar proposta". Cada clique vira uma linha em
 * `verificacoes`: dia, hora, ADM e etapa. É desse registro bruto que saem o
 * nível de atraso, o dashboard da ADM e todos os relatórios do Master.
 *
 * Níveis (ver NIVEIS em dominio.js):
 *   🟢 acompanhando  verificada hoje
 *   🟡 pendente      não verificada hoje        -> pendência operacional normal
 *   🔴 atrasada      2 a 4 dias sem verificação -> entra em ALERTAS
 *   🔴 crítica       5 dias ou mais             -> alerta grave
 */

import { preparar, registrarHistorico } from "./banco.js";
import { ETAPAS, NIVEIS, diasEntre, etapa, hoje, texto } from "./dominio.js";

const agora = () => new Date().toISOString().slice(0, 19).replace("T", " ");

/**
 * Expressão SQL que devolve os dias sem verificação de cada proposta.
 * Sem verificação nenhuma, conta desde o cadastro — uma proposta que nunca foi
 * olhada está tão largada quanto uma verificada há muito tempo.
 */
export const SQL_DIAS_SEM_VERIFICAR = `
  CAST(julianday(:hoje) - julianday(date(COALESCE(p.ultima_verificacao, p.criado_em))) AS INTEGER)
`;

/** Etapas que exigem acompanhamento (as que têm prazo). */
const ETAPAS_ABERTAS = () => ETAPAS_COM_PRAZO;
const ETAPAS_COM_PRAZO = (await import("./dominio.js")).ETAPAS
  .filter((e) => e.prazo).map((e) => `'${e.codigo}'`).join(", ");

/** Trecho de SQL que classifica a proposta em um dos níveis. */
export const SQL_NIVEL = `
  CASE
    WHEN p.status_atual NOT IN (${ETAPAS_COM_PRAZO}) THEN 'encerrada'
    WHEN ${SQL_DIAS_SEM_VERIFICAR} <= 0 THEN 'acompanhando'
    WHEN ${SQL_DIAS_SEM_VERIFICAR}  = 1 THEN 'pendente'
    WHEN ${SQL_DIAS_SEM_VERIFICAR} <= 4 THEN 'atrasada'
    ELSE 'critica'
  END
`;

// ------------------------------------------------------- verificar proposta

/**
 * Registra a verificação de uma proposta pela ADM.
 *
 * Isso: grava data, hora e quem verificou; atualiza a última verificação da
 * proposta; e tira ela da condição de atraso — o nível volta a "acompanhando"
 * porque passa a contar zero dia sem verificação.
 */
export function verificar(db, propostaId, { usuario_id, observacao = "" } = {}) {
  const proposta = db.prepare("SELECT * FROM propostas WHERE id = ?").get(Number(propostaId));
  if (!proposta) return null;

  const usuario = usuario_id
    ? db.prepare("SELECT * FROM usuarios WHERE id = ?").get(Number(usuario_id))
    : null;

  const quando = agora();
  const dia = hoje();

  db.prepare(`
    INSERT INTO verificacoes (proposta_id, usuario_id, dia, quando, etapa, observacao)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(proposta.id, usuario?.id ?? null, dia, quando, proposta.status_atual, texto(observacao));

  db.prepare(`
    UPDATE propostas SET ultima_verificacao = ?, verificada_por = ?, atualizado_em = ?
    WHERE id = ?
  `).run(quando, usuario?.id ?? null, quando, proposta.id);

  registrarHistorico(db, proposta.id, {
    tipo: "verificacao",
    para: proposta.status_atual,
    descricao: `Proposta verificada${observacao ? `: ${texto(observacao)}` : "."}`,
    autor: usuario?.nome || "operacional",
  });

  return { quando, dia, usuario: usuario?.nome || null };
}

/** As últimas verificações de uma proposta, para mostrar na ficha. */
export function verificacoesDaProposta(db, propostaId, limite = 12) {
  return db.prepare(`
    SELECT v.quando, v.dia, v.etapa, v.observacao, u.nome AS usuario
    FROM verificacoes v LEFT JOIN usuarios u ON u.id = v.usuario_id
    WHERE v.proposta_id = ? ORDER BY v.id DESC LIMIT ?
  `).all(Number(propostaId), limite);
}

// -------------------------------------------------------- números do dia

/**
 * Como está a fila de acompanhamento AGORA. Serve tanto para o dashboard da
 * ADM (com usuario_id) quanto para a visão geral do Master (sem).
 *
 * `usuario_id`: número = uma ADM · "sem" = propostas sem responsável ·
 * null/undefined = todas.
 */
export function situacaoAtual(db, { usuario_id = null } = {}) {
  const dia = hoje();
  const { onde, args } = filtroUsuario(usuario_id);

  const linha = preparar(db, `
    SELECT
      COUNT(*) FILTER (WHERE p.status_atual IN (${ETAPAS_COM_PRAZO}))                       AS para_acompanhar,
      COUNT(*) FILTER (WHERE ${SQL_NIVEL} = 'acompanhando')                                 AS acompanhadas,
      COUNT(*) FILTER (WHERE ${SQL_NIVEL} = 'pendente')                                     AS pendentes,
      COUNT(*) FILTER (WHERE ${SQL_NIVEL} = 'atrasada')                                     AS atrasadas,
      COUNT(*) FILTER (WHERE ${SQL_NIVEL} = 'critica')                                      AS criticas,
      COUNT(*) FILTER (WHERE date(p.criado_em) = :hoje)                                     AS novas_hoje,
      COUNT(*) FILTER (WHERE p.implantada_em = :hoje)                                       AS implantadas_hoje,
      COUNT(*) FILTER (WHERE p.status_atual = 'implantada')                                 AS implantadas,
      COUNT(*)                                                                              AS total
    FROM propostas p ${onde}
  `).get({ hoje: dia, ...args });

  const emAlerta = linha.atrasadas + linha.criticas;
  const naoAcompanhadas = linha.pendentes + emAlerta;

  return {
    dia,
    ...linha,
    em_alerta: emAlerta,
    nao_acompanhadas: naoAcompanhadas,
    taxa: linha.para_acompanhar
      ? Math.round((linha.acompanhadas / linha.para_acompanhar) * 1000) / 10
      : 100,
  };
}

/**
 * Cenário do mês, em R$: quanto está em cada etapa agora, mais o que foi
 * implantado e cancelado NESTE mês. As etapas em aberto são "quanto há
 * agora"; implantado/cancelado são "quanto virou isso desde o dia 1º" — por
 * isso viram automaticamente quando o mês muda, sem precisar zerar nada.
 */
export function valoresPainel(db, { usuario_id = null } = {}) {
  const dia = hoje();
  const inicioMes = `${dia.slice(0, 7)}-01`;
  const { onde, args } = filtroUsuario(usuario_id);
  const e = (onde ? `${onde} AND` : "WHERE");

  const somar = (condicao, extra = {}) => preparar(db, `
    SELECT COALESCE(SUM(p.valor), 0) AS total, COUNT(*) AS quantidade
    FROM propostas p ${e} ${condicao}
  `).get({ ...args, ...extra });

  return {
    dia,
    para_acompanhar: somar(`p.status_atual IN (${ETAPAS_COM_PRAZO})`),
    em_analise: somar(`p.status_atual = 'em_analise'`),
    cotacao: somar(`p.status_atual = 'cotacao'`),
    enviada: somar(`p.status_atual = 'enviada'`),
    pendente: somar(`p.status_atual = 'pendente'`),
    em_implantacao: somar(`p.status_atual = 'em_implantacao'`),
    implantado_mes: somar(`p.status_atual = 'implantada' AND p.implantada_em >= :inicioMes`, { inicioMes }),
    cancelado_mes: somar(`p.status_atual = 'cancelada' AND p.cancelada_em >= :inicioMes`, { inicioMes }),
  };
}

/**
 * Painel de fechamento do mês para o Master: por etapa, quantidade e valor.
 * Implantada/cancelada usam a data em que entraram naquela etapa; as demais
 * usam a data de emissão — é "como terminaram as propostas nascidas nesse
 * período", a leitura que faz sentido para um mês que já passou.
 */
export function panoramaMes(db, { inicio, fim, usuario_id = null } = {}) {
  const { onde, args } = filtroUsuario(usuario_id);
  const e = (onde ? `${onde} AND` : "WHERE");

  const linhas = ETAPAS.map((et) => {
    const condicao = et.codigo === "implantada"
      ? `p.status_atual = 'implantada' AND p.implantada_em BETWEEN :inicio AND :fim`
      : et.codigo === "cancelada"
        ? `p.status_atual = 'cancelada' AND p.cancelada_em BETWEEN :inicio AND :fim`
        : `p.status_atual = '${et.codigo}' AND p.data_proposta BETWEEN :inicio AND :fim`;

    const r = preparar(db, `
      SELECT COUNT(*) AS quantidade, COALESCE(SUM(p.valor), 0) AS valor
      FROM propostas p ${e} ${condicao}
    `).get({ ...args, inicio, fim });

    return { codigo: et.codigo, nome: et.nome, quantidade: r.quantidade, valor: r.valor };
  });

  const total = linhas.reduce((acc, l) => ({
    quantidade: acc.quantidade + l.quantidade,
    valor: acc.valor + l.valor,
  }), { quantidade: 0, valor: 0 });

  return { inicio, fim, por_etapa: linhas, total };
}

/** WHERE por responsável. "sem" = propostas sem ADM vinculada. */
export function filtroUsuario(usuario_id) {
  if (usuario_id === "sem") return { onde: "WHERE p.usuario_id IS NULL", args: {} };
  if (usuario_id === null || usuario_id === undefined || usuario_id === "") {
    return { onde: "", args: {} };
  }
  return { onde: "WHERE p.usuario_id = :uid", args: { uid: Number(usuario_id) } };
}

/** Quadro do Master: uma linha por ADM, com a taxa de acompanhamento. */
export function porUsuario(db) {
  const dia = hoje();
  const linhas = preparar(db, `
    SELECT
      u.id   AS usuario_id,
      u.nome AS usuario,
      COUNT(p.id) FILTER (WHERE p.status_atual IN (${ETAPAS_COM_PRAZO}))  AS para_acompanhar,
      COUNT(p.id) FILTER (WHERE ${SQL_NIVEL} = 'acompanhando')            AS acompanhadas,
      COUNT(p.id) FILTER (WHERE ${SQL_NIVEL} = 'pendente')                AS pendentes,
      COUNT(p.id) FILTER (WHERE ${SQL_NIVEL} = 'atrasada')                AS atrasadas,
      COUNT(p.id) FILTER (WHERE ${SQL_NIVEL} = 'critica')                 AS criticas,
      COUNT(p.id) FILTER (WHERE date(p.criado_em) = :hoje)                AS novas,
      COUNT(p.id) FILTER (WHERE p.status_atual = 'implantada')            AS implantadas,
      COUNT(p.id)                                                         AS total
    FROM usuarios u LEFT JOIN propostas p ON p.usuario_id = u.id
    WHERE u.ativo = 1
    GROUP BY u.id ORDER BY u.nome
  `).all({ hoje: dia });

  const semDono = db.prepare(`
    SELECT COUNT(*) AS total,
           COUNT(*) FILTER (WHERE p.status_atual IN (${ETAPAS_COM_PRAZO})) AS para_acompanhar
    FROM propostas p WHERE p.usuario_id IS NULL
  `).get();

  return {
    dia,
    usuarios: linhas.map((l) => ({
      ...l,
      nao_acompanhadas: l.pendentes + l.atrasadas + l.criticas,
      taxa: l.para_acompanhar
        ? Math.round((l.acompanhadas / l.para_acompanhar) * 1000) / 10
        : 100,
    })),
    sem_responsavel: semDono.total,
    sem_responsavel_para_acompanhar: semDono.para_acompanhar,
  };
}

// ------------------------------------------------------- histórico diário

/**
 * Fecha os dias que já passaram.
 *
 * O dia de hoje é sempre calculado ao vivo. Um dia que já terminou precisa ser
 * congelado, senão o passado mudaria sozinho: uma proposta implantada amanhã
 * sairia da conta de "para acompanhar" de ontem, e o número que o Master viu
 * não bateria mais com o que ele vê depois.
 *
 * Roda barato: só percorre os dias entre o último fechamento e ontem.
 */
export function fecharDiasPassados(db) {
  const ontem = somarDias(hoje(), -1);

  const ultimo = db.prepare("SELECT MAX(dia) AS dia FROM dia_resumo").get().dia;
  const primeiraVerificacao = db.prepare("SELECT MIN(dia) AS dia FROM verificacoes").get().dia;
  const inicio = ultimo ? somarDias(ultimo, 1) : primeiraVerificacao;
  if (!inicio || inicio > ontem) return 0;

  let fechados = 0;
  for (let dia = inicio; dia <= ontem; dia = somarDias(dia, 1)) {
    fecharDia(db, dia);
    fechados += 1;
  }
  return fechados;
}

/**
 * Congela os números de um dia, por ADM.
 *
 * "Para acompanhar" naquele dia = propostas que já existiam e ainda estavam
 * abertas. Uma proposta implantada no dia 10 não era trabalho pendente no dia
 * 12 — contá-la inflaria a carteira e faria a taxa da ADM despencar sem
 * motivo. Canceladas ficam de fora: a planilha não guarda a data do
 * cancelamento, e tratá-las como abertas seria pior do que excluí-las.
 */
export function fecharDia(db, dia) {
  const linhas = preparar(db, `
    SELECT
      p.usuario_id                                     AS usuario_id,
      COUNT(*) FILTER (WHERE date(p.criado_em) = :dia) AS novas,
      COUNT(*) FILTER (
        WHERE date(p.criado_em) <= :dia
          AND p.status_atual <> 'cancelada'
          AND (p.implantada_em IS NULL OR p.implantada_em > :dia)
      )                                                AS para_acompanhar,
      COUNT(*) FILTER (WHERE p.implantada_em = :dia)   AS implantadas
    FROM propostas p GROUP BY p.usuario_id
  `).all({ dia });

  const verificadas = preparar(db, `
    SELECT usuario_id, COUNT(DISTINCT proposta_id) AS n
    FROM verificacoes WHERE dia = :dia GROUP BY usuario_id
  `).all({ dia });
  const porAdm = new Map(verificadas.map((v) => [v.usuario_id, v.n]));

  const gravar = db.prepare(`
    INSERT OR REPLACE INTO dia_resumo
      (dia, usuario_id, novas, para_acompanhar, acompanhadas, nao_acompanhadas, atrasadas, implantadas)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const l of linhas) {
    const acompanhadas = porAdm.get(l.usuario_id) || 0;
    const naoAcompanhadas = Math.max(l.para_acompanhar - acompanhadas, 0);
    gravar.run(dia, l.usuario_id, l.novas, l.para_acompanhar, acompanhadas, naoAcompanhadas, 0, l.implantadas);
  }
}

/**
 * Histórico dia a dia de uma ADM (ou de todas). Dias passados vêm do
 * fechamento; hoje é calculado ao vivo.
 */
export function historicoDiario(db, { usuario_id = null, de, ate } = {}) {
  const fim = ate || hoje();
  const inicio = de || somarDias(fim, -29);
  fecharDiasPassados(db);

  const filtro = usuario_id === "sem" ? "AND usuario_id IS NULL"
    : usuario_id ? "AND usuario_id = :uid" : "";
  const args = { inicio, fim };
  if (usuario_id && usuario_id !== "sem") args.uid = Number(usuario_id);

  const dias = preparar(db, `
    SELECT dia,
           SUM(novas) AS novas, SUM(para_acompanhar) AS para_acompanhar,
           SUM(acompanhadas) AS acompanhadas, SUM(nao_acompanhadas) AS nao_acompanhadas,
           SUM(implantadas) AS implantadas
    FROM dia_resumo
    WHERE dia BETWEEN :inicio AND :fim ${filtro}
    GROUP BY dia ORDER BY dia DESC
  `).all(args);

  // hoje entra ao vivo, no topo
  if (fim >= hoje()) {
    const agoraMesmo = situacaoAtual(db, { usuario_id });
    dias.unshift({
      dia: hoje(),
      novas: agoraMesmo.novas_hoje,
      para_acompanhar: agoraMesmo.para_acompanhar,
      acompanhadas: agoraMesmo.acompanhadas,
      nao_acompanhadas: agoraMesmo.nao_acompanhadas,
      implantadas: agoraMesmo.implantadas_hoje,
      hoje: true,
    });
  }

  return dias.map((d) => ({
    ...d,
    taxa: d.para_acompanhar
      ? Math.round((d.acompanhadas / d.para_acompanhar) * 1000) / 10
      : 100,
  }));
}

// ------------------------------------------------------------- relatórios

/**
 * Relatório do período: consolidado + uma linha por ADM + o dia a dia.
 *
 * Os dias que já fecharam vêm de `dia_resumo`; o dia de hoje entra ao vivo.
 * Sem isso, um relatório gerado hoje de manhã mostraria tudo zerado — o dia
 * ainda não foi fechado.
 */
export function relatorio(db, { periodo = "semana", de, ate, usuario_id = null } = {}) {
  const { inicio, fim, titulo } = intervalo(periodo, de, ate);
  fecharDiasPassados(db);

  const incluiHoje = inicio <= hoje() && fim >= hoje();
  const filtro = usuario_id === "sem" ? "AND d.usuario_id IS NULL"
    : usuario_id ? "AND d.usuario_id = :uid" : "";
  const args = { inicio, fim };
  if (usuario_id && usuario_id !== "sem") args.uid = Number(usuario_id);

  // dias já fechados
  const acumulado = new Map();
  const somar = (id, nome, dados) => {
    const atual = acumulado.get(id) || {
      usuario_id: id, usuario: nome,
      novas: 0, para_acompanhar: 0, acompanhadas: 0, nao_acompanhadas: 0, implantadas: 0,
    };
    for (const chave of ["novas", "para_acompanhar", "acompanhadas", "nao_acompanhadas", "implantadas"]) {
      atual[chave] += dados[chave] || 0;
    }
    acumulado.set(id, atual);
  };

  for (const l of preparar(db, `
    SELECT COALESCE(u.nome, 'SEM RESPONSÁVEL') AS usuario, d.usuario_id,
           SUM(d.novas) AS novas, SUM(d.para_acompanhar) AS para_acompanhar,
           SUM(d.acompanhadas) AS acompanhadas, SUM(d.nao_acompanhadas) AS nao_acompanhadas,
           SUM(d.implantadas) AS implantadas
    FROM dia_resumo d LEFT JOIN usuarios u ON u.id = d.usuario_id
    WHERE d.dia BETWEEN :inicio AND :fim AND d.dia < :hoje ${filtro}
    GROUP BY d.usuario_id
  `).all({ ...args, hoje: hoje() })) {
    somar(l.usuario_id, l.usuario, l);
  }

  // o dia de hoje, ao vivo
  if (incluiHoje) {
    const agoraMesmo = porUsuario(db);
    for (const u of agoraMesmo.usuarios) {
      if (usuario_id === "sem") continue;
      if (usuario_id && Number(usuario_id) !== u.usuario_id) continue;
      somar(u.usuario_id, u.usuario, u);
    }
  }

  const porAdm = [...acumulado.values()]
    .map((l) => ({
      ...l,
      taxa: l.para_acompanhar
        ? Math.round((l.acompanhadas / l.para_acompanhar) * 1000) / 10
        : 100,
    }))
    .sort((a, b) => a.usuario.localeCompare(b.usuario));

  const total = porAdm.reduce((acc, l) => ({
    novas: acc.novas + l.novas,
    para_acompanhar: acc.para_acompanhar + l.para_acompanhar,
    acompanhadas: acc.acompanhadas + l.acompanhadas,
    nao_acompanhadas: acc.nao_acompanhadas + l.nao_acompanhadas,
    implantadas: acc.implantadas + l.implantadas,
  }), { novas: 0, para_acompanhar: 0, acompanhadas: 0, nao_acompanhadas: 0, implantadas: 0 });

  total.taxa = total.para_acompanhar
    ? Math.round((total.acompanhadas / total.para_acompanhar) * 1000) / 10
    : 100;

  // quantas estão em alerta AGORA (o atraso é uma foto do presente)
  const agoraMesmo = situacaoAtual(db, { usuario_id });

  return {
    titulo,
    inicio,
    fim,
    total,
    por_adm: porAdm,
    dia_a_dia: historicoDiario(db, { usuario_id, de: inicio, ate: fim }),
    alerta_agora: {
      atrasadas: agoraMesmo.atrasadas,
      criticas: agoraMesmo.criticas,
      pendentes: agoraMesmo.pendentes,
    },
    panorama: panoramaMes(db, { inicio, fim, usuario_id }),
  };
}

function intervalo(periodo, de, ate) {
  const fim = ate || hoje();
  if (periodo === "personalizado" && de) return { inicio: de, fim, titulo: "Período" };
  if (periodo === "hoje") return { inicio: fim, fim, titulo: "Hoje" };
  if (periodo === "mes") return { inicio: `${fim.slice(0, 7)}-01`, fim, titulo: "Mês" };
  return { inicio: somarDias(fim, -6), fim, titulo: "Semana" };   // padrão: 7 dias
}

export function somarDias(dia, quantos) {
  const base = Date.parse(`${dia}T00:00:00Z`) + quantos * 86400000;
  return new Date(base).toISOString().slice(0, 10);
}

export { NIVEIS, diasEntre, etapa };
