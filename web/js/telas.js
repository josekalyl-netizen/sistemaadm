/**
 * As telas do sistema. Cada função desenha uma tela dentro de #tela.
 *
 * Todas respeitam o usuário selecionado no topo: a ADM vê a carteira dela, o
 * Master escolhe "Todos" ou uma ADM específica.
 *
 * Acompanhamento, Relatórios, Usuários e Corretores são visualizações de
 * dentro da Área Master — não são abas de topo. Só Propostas, Pendentes,
 * Alertas e Implantadas ficam abertas para o dia a dia da ADM.
 */

import { $, $$, api, avisar, corRGB, data, diaSemana, esc, moeda, numero } from "./util.js";
import { estado, filtrosDaBusca, nomeDoUsuario, recarregarConfig } from "./estado.js";
import { cabecalhoTela, listaVazia, montarLista } from "./lista.js";
import { abrirFicha } from "./ficha.js";

const alvo = () => $("#tela");
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** Chamado pelo app quando o usuário muda de tela ou de filtro. */
export const TELAS = {
  propostas: { nome: "Propostas", desenhar: propostas },
  pendentes: { nome: "Pendentes", desenhar: pendentes },
  alertas: { nome: "Alertas", desenhar: alertas },
  implantadas: { nome: "Implantadas", desenhar: implantadas },
  master: { nome: "Master", desenhar: master },
};

/** Telas em que a busca global do topo faz sentido (onde aparecem propostas). */
export const TELAS_COM_BUSCA = ["propostas", "implantadas"];

// =================================================== 1. PROPOSTAS (+ painel)

async function propostas() {
  const [p, lista] = await Promise.all([
    api.painel({ usuario_id: estado.usuario }),
    api.listar(filtrosDaBusca()),
  ]);
  const cfg = estado.config;

  const bloco = (rotulo, valor, { destaque = false, ir = null } = {}) => `
    <div class="numero-bloco ${destaque && valor > 0 ? "destaque" : ""} ${ir ? "acionavel" : ""}"
         ${ir ? `data-ir="${ir}"` : ""}>
      <span class="rotulo">${esc(rotulo)}</span>
      <div class="numero">${numero(valor)}</div>
    </div>`;

  const blocoValor = (rotulo, obj, destaque = false) => `
    <div class="numero-bloco ${destaque ? "destaque" : ""}">
      <span class="rotulo">${esc(rotulo)}</span>
      <div class="numero dinheiro">${moeda(obj?.total ?? 0)}</div>
      <div class="apoio">${numero(obj?.quantidade ?? 0)} proposta${(obj?.quantidade ?? 0) === 1 ? "" : "s"}</div>
    </div>`;

  const opcoes = (valores, atual, rotulo = (v) => v, valor = (v) => v) =>
    valores.map((v) => `<option value="${esc(valor(v))}" ${String(valor(v)) === String(atual) ? "selected" : ""}>${esc(rotulo(v))}</option>`).join("");

  alvo().innerHTML = `
    ${cabecalhoTela(
      estado.usuario ? nomeDoUsuario() : "Propostas",
      `${data(p.dia)} · ${numero(lista.total)} no filtro atual`,
    )}

    <div class="numeros">
      ${bloco("Para acompanhar", p.para_acompanhar)}
      ${bloco("Acompanhadas hoje", p.acompanhadas)}
      ${bloco("Pendentes", p.pendentes, { ir: "pendentes" })}
      ${bloco("Atrasadas", p.atrasadas, { destaque: true, ir: "alertas" })}
      ${bloco("Críticas", p.criticas, { destaque: true, ir: "alertas" })}
      ${bloco("Implantadas hoje", p.implantadas_hoje, { ir: "implantadas" })}
      ${bloco("Novas hoje", p.novas_hoje)}
    </div>

    ${p.sem_responsavel && !estado.usuario ? `
      <div class="filtros-barra" style="border-bottom:1px solid rgb(var(--fio))">
        <span style="color:rgb(var(--alerta))">
          ${p.sem_responsavel} proposta${p.sem_responsavel === 1 ? "" : "s"} sem ADM responsável.
        </span>
        <button class="btn btn-mini" data-ir="alertas">Ver</button>
      </div>` : ""}

    <div style="padding-top:34px">
      <div class="secao">Em acompanhamento (R$)</div>
      <div class="faixa-valor">
        <span class="rotulo">Para acompanhar hoje</span>
        <span class="numero">${moeda(p.valores?.para_acompanhar?.total ?? 0)}</span>
        <span class="apoio">em ${numero(p.valores?.para_acompanhar?.quantidade ?? 0)} proposta${(p.valores?.para_acompanhar?.quantidade ?? 0) === 1 ? " aberta" : "s abertas"}</span>
      </div>
    </div>

    <div style="padding-top:34px">
      <div class="secao">Cenário do mês</div>
      <div class="numeros valores">
        ${blocoValor("Para acompanhar hoje", p.valores?.para_acompanhar)}
        ${blocoValor("Em análise", p.valores?.em_analise)}
        ${blocoValor("Cotação", p.valores?.cotacao)}
        ${blocoValor("Proposta enviada", p.valores?.enviada)}
        ${blocoValor("Pendente", p.valores?.pendente)}
        ${blocoValor("Em implantação", p.valores?.em_implantacao)}
        ${blocoValor("Implantado no mês", p.valores?.implantado_mes)}
        ${blocoValor("Cancelado no mês", p.valores?.cancelado_mes)}
      </div>
      <p class="dica" style="margin-top:10px">
        As etapas em aberto mostram o que está nelas agora; implantado e cancelado mostram
        o que aconteceu desde o dia 1º — vira sozinho quando o mês muda.
      </p>
    </div>

    <div style="padding-top:38px">
      <div class="secao">Propostas</div>

      <div class="tela-topo" style="padding-top:0">
        <span></span>
        <div class="direita">
          <select id="f-ordem" class="campo" style="width:auto">
            ${opcoes([
              ["recentes", "Atualizadas recentemente"], ["atraso", "Mais atrasadas"],
              ["etapa", "Etapa"], ["data", "Emissão"], ["valor", "Valor"], ["empresa", "Empresa A–Z"],
            ], estado.filtros.ordem, (o) => o[1], (o) => o[0])}
          </select>
        </div>
      </div>

      <div class="etapas" id="etapas"></div>

      <div class="filtros">
        <div>
          <label class="rotulo" for="f-verificacao">Verificação</label>
          <select id="f-verificacao" class="campo">
            ${opcoes([["", "Tanto faz"], ["pendente,atrasada,critica", "Não verificadas"]], estado.filtros.nivel, (o) => o[1], (o) => o[0])}
          </select>
        </div>
        <div>
          <label class="rotulo" for="f-operadora">Operadora</label>
          <select id="f-operadora" class="campo">
            <option value="">Todas</option>${opcoes(cfg.operadoras, estado.filtros.operadora)}
          </select>
        </div>
        <div>
          <label class="rotulo" for="f-corretor">Corretor</label>
          <select id="f-corretor" class="campo">
            <option value="">Todos</option>${opcoes(cfg.corretores, estado.filtros.corretor)}
          </select>
        </div>
        <div>
          <label class="rotulo" for="f-cadastrado">Cadastrado</label>
          <select id="f-cadastrado" class="campo">
            ${opcoes([["", "Tanto faz"], ["sim", "Sim"], ["nao", "Não"]], estado.filtros.cadastrado, (o) => o[1], (o) => o[0])}
          </select>
        </div>
        <div>
          <label class="rotulo" for="f-de">Emissão de</label>
          <input id="f-de" class="campo" type="date" value="${esc(estado.filtros.de)}">
        </div>
        <div>
          <label class="rotulo" for="f-ate">Emissão até</label>
          <input id="f-ate" class="campo" type="date" value="${esc(estado.filtros.ate)}">
        </div>
      </div>

      <div id="lista"></div>
    </div>`;

  desenharEtapas(lista.contagem_por_etapa, lista.total_no_filtro);
  montarLista($("#lista"), lista, { aoPaginar: paginar });

  const ligar = (sel, chave) => $(sel).addEventListener("change", (e) => {
    estado.filtros[chave] = e.target.value;
    estado.filtros.pagina = 1;
    redesenhar();
  });
  ligar("#f-verificacao", "nivel");
  ligar("#f-operadora", "operadora");
  ligar("#f-corretor", "corretor");
  ligar("#f-cadastrado", "cadastrado");
  ligar("#f-de", "de");
  ligar("#f-ate", "ate");
  ligar("#f-ordem", "ordem");

  $$("[data-ir]").forEach((b) => b.addEventListener("click", () => irPara(b.dataset.ir)));
}

