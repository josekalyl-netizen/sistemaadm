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
      <div class="numero" style="font-size:22px">${moeda(obj?.total ?? 0)}</div>
      <div class="dica" style="margin-top:4px">${numero(obj?.quantidade ?? 0)} proposta${(obj?.quantidade ?? 0) === 1 ? "" : "s"}</div>
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
      <div class="numeros">
        ${blocoValor("Para acompanhar hoje", p.valores?.para_acompanhar, true)}
      </div>
    </div>

    <div style="padding-top:34px">
      <div class="secao">Cenário do mês</div>
      <div class="numeros">
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

function voltarLink(texto, aoClicar) {
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
    <div class="numeros">
      ${anos.map((a) => `
        <button class="numero-bloco acionavel" data-ano="${a.ano}" style="text-align:left;border:none;cursor:pointer">
          <span class="rotulo">${esc(a.ano)}</span>
          <div class="numero">${numero(a.quantidade)}</div>
          <div class="dica" style="margin-top:4px">${moeda(a.valor)}</div>
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
    ${cabecalhoTela("Implantadas", `${implAno} · ${numero(total)} propostas · escolha o mês`, voltarLink())}
    <div class="numeros">
      ${doAno.map((m) => `
        <button class="numero-bloco acionavel" data-mes="${m.mes}" style="text-align:left;border:none;cursor:pointer">
          <span class="rotulo">${esc(MESES[Number(m.mes) - 1] || m.mes)}</span>
          <div class="numero">${numero(m.quantidade)}</div>
          <div class="dica" style="margin-top:4px">${moeda(m.valor)}</div>
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
      voltarLink(),
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

  const corpo = { visao: masterVisao, acompanhamento: acompanhamento, relatorios: relatorios, usuarios: usuarios, corretores: corretores };
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
            <td class="num">
              <button class="btn btn-mini" data-alternar="${u.id}" data-ativo="${u.ativo}">
                ${u.ativo ? "desativar" : "reativar"}
              </button></td>
          </tr>`).join("")}
      </tbody>
    </table>
    <p class="dica" style="margin-top:16px">
      Só o Master cadastra e desativa usuários. Desativar não apaga nada: a ADM sai do
      seletor, mas continua no histórico e nos relatórios.
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
}

// -------------------------------------------------------- 5d. Corretores

async function corretores() {
  const lista = estado.config.corretores_cadastro || [];
  const porSupervisor = new Map();
  for (const c of lista) {
    const chave = c.supervisor_nome || "sem supervisor";
    if (!porSupervisor.has(chave)) porSupervisor.set(chave, []);
    porSupervisor.get(chave).push(c);
  }

  $("#master-corpo").innerHTML = `
    <div class="secao" style="margin-top:6px">Subir carteira (CSV)</div>
    <p class="dica" style="margin:0 0 12px">
      Uma linha por corretor: <span class="mono">corretor,supervisor</span>. Corretor que já existe
      tem o supervisor atualizado — é assim que se corrige um vínculo errado.
    </p>
    <textarea id="csv-corretores" class="campo" style="min-height:110px" placeholder="GUILHERME AUGUSTO,LARISSA&#10;MARISTELA,LUCAS SP"></textarea>
    <div style="display:flex;gap:10px;align-items:center;margin-top:10px">
      <input type="file" id="csv-arquivo" accept=".csv,text/csv" class="campo" style="width:auto">
      <button class="btn btn-cheio btn-mini" id="csv-enviar">Importar</button>
    </div>

    <div style="padding-top:34px">
      <div class="secao">Carteira atual · ${numero(lista.length)} corretores</div>
      ${[...porSupervisor.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([sup, corr]) => `
        <div style="margin-bottom:22px">
          <div class="rotulo">${esc(sup)} · ${corr.length}</div>
          <div class="linha-meta" style="font-size:12.5px">${corr.map((c) => esc(c.nome)).join(" · ")}</div>
        </div>`).join("") || listaVazia("Nenhum corretor cadastrado ainda.")}
    </div>`;

  $("#csv-arquivo").addEventListener("change", async (e) => {
    const arq = e.target.files?.[0];
    if (!arq) return;
    $("#csv-corretores").value = await arq.text();
  });

  $("#csv-enviar").addEventListener("click", async () => {
    const csv = $("#csv-corretores").value.trim();
    if (!csv) return;
    try {
      const r = await api.master.corretoresCSV(csv);
      await recarregarConfig();
      avisar(`${r.importados} corretor(es) novos · ${r.atualizados} atualizado(s).`);
      redesenhar();
    } catch (erro) { avisar(erro.message, "erro"); }
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