/** A régua de etapas: clicar entra na etapa, clicar de novo sai. */
function desenharEtapas(contagem, total) {
  const item = (codigo, nome, qtd, cor, ativa) => `
    <button class="etapa-item ${ativa ? "ativa" : ""}" data-etapa="${codigo}" style="--cor:${cor}">
      <span class="nome">${codigo ? `<i class="ponto" style="--cor:${cor}"></i>` : ""}${esc(nome)}</span>
      <span class="qtd">${numero(qtd)}</span>
    </button>`;

  const partes = [item("", "Todas", total, "154 167 188", !estado.filtros.status)];
  for (const e of estado.config.etapas) {
    partes.push(item(e.codigo, e.nome, contagem[e.codigo] || 0, corRGB(e.cor), estado.filtros.status === e.codigo));
  }
  $("#etapas").innerHTML = partes.join("");

  $$("#etapas .etapa-item").forEach((b) => b.addEventListener("click", () => {
    estado.filtros.status = estado.filtros.status === b.dataset.etapa ? "" : b.dataset.etapa;
    estado.filtros.pagina = 1;
    redesenhar();
  }));
}

// ================================================== 2. PENDENTES / 3. ALERTAS

async function pendentes() {
  const lista = await api.listar(filtrosDaBusca({ nivel: "pendente", ordem: "atraso", status: "" }));
  alvo().innerHTML = `
    ${cabecalhoTela("Pendentes de acompanhamento", `${numero(lista.total)} propostas`)}
    <p class="apoio" style="max-width:620px;margin:-8px 0 22px;color:rgb(var(--apagado))">
      Não foram verificadas hoje. É a pendência operacional normal do dia — vira alerta se passar de dois dias.
    </p>
    <div id="lista"></div>`;
  montarLista($("#lista"), lista, {
    vazio: "Nenhuma pendência: tudo foi verificado hoje.",
    aoPaginar: paginar,
  });
}

async function alertas() {
  const [lista, semDono] = await Promise.all([
    api.listar(filtrosDaBusca({ nivel: "atrasada,critica", ordem: "atraso", status: "" })),
    api.listar({ usuario_id: "sem", limite: 50 }),
  ]);

  const criticas = lista.itens.filter((p) => p.nivel === "critica").length;

  alvo().innerHTML = `
    ${cabecalhoTela("Alertas", `${numero(lista.total)} propostas · ${criticas} críticas`)}
    <p class="apoio" style="max-width:620px;margin:-8px 0 22px;color:rgb(var(--apagado))">
      Dois dias ou mais sem verificação. A partir de cinco dias a proposta é considerada crítica.
    </p>

    ${semDono.total ? `
      <div class="bloco" style="padding:16px 20px;margin-bottom:26px">
        <div class="rotulo" style="color:rgb(var(--alerta))">Sem ADM responsável</div>
        <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
          <span>${numero(semDono.total)} proposta${semDono.total === 1 ? "" : "s"} que ninguém está acompanhando.</span>
          <select id="atribuir-adm" class="campo" style="width:auto;max-width:200px">
            <option value="">Atribuir todas a…</option>
            ${estado.config.usuarios.map((u) => `<option value="${u.id}">${esc(u.nome)}</option>`).join("")}
          </select>
        </div>
        <div id="lista-sem-dono" style="margin-top:14px"></div>
      </div>` : ""}

    <div id="lista"></div>`;

  montarLista($("#lista"), lista, { vazio: "Nenhum alerta. Nada passou de dois dias.", aoPaginar: paginar });

  if (semDono.total) {
    montarLista($("#lista-sem-dono"), semDono, { comVerificar: false });
    $("#atribuir-adm").addEventListener("change", async (e) => {
      if (!e.target.value) return;
      try {
        const r = await api.atribuir({
          ids: semDono.itens.map((p) => p.id),
          usuario_id: e.target.value,
        });
        avisar(`${r.atribuidas} proposta(s) agora são de ${r.usuario}.`);
        redesenhar();
      } catch (erro) { avisar(erro.message, "erro"); }
    });
  }
}

// ========================================= 4. IMPLANTADAS (ano → mês → lista)

let implAno = null;
let implMes = null;

async function implantadas() {
  const resumo = await api.implantadasResumo();
  const meses = resumo.meses;

  if (!meses.length) {
    alvo().innerHTML = cabecalhoTela("Implantadas", "0 propostas concluídas")
      + listaVazia("Nenhuma proposta implantada ainda.");
    return;
  }

  if (implAno && !meses.some((m) => m.ano === implAno)) { implAno = null; implMes = null; }

  if (!implAno) return implantadasAnos(meses);
  if (!implMes) return implantadasMeses(meses);
  return implantadasLista(meses);
}

function voltarLink(texto) {
  return `<button class="btn btn-limpo btn-mini" id="impl-voltar" style="padding-left:0">← ${esc(texto)}</button>`;
}

function implantadasAnos(meses) {
  const porAno = new Map();
  for (const m of meses) {
    const atual = porAno.get(m.ano) || { ano: m.ano, quantidade: 0, valor: 0 };
    atual.quantidade += m.quantidade;
    atual.valor += m.valor;
    porAno.set(m.ano, atual);
  }
  const anos = [...porAno.values()].sort((a, b) => b.ano - a.ano);
  const total = anos.reduce((a, b) => a + b.quantidade, 0);

  alvo().innerHTML = `
    ${cabecalhoTela("Implantadas", `${numero(total)} propostas concluídas · escolha o ano`)}
    <div class="numeros compacta">
      ${anos.map((a) => `
        <button class="numero-bloco acionavel" data-ano="${a.ano}" style="text-align:left;border:none;cursor:pointer">
          <span class="rotulo">${esc(a.ano)}</span>
          <div class="numero">${numero(a.quantidade)}</div>
          <div class="apoio">${moeda(a.valor)}</div>
        </button>`).join("")}
    </div>`;

  $$("[data-ano]").forEach((b) => b.addEventListener("click", () => {
    implAno = b.dataset.ano;
    redesenhar();
  }));
}

function implantadasMeses(meses) {
  const doAno = meses.filter((m) => m.ano === implAno).sort((a, b) => b.mes - a.mes);
  const total = doAno.reduce((a, b) => a + b.quantidade, 0);

  alvo().innerHTML = `
    ${cabecalhoTela("Implantadas", `${implAno} · ${numero(total)} propostas · escolha o mês`, voltarLink("todos os anos"))}
    <div class="numeros compacta">
      ${doAno.map((m) => `
        <button class="numero-bloco acionavel" data-mes="${m.mes}" style="text-align:left;border:none;cursor:pointer">
          <span class="rotulo">${esc(MESES[Number(m.mes) - 1] || m.mes)}</span>
          <div class="numero">${numero(m.quantidade)}</div>
          <div class="apoio">${moeda(m.valor)}</div>
        </button>`).join("")}
    </div>`;

  $("#impl-voltar").addEventListener("click", () => { implAno = null; redesenhar(); });
  $$("[data-mes]").forEach((b) => b.addEventListener("click", () => {
    implMes = b.dataset.mes;
    redesenhar();
  }));
}

async function implantadasLista(meses) {
  const registro = meses.find((m) => m.ano === implAno && m.mes === implMes);
  const inicio = `${implAno}-${implMes}-01`;
  const fim = `${implAno}-${implMes}-31`;
  const lista = await api.listar(filtrosDaBusca({
    status: "implantada", nivel: "", ordem: "recentes",
    implantada_de: inicio, implantada_ate: fim,
  }));

  alvo().innerHTML = `
    ${cabecalhoTela(
      "Implantadas",
      `${esc(MESES[Number(implMes) - 1] || implMes)} de ${implAno} · ${numero(lista.total)} propostas · ${moeda(registro?.valor ?? 0)}`,
      voltarLink(`meses de ${implAno}`),
    )}
    <div id="lista"></div>`;

  $("#impl-voltar").addEventListener("click", () => { implMes = null; redesenhar(); });
  montarLista($("#lista"), lista, {
    vazio: "Nenhuma proposta implantada neste mês.",
    comVerificar: false,
    aoPaginar: paginar,
  });
}

/** Barra da taxa de acompanhamento. */
function barraTaxa(taxa, base = null) {
  if (base === 0) return '<span class="apagado">—</span>';
  const t = Number(taxa) || 0;
  return `<span class="barra ${t < 90 ? "baixa" : ""}"><i style="width:${Math.min(t, 100)}%"></i></span>
          <span style="margin-left:8px">${t}%</span>`;
}

// ================================================================ 5. MASTER

let masterSecao = "visao";
let periodoRelatorio = "semana";

async function master() {
  if (!estado.masterAberto) return telaTrancada("Área Master");

  const secoes = [
    ["visao", "Visão geral"],
    ["acompanhamento", "Acompanhamento"],
    ["relatorios", "Relatórios"],
    ["usuarios", "Usuários"],
    ["corretores", "Corretores"],
    ["sistema", "Sistema"],
  ];

  alvo().innerHTML = `
    ${cabecalhoTela("Área Master", data(estado.config.hoje), `
      <button class="btn btn-mini" id="sair-master">Sair</button>`)}
    <div class="periodo" id="master-nav" style="margin-bottom:28px">
      ${secoes.map(([c, n]) => `<button data-secao="${c}" class="${masterSecao === c ? "ativo" : ""}">${esc(n)}</button>`).join("")}
    </div>
    <div id="master-corpo"></div>`;

  $("#sair-master").addEventListener("click", async () => {
    await api.master.sair();
    estado.masterAberto = false;
    avisar("Você saiu da Área Master.");
    redesenhar();
  });

  $$("#master-nav [data-secao]").forEach((b) => b.addEventListener("click", () => {
    masterSecao = b.dataset.secao;
    redesenhar();
  }));

  const corpo = { visao: masterVisao, acompanhamento: acompanhamento, relatorios: relatorios, usuarios: usuarios, corretores: corretores, sistema: sistema };
  await (corpo[masterSecao] || masterVisao)();
}

async function masterVisao() {
  const p = await api.master.produtividade();

  $("#master-corpo").innerHTML = `
    ${p.sem_responsavel ? `
      <div class="filtros-barra" style="border-bottom:1px solid rgb(var(--fio))">
        <span style="color:rgb(var(--alerta))">
          ${p.sem_responsavel} proposta${p.sem_responsavel === 1 ? "" : "s"} sem ADM responsável
        </span>
        <button class="btn btn-mini" id="visao-ir-alertas">Distribuir</button>
      </div>` : ""}

    <div style="padding-top:26px">
      <div class="secao">Produtividade de hoje</div>
      <table>
        <thead><tr>
          <th>ADM</th><th class="num">Novas</th><th class="num">Para acompanhar</th>
          <th class="num">Acompanhadas</th><th class="num">Pendentes</th>
          <th class="num">Atrasadas</th><th class="num">Críticas</th><th class="num">Taxa</th>
        </tr></thead>
        <tbody>
          ${p.usuarios.map((u) => `
            <tr data-usuario="${u.usuario_id}" style="cursor:pointer">
              <td>${esc(u.usuario)}</td>
              <td class="num">${numero(u.novas)}</td>
              <td class="num">${numero(u.para_acompanhar)}</td>
              <td class="num">${numero(u.acompanhadas)}</td>
              <td class="num">${numero(u.pendentes)}</td>
              <td class="num" ${u.atrasadas ? 'style="color:rgb(var(--alerta))"' : ""}>${numero(u.atrasadas)}</td>
              <td class="num" ${u.criticas ? 'style="color:rgb(var(--alerta))"' : ""}>${numero(u.criticas)}</td>
              <td class="num">${barraTaxa(u.taxa, u.para_acompanhar)}</td>
            </tr>`).join("")}
        </tbody>
      </table>
      <p class="dica" style="margin-top:14px">Clique numa ADM para ver o histórico diário dela em Acompanhamento.</p>
    </div>`;

  $("#visao-ir-alertas")?.addEventListener("click", () => irPara("alertas"));

  $$("#master-corpo [data-usuario]").forEach((tr) => tr.addEventListener("click", () => {
    estado.usuario = tr.dataset.usuario;
    $("#usuario").value = tr.dataset.usuario;
    masterSecao = "acompanhamento";
    redesenhar();
  }));
}

// ---------------------------------------------------- 5a. Acompanhamento

async function acompanhamento() {
  const r = await api.master.historico({ usuario_id: estado.usuario });

  $("#master-corpo").innerHTML = `
    <div class="secao" style="margin-top:6px">Histórico diário · ${esc(nomeDoUsuario())}</div>
    <table>
      <thead><tr>
        <th>Dia</th><th class="num">Novas</th><th class="num">Para acompanhar</th>
        <th class="num">Acompanhadas</th><th class="num">Não acompanhadas</th>
        <th class="num">Implantadas</th><th class="num">Taxa</th>
      </tr></thead>
      <tbody>
        ${r.dias.map((d) => `
          <tr>
            <td>${esc(diaSemana(d.dia))}${d.hoje ? ' <span class="apagado">· hoje</span>' : ""}</td>
            <td class="num">${numero(d.novas)}</td>
            <td class="num">${numero(d.para_acompanhar)}</td>
            <td class="num">${numero(d.acompanhadas)}</td>
            <td class="num" ${d.nao_acompanhadas ? 'style="color:rgb(var(--alerta))"' : ""}>${numero(d.nao_acompanhadas)}</td>
            <td class="num">${numero(d.implantadas)}</td>
            <td class="num">${barraTaxa(d.taxa, d.para_acompanhar)}</td>
          </tr>`).join("")}
      </tbody>
    </table>
    ${r.dias.length <= 1 ? `<p class="dica" style="margin-top:16px">
      O histórico começa a se acumular a partir de hoje: cada dia é fechado quando vira a meia-noite.
    </p>` : ""}`;
}

// -------------------------------------------------------- 5b. Relatórios

async function relatorios() {
  const r = await api.master.relatorio({ periodo: periodoRelatorio, usuario_id: estado.usuario });

  $("#master-corpo").innerHTML = `
    <div class="tela-topo" style="padding-top:6px">
      <div class="secao" style="border:none;padding:0;margin:0">Relatórios · ${data(r.inicio)} a ${data(r.fim)}</div>
      <div class="direita">
        <div class="periodo" id="periodo">
          ${[["hoje", "Hoje"], ["semana", "Semana"], ["mes", "Mês"]].map(([c, n]) =>
            `<button data-periodo="${c}" class="${periodoRelatorio === c ? "ativo" : ""}">${n}</button>`).join("")}
        </div>
        <button class="btn btn-mini" id="imprimir">Imprimir / PDF</button>
      </div>
    </div>

    <div class="numeros">
      <div class="numero-bloco"><span class="rotulo">Novas</span><div class="numero">${numero(r.total.novas)}</div></div>
      <div class="numero-bloco"><span class="rotulo">Para acompanhar</span><div class="numero">${numero(r.total.para_acompanhar)}</div></div>
      <div class="numero-bloco"><span class="rotulo">Acompanhadas</span><div class="numero">${numero(r.total.acompanhadas)}</div></div>
      <div class="numero-bloco ${r.total.nao_acompanhadas ? "destaque" : ""}"><span class="rotulo">Não acompanhadas</span><div class="numero">${numero(r.total.nao_acompanhadas)}</div></div>
      <div class="numero-bloco"><span class="rotulo">Implantadas</span><div class="numero">${numero(r.total.implantadas)}</div></div>
      <div class="numero-bloco"><span class="rotulo">Taxa</span><div class="numero">${r.total.taxa}%</div></div>
    </div>
    <p class="dica" style="margin-top:10px">
      No período, os números somam os dias: uma proposta que ficou cinco dias na fila
      conta cinco vezes em "para acompanhar". É a carga de trabalho, não a quantidade
      de propostas distintas.
    </p>

    <div style="padding-top:38px">
      <div class="secao">Como o período fechou (quantidade e R$)</div>
      <table>
        <thead><tr>
          <th>Etapa</th><th class="num">Quantidade</th><th class="num">Valor</th>
        </tr></thead>
        <tbody>
          ${r.panorama.por_etapa.map((e) => `
            <tr>
              <td>${esc(e.nome)}</td>
              <td class="num">${numero(e.quantidade)}</td>
              <td class="num">${moeda(e.valor)}</td>
            </tr>`).join("")}
          <tr>
            <td><strong>Total</strong></td>
            <td class="num"><strong>${numero(r.panorama.total.quantidade)}</strong></td>
            <td class="num"><strong>${moeda(r.panorama.total.valor)}</strong></td>
          </tr>
        </tbody>
      </table>
      <p class="dica" style="margin-top:10px">
        Implantada e cancelada usam a data em que a proposta entrou naquela etapa; as demais
        usam a data de emissão — é o desfecho das propostas nascidas neste período.
      </p>
    </div>

    <div style="padding-top:38px">
      <div class="secao">Desempenho por ADM</div>
      <table>
        <thead><tr>
          <th>ADM</th><th class="num">Novas</th><th class="num">Para acompanhar</th>
          <th class="num">Acompanhadas</th><th class="num">Não acompanhadas</th>
          <th class="num">Implantadas</th><th class="num">Taxa</th>
        </tr></thead>
        <tbody>
          ${r.por_adm.map((u) => `
            <tr>
              <td>${esc(u.usuario)}</td>
              <td class="num">${numero(u.novas)}</td>
              <td class="num">${numero(u.para_acompanhar)}</td>
              <td class="num">${numero(u.acompanhadas)}</td>
              <td class="num" ${u.nao_acompanhadas ? 'style="color:rgb(var(--alerta))"' : ""}>${numero(u.nao_acompanhadas)}</td>
              <td class="num">${numero(u.implantadas)}</td>
              <td class="num">${barraTaxa(u.taxa, u.para_acompanhar)}</td>
            </tr>`).join("") || '<tr><td colspan="7" class="apagado">Sem movimento no período.</td></tr>'}
        </tbody>
      </table>
    </div>

    <div style="padding-top:38px">
      <div class="secao">Dia a dia</div>
      <table>
        <thead><tr>
          <th>Dia</th><th class="num">Novas</th><th class="num">Para acompanhar</th>
          <th class="num">Acompanhadas</th><th class="num">Não acompanhadas</th><th class="num">Taxa</th>
        </tr></thead>
        <tbody>
          ${r.dia_a_dia.map((d) => `
            <tr>
              <td>${esc(diaSemana(d.dia))}${d.hoje ? ' <span class="apagado">· hoje</span>' : ""}</td>
              <td class="num">${numero(d.novas)}</td>
              <td class="num">${numero(d.para_acompanhar)}</td>
              <td class="num">${numero(d.acompanhadas)}</td>
              <td class="num">${numero(d.nao_acompanhadas)}</td>
              <td class="num">${barraTaxa(d.taxa, d.para_acompanhar)}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>

    <div style="padding-top:38px">
      <div class="secao">Situação de alerta agora</div>
      <div class="numeros">
        <div class="numero-bloco"><span class="rotulo">Pendentes</span><div class="numero">${numero(r.alerta_agora.pendentes)}</div></div>
        <div class="numero-bloco ${r.alerta_agora.atrasadas ? "destaque" : ""}"><span class="rotulo">Atrasadas</span><div class="numero">${numero(r.alerta_agora.atrasadas)}</div></div>
        <div class="numero-bloco ${r.alerta_agora.criticas ? "destaque" : ""}"><span class="rotulo">Críticas</span><div class="numero">${numero(r.alerta_agora.criticas)}</div></div>
      </div>
    </div>`;

  $$("#periodo button").forEach((b) => b.addEventListener("click", () => {
    periodoRelatorio = b.dataset.periodo;
    redesenhar();
  }));
  $("#imprimir").addEventListener("click", () => window.print());
}

// --------------------------------------------------------- 5c. Usuários

async function usuarios() {
  const lista = await api.usuarios();

  $("#master-corpo").innerHTML = `
    <div class="tela-topo" style="padding-top:6px">
      <div class="secao" style="border:none;padding:0;margin:0">Usuários · ${lista.filter((u) => u.ativo).length} ativos</div>
      <div class="direita">
        <input id="novo-usuario" class="campo" placeholder="Nome da ADM" style="width:180px">
        <button class="btn btn-cheio btn-mini" id="add-usuario">Cadastrar</button>
      </div>
    </div>

    <table>
      <thead><tr>
        <th>Nome</th><th class="num">Propostas</th><th class="num">Em aberto</th>
        <th>Situação</th><th></th>
      </tr></thead>
      <tbody>
        ${lista.map((u) => `
          <tr>
            <td>${esc(u.nome)}${u.papel === "master" ? ' <span class="apagado">· master</span>' : ""}</td>
            <td class="num">${numero(u.total)}</td>
            <td class="num">${numero(u.abertas)}</td>
            <td class="${u.ativo ? "" : "apagado"}">${u.ativo ? "ativa" : "desativada"}</td>
            <td class="num" style="white-space:nowrap">
              <button class="btn btn-mini" data-alternar="${u.id}" data-ativo="${u.ativo}">
                ${u.ativo ? "desativar" : "reativar"}
              </button>
              ${u.papel === "master" ? "" : `
                <button class="btn btn-perigo btn-mini" data-excluir-usuario="${u.id}"
                        data-nome="${esc(u.nome)}" style="margin-left:6px">excluir</button>`}
            </td>
          </tr>`).join("")}
      </tbody>
    </table>
    <p class="dica" style="margin-top:16px;max-width:640px">
      Só o Master mexe aqui. <b>Desativar</b> tira a ADM do seletor e mantém tudo no
      histórico. <b>Excluir</b> apaga de vez quem nunca pegou proposta; quem já pegou é
      desativado no lugar, senão o relatório ficaria com proposta sem responsável.
    </p>`;

  $("#add-usuario").addEventListener("click", async () => {
    const nome = $("#novo-usuario").value.trim();
    if (!nome) return;
    try {
      await api.criarUsuario({ nome });
      await recarregarConfig();
      avisar(`${nome.toUpperCase()} cadastrada.`);
      redesenhar();
    } catch (erro) { avisar(erro.message, "erro"); }
  });

  $$("[data-alternar]").forEach((b) => b.addEventListener("click", async () => {
    try {
      await api.alterarUsuario(b.dataset.alternar, { ativo: b.dataset.ativo !== "1" });
      await recarregarConfig();
      redesenhar();
    } catch (erro) { avisar(erro.message, "erro"); }
  }));

  $$("[data-excluir-usuario]").forEach((b) => b.addEventListener("click", async () => {
    if (!confirm(`Excluir a usuária ${b.dataset.nome}?`)) return;
    try {
      const r = await api.master.excluir("usuarios", b.dataset.excluirUsuario);
      await recarregarConfig();
      avisar(r.desativado
        ? `${r.nome} foi desativada: responde por ${numero(r.propostas)} proposta(s), então o histórico fica de pé.`
        : `${r.nome} excluída.`);
      redesenhar();
    } catch (erro) { avisar(erro.message, "erro"); }
  }));
}

// -------------------------------------------------------- 5d. Corretores

/** Quem está sendo editado agora: { tipo: "corretor" | "supervisor", id }. */
let editandoCarteira = null;

async function corretores() {
  const { carteira } = await api.master.carteira();
  const supervisores = (estado.config.supervisores || []);
  const ativos = carteira.reduce((n, s) => n + s.corretores.filter((c) => c.ativo).length, 0);

  const editandoEste = (tipo, id) => editandoCarteira?.tipo === tipo && editandoCarteira?.id === id;

  const linhaCorretor = (c) => editandoEste("corretor", c.id) ? `
    <div class="item-carteira editando">
      <input class="campo" id="edt-nome" value="${esc(c.nome)}" autocomplete="off">
      <select class="campo" id="edt-supervisor">
        ${supervisores.map((s) => `<option value="${s.id}" ${s.id === c.supervisor_id ? "selected" : ""}>${esc(s.nome)}</option>`).join("")}
      </select>
      <button class="btn btn-cheio btn-mini" data-salvar-corretor="${c.id}">salvar</button>
      <button class="btn btn-mini" data-cancelar-edicao="1">cancelar</button>
    </div>` : `
    <div class="item-carteira ${c.ativo ? "" : "desativado"}">
      <span class="item-nome">${esc(c.nome)}</span>
      ${c.propostas ? `<span class="item-meta">${numero(c.propostas)} proposta${c.propostas === 1 ? "" : "s"}</span>` : ""}
      ${c.ativo ? `
        <button class="botao-x" title="Editar corretor" data-editar-corretor="${c.id}">✎</button>
        <button class="botao-x" title="Excluir corretor" data-excluir="corretores" data-id="${c.id}" data-nome="${esc(c.nome)}">×</button>`
        : `<button class="btn btn-mini" data-reativar="corretores" data-id="${c.id}">reativar</button>`}
    </div>`;

  const cartao = (s) => `
    <div class="bloco cartao-carteira ${s.ativo ? "" : "desativado"}">
      <div class="cartao-topo">
        ${editandoEste("supervisor", s.id) ? `
          <input class="campo" id="edt-supervisor-nome" value="${esc(s.nome)}" autocomplete="off">
          <button class="btn btn-cheio btn-mini" data-salvar-supervisor="${s.id}">salvar</button>
          <button class="btn btn-mini" data-cancelar-edicao="1">cancelar</button>` : `
          <div style="min-width:0;flex:1">
            <div class="cartao-nome">${esc(s.nome)}</div>
            <div class="cartao-meta">
              ${numero(s.corretores.filter((c) => c.ativo).length)} corretor(es)${s.propostas ? ` · ${numero(s.propostas)} proposta(s)` : ""}
            </div>
          </div>
          ${s.id === null ? "" : s.ativo
            ? `<button class="botao-x" title="Renomear supervisor" data-editar-supervisor="${s.id}">✎</button>
               <button class="botao-x" title="Excluir supervisor" data-excluir="supervisores" data-id="${s.id}" data-nome="${esc(s.nome)}">×</button>`
            : `<button class="btn btn-mini" data-reativar="supervisores" data-id="${s.id}">reativar</button>`}`}
      </div>
      <div class="cartao-lista">
        ${s.corretores.length
          ? s.corretores.map(linhaCorretor).join("")
          : `<div class="item-carteira vazio">nenhum corretor</div>`}
      </div>
    </div>`;

  $("#master-corpo").innerHTML = `
    <div class="secao" style="margin-top:6px">Cadastrar</div>
    <div class="grade" style="max-width:700px">
      <div>
        <label class="rotulo" for="novo-corretor">Nome do corretor</label>
        <input id="novo-corretor" class="campo" placeholder="nome completo" autocomplete="off">
      </div>
      <div>
        <label class="rotulo" for="novo-supervisor">Supervisor responsável</label>
        <select id="novo-supervisor" class="campo">
          <option value="">— escolha —</option>
          ${supervisores.map((s) => `<option value="${s.id}">${esc(s.nome)}</option>`).join("")}
        </select>
      </div>
    </div>
    <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <button class="btn btn-cheio btn-mini" id="novo-corretor-salvar">Cadastrar corretor</button>
      <span class="apagado" style="font-size:12px">ou</span>
      <input id="nova-supervisao" class="campo" placeholder="novo supervisor" style="width:200px" autocomplete="off">
      <button class="btn btn-mini" id="nova-supervisao-salvar">Cadastrar supervisor</button>
    </div>

    <div class="secao" style="margin-top:34px">Carteiras · ${numero(ativos)} corretores</div>
    <div class="carteiras">${carteira.map(cartao).join("") || listaVazia("Nenhum supervisor cadastrado.")}</div>

    <div class="secao" style="margin-top:34px">Subir carteira (Excel)</div>
    <p class="dica" style="margin:0 0 14px;max-width:640px">
      Duas colunas: <b>Corretor</b> e <b>Supervisor</b>, uma linha por corretor. Baixe o modelo,
      preencha e envie de volta. Supervisor que ainda não existe é criado na hora, e corretor
      que já existe tem o supervisor atualizado — é assim que se corrige um vínculo errado,
      sem apagar nada. O modelo já sai com a carteira atual dentro.
    </p>
    <div style="display:flex;gap:26px;align-items:flex-end;flex-wrap:wrap">
      <div>
        <div class="rotulo">1 · Baixar</div>
        <button class="btn btn-mini" id="modelo-baixar">Baixar modelo (.xlsx)</button>
      </div>
      <div>
        <label class="rotulo" for="carteira-arquivo">2 · Enviar preenchido</label>
        <input type="file" id="carteira-arquivo" accept=".xlsx,.csv,text/csv" class="campo" style="width:auto">
      </div>
    </div>

    <details style="margin-top:16px">
      <summary class="rotulo" style="cursor:pointer;margin:0">Colar em texto, sem planilha</summary>
      <p class="dica" style="margin:10px 0">Uma linha por corretor: <span class="mono">corretor,supervisor</span>.</p>
      <textarea id="csv-corretores" class="campo" style="min-height:96px" placeholder="GUILHERME AUGUSTO,LARISSA&#10;MARISTELA,LUCAS SP"></textarea>
      <div style="margin-top:10px">
        <button class="btn btn-cheio btn-mini" id="csv-enviar">Importar texto</button>
      </div>
    </details>`;

  $("#novo-corretor-salvar").addEventListener("click", async () => {
    const nome = $("#novo-corretor").value.trim();
    const supervisor_id = $("#novo-supervisor").value;
    try {
      const r = await api.master.criarCorretor({ nome, supervisor_id });
      await recarregarConfig();
      avisar(r.atualizado
        ? `${r.nome} passou para a carteira de ${r.supervisor}.`
        : `${r.nome} cadastrado com ${r.supervisor}.`);
      redesenhar();
    } catch (erro) { avisar(erro.message, "erro"); }
  });

  $("#nova-supervisao-salvar").addEventListener("click", async () => {
    const nome = $("#nova-supervisao").value.trim();
    try {
      const r = await api.master.criarSupervisor(nome);
      await recarregarConfig();
      avisar(r.reativado ? `${r.nome} reativado.` : `${r.nome} cadastrado.`);
      redesenhar();
    } catch (erro) { avisar(erro.message, "erro"); }
  });

  const abrirEdicao = (tipo, id) => { editandoCarteira = { tipo, id }; corretores(); };
  const fecharEdicao = () => { editandoCarteira = null; corretores(); };

  $$("[data-editar-corretor]").forEach((b) =>
    b.addEventListener("click", () => abrirEdicao("corretor", Number(b.dataset.editarCorretor))));
  $$("[data-editar-supervisor]").forEach((b) =>
    b.addEventListener("click", () => abrirEdicao("supervisor", Number(b.dataset.editarSupervisor))));
  $$("[data-cancelar-edicao]").forEach((b) => b.addEventListener("click", fecharEdicao));

  $$("[data-salvar-corretor]").forEach((b) => b.addEventListener("click", async () => {
    try {
      const r = await api.master.editarCorretor(b.dataset.salvarCorretor, {
        nome: $("#edt-nome").value,
        supervisor_id: $("#edt-supervisor").value,
      });
      editandoCarteira = null;
      await recarregarConfig();
      avisar(r.resumo);
      redesenhar();
    } catch (erro) { avisar(erro.message, "erro"); }
  }));

  $$("[data-salvar-supervisor]").forEach((b) => b.addEventListener("click", async () => {
    try {
      const r = await api.master.editarSupervisor(b.dataset.salvarSupervisor, $("#edt-supervisor-nome").value);
      editandoCarteira = null;
      await recarregarConfig();
      avisar(r.resumo);
      redesenhar();
    } catch (erro) { avisar(erro.message, "erro"); }
  }));

  $("#edt-nome")?.focus();
  $("#edt-supervisor-nome")?.focus();

  $$("[data-excluir]").forEach((b) => b.addEventListener("click", async () => {
    const oQue = b.dataset.excluir === "supervisores" ? "o supervisor" : "o corretor";
    if (!confirm(`Excluir ${oQue} ${b.dataset.nome}?`)) return;
    try {
      const r = await api.master.excluir(b.dataset.excluir, b.dataset.id);
      await recarregarConfig();
      avisar(r.desativado
        ? `${r.nome} foi desativado: aparece em ${numero(r.propostas)} proposta(s), então o histórico fica de pé.`
        : `${r.nome} excluído.`);
      redesenhar();
    } catch (erro) { avisar(erro.message, "erro"); }
  }));

  $$("[data-reativar]").forEach((b) => b.addEventListener("click", async () => {
    try {
      const r = await api.master.reativar(b.dataset.reativar, b.dataset.id);
      await recarregarConfig();
      avisar(`${r.nome} reativado.`);
      redesenhar();
    } catch (erro) { avisar(erro.message, "erro"); }
  }));

  $("#modelo-baixar").addEventListener("click", async () => {
    // fetch, e não link direto: o download tem que ir com o cookie do Master
    const res = await fetch("/api/master/corretores/modelo.xlsx");
    if (!res.ok) return avisar("Não consegui gerar o modelo.", "erro");
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = "carteira-corretores.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  });

  $("#carteira-arquivo").addEventListener("change", async (e) => {
    const arq = e.target.files?.[0];
    if (!arq) return;
    try {
      const r = arq.name.toLowerCase().endsWith(".xlsx")
        ? await api.master.corretoresXlsx(await comoBase64(arq))
        : await api.master.corretoresCSV(await arq.text());
      await recarregarConfig();
      avisar(resumoDaImportacao(r));
      redesenhar();
    } catch (erro) {
      avisar(erro.message, "erro");
      e.target.value = "";
    }
  });

  $("#csv-enviar").addEventListener("click", async () => {
    const csv = $("#csv-corretores").value.trim();
    if (!csv) return;
    try {
      const r = await api.master.corretoresCSV(csv);
      await recarregarConfig();
      avisar(resumoDaImportacao(r));
      redesenhar();
    } catch (erro) { avisar(erro.message, "erro"); }
  });
}

/** Lê o arquivo como base64 — é assim que a planilha viaja dentro do JSON. */
function comoBase64(arquivo) {
  return new Promise((ok, falhou) => {
    const leitor = new FileReader();
    leitor.onload = () => ok(String(leitor.result).split(",")[1] || "");
    leitor.onerror = () => falhou(new Error("Não consegui ler o arquivo."));
    leitor.readAsDataURL(arquivo);
  });
}

function resumoDaImportacao(r) {
  const partes = [];
  if (r.importados) partes.push(`${numero(r.importados)} corretor(es) novos`);
  if (r.atualizados) partes.push(`${numero(r.atualizados)} com supervisor atualizado`);
  if (r.ignorados) partes.push(`${numero(r.ignorados)} linha(s) incompletas ignoradas`);
  return partes.length ? partes.join(" · ") : "Nada mudou: a carteira já estava assim.";
}

const NOME_TABELA = {
  propostas: "Propostas",
  historico: "Histórico de mudanças",
  verificacoes: "Verificações",
  dia_resumo: "Fechamentos de dia",
  mensagens_uso: "Mensagens já usadas",
  corretores: "Corretores",
  supervisores: "Supervisores",
  usuarios: "Usuários do ADM",
};

/**
 * Sistema · zerar. Existe na tela, e não só no terminal, porque recomeçar o
 * preenchimento é decisão de quem usa o sistema — não de quem sabe rodar npm.
 */
async function sistema() {
  const { tabelas, senha_do_ambiente } = await api.master.conteudo();
  const total = Object.values(tabelas).reduce((a, b) => a + b, 0);

  $("#master-corpo").innerHTML = `
    <div class="secao" style="margin-top:6px">O que existe hoje no sistema</div>
    <table style="max-width:420px">
      <tbody>
        ${Object.entries(NOME_TABELA).map(([t, nome]) => `
          <tr><td>${esc(nome)}</td><td class="num mono">${numero(tabelas[t] || 0)}</td></tr>`).join("")}
        <tr><td><b>Total</b></td><td class="num mono"><b>${numero(total)}</b></td></tr>
      </tbody>
    </table>

    <div class="secao" style="margin-top:34px">Senha da Área Master</div>
    ${senha_do_ambiente ? `
      <p class="dica" style="margin:0;max-width:560px">
        A senha está vindo da variável de ambiente <span class="mono">SENHA_MASTER</span>,
        que tem prioridade sobre o arquivo. Para trocar pela tela, suba o sistema sem ela.
      </p>` : `
      <p class="dica" style="margin:0 0 14px;max-width:560px">
        Fica guardada só nesta máquina, em <span class="mono">dados/senha-master.txt</span>,
        fora do Git. Ao trocar, todas as sessões abertas caem — inclusive esta.
      </p>
      <div style="display:grid;grid-template-columns:repeat(2, minmax(0, 210px));gap:12px">
        <div>
          <label class="rotulo" for="senha-atual">Senha atual</label>
          <input id="senha-atual" class="campo" type="password" autocomplete="current-password">
        </div>
        <div>
          <label class="rotulo" for="senha-nova">Senha nova</label>
          <input id="senha-nova" class="campo" type="password" autocomplete="new-password"
                 placeholder="mínimo 8 caracteres">
        </div>
      </div>
      <div style="margin-top:12px">
        <button class="btn btn-cheio btn-mini" id="senha-trocar">Trocar senha</button>
      </div>`}

    <div class="secao" style="margin-top:34px">Zerar o sistema</div>
    <p class="dica" style="margin:0 0 14px;max-width:560px">
      Apaga todos os registros e deixa o sistema em branco para começar o preenchimento
      do zero. A estrutura continua igual — só o conteúdo sai. As planilhas também
      deixam de ser importadas sozinhas, senão tudo voltaria na próxima subida.
      <b>Não tem como desfazer.</b> Se quiser guardar o que existe, copie o arquivo
      <span class="mono">dados/sistema.db</span> antes.
    </p>
    <label class="rotulo" for="zerar-confirma">Digite ZERAR para confirmar</label>
    <input id="zerar-confirma" class="campo" style="max-width:220px" placeholder="ZERAR" autocomplete="off">
    <div style="margin-top:12px">
      <button class="btn btn-perigo btn-mini" id="zerar-agora" disabled>Apagar tudo e começar do zero</button>
    </div>`;

  $("#senha-trocar")?.addEventListener("click", async () => {
    const atual = $("#senha-atual").value;
    const nova = $("#senha-nova").value;
    try {
      await api.master.trocarSenha(atual, nova);
      avisar("Senha trocada. Entre de novo com a senha nova.");
      estado.masterAberto = false;
      setTimeout(() => location.reload(), 1200);
    } catch (erro) { avisar(erro.message, "erro"); }
  });

  const campo = $("#zerar-confirma");
  const botao = $("#zerar-agora");
  campo.addEventListener("input", () => {
    botao.disabled = campo.value.trim().toUpperCase() !== "ZERAR";
  });

  botao.addEventListener("click", async () => {
    botao.disabled = true;
    try {
      const r = await api.master.zerar(campo.value);
      avisar(`${numero(r.apagados)} registros apagados. O sistema está em branco.`);
      // recarrega a página inteira: filtros, contadores e listas em memória
      // ainda falam de dados que não existem mais.
      setTimeout(() => location.reload(), 900);
    } catch (erro) {
      avisar(erro.message, "erro");
      botao.disabled = false;
    }
  });
}

/** Tela protegida: pede a senha do Master. */
function telaTrancada(titulo) {
  alvo().innerHTML = `
    <div class="tranca">
      <div class="titulo">${esc(titulo)}</div>
      <p>Acesso restrito. Informe a senha da Área Master.</p>
      <input id="senha-master" class="campo" type="password" placeholder="senha" autocomplete="current-password">
      <div id="erro-senha" class="dica ruim" style="min-height:16px"></div>
      <button class="btn btn-cheio" id="entrar-master" style="margin-top:12px;width:100%">Entrar</button>
    </div>`;

  const tentar = async () => {
    const senha = $("#senha-master").value;
    try {
      await api.master.entrar(senha);
      estado.masterAberto = true;
      avisar("Área Master aberta.");
      redesenhar();
    } catch (erro) {
      $("#erro-senha").textContent = erro.message;
    }
  };
  $("#entrar-master").addEventListener("click", tentar);
  $("#senha-master").addEventListener("keydown", (e) => { if (e.key === "Enter") tentar(); });
  $("#senha-master").focus();
}

// ----------------------------------------------------------- navegação

let irPara = () => {};
let redesenhar = () => {};

export function ligarNavegacao(fnIr, fnRedesenhar) {
  irPara = fnIr;
  redesenhar = fnRedesenhar;
}

function paginar(pagina) {
  estado.filtros.pagina = pagina;
  redesenhar();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

export { abrirFicha };
