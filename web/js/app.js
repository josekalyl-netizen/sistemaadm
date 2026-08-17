/**
 * Tela principal.
 *
 * Tudo acontece aqui: resumo, áreas por etapa, busca, filtros e a lista.
 * O estado da tela mora em `filtros`; qualquer mudança recarrega a lista e as
 * contagens. A proposta é sempre a mesma linha do banco — o que muda é o
 * filtro que a interface aplica.
 */

import { $, $$, aguardar, api, avisar, corRGB, data, desde, esc, moeda, numero } from "./util.js";
import { abrirFicha, iniciarFicha } from "./ficha.js";
import { abrirCadastro, iniciarCadastro } from "./cadastro.js";

let config = null;

/** Estado da tela. Vira query string na API e no endereço do navegador. */
const filtros = {
  busca: "", status: "", supervisor_id: "", operadora: "", corretor: "",
  responsavel: "", cadastrado: "", de: "", ate: "", ordem: "recentes", pagina: 1,
};

/** Filtros que aparecem no painel (o status tem as abas; a busca tem o campo). */
const CAMPOS_FILTRO = {
  supervisor_id: { sel: "#f-supervisor", rotulo: "Supervisor" },
  operadora:     { sel: "#f-operadora", rotulo: "Operadora" },
  corretor:      { sel: "#f-corretor", rotulo: "Corretor" },
  responsavel:   { sel: "#f-responsavel", rotulo: "Responsável" },
  cadastrado:    { sel: "#f-cadastrado", rotulo: "Cadastrado" },
  de:            { sel: "#f-de", rotulo: "De" },
  ate:           { sel: "#f-ate", rotulo: "Até" },
};

const etapaDe = (codigo) => config.etapas.find((e) => e.codigo === codigo) || config.etapas[0];

// --------------------------------------------------------------- arranque

async function iniciar() {
  try {
    config = await api.config();
  } catch {
    document.body.innerHTML = '<p style="padding:40px">Não consegui falar com o servidor. '
      + 'Rode <code>npm start</code> e recarregue a página.</p>';
    return;
  }

  preencherListas();
  lerEndereco();
  ligarEventos();
  iniciarFicha(config, recarregarTudo);
  iniciarCadastro(config, async (id) => { await recarregarTudo(); abrirFicha(id); });

  await recarregarTudo();
}

/** Preenche os selects de filtro com o que existe no banco. */
function preencherListas() {
  const encher = (sel, valores, rotulo = (v) => v, valor = (v) => v) => {
    const campo = $(sel);
    for (const v of valores) campo.add(new Option(rotulo(v), valor(v)));
  };

  encher("#f-supervisor", config.supervisores, (s) => `${s.nome} (${s.total})`, (s) => s.id);
  encher("#supervisor-visao", config.supervisores, (s) => `${s.nome} (${s.total})`, (s) => s.id);
  encher("#f-operadora", config.operadoras);
  encher("#f-corretor", config.corretores);
  encher("#f-responsavel", config.responsaveis);
}

// -------------------------------------------------------- endereço (URL)

/** Deixa a tela compartilhável: os filtros vivem também na barra de endereço. */
function lerEndereco() {
  const params = new URLSearchParams(location.search);
  for (const chave of Object.keys(filtros)) {
    if (params.has(chave)) filtros[chave] = params.get(chave);
  }
  filtros.pagina = Number(filtros.pagina) || 1;

  $("#busca").value = filtros.busca;
  $("#busca-limpar").classList.toggle("oculto", !filtros.busca);
  $("#supervisor-visao").value = filtros.supervisor_id;
  $("#ordem").value = filtros.ordem;
  for (const [chave, { sel }] of Object.entries(CAMPOS_FILTRO)) $(sel).value = filtros[chave];

  if (temFiltro()) abrirFiltros(true);
}

function escreverEndereco() {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filtros)) {
    if (v && !(k === "pagina" && v === 1) && !(k === "ordem" && v === "recentes")) {
      params.set(k, v);
    }
  }
  const busca = params.toString();
  history.replaceState(null, "", busca ? `?${busca}` : location.pathname);
}

const temFiltro = () => Object.keys(CAMPOS_FILTRO).some((c) => filtros[c]);

// ---------------------------------------------------------------- eventos

function ligarEventos() {
  const buscar = aguardar(() => {
    filtros.busca = $("#busca").value.trim();
    filtros.pagina = 1;
    $("#busca-limpar").classList.toggle("oculto", !filtros.busca);
    recarregarTudo();
  });
  $("#busca").addEventListener("input", buscar);
  $("#busca-limpar").addEventListener("click", () => {
    $("#busca").value = "";
    filtros.busca = "";
    filtros.pagina = 1;
    $("#busca-limpar").classList.add("oculto");
    recarregarTudo();
  });

  // "/" foca a busca de qualquer lugar da tela
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
      e.preventDefault();
      $("#busca").focus();
    }
  });

  // visão por supervisor (cabeçalho) e filtro de supervisor andam juntos
  $("#supervisor-visao").addEventListener("change", (e) => {
    aplicar("supervisor_id", e.target.value);
  });

  for (const [chave, { sel }] of Object.entries(CAMPOS_FILTRO)) {
    const campo = $(sel);
    const evento = campo.tagName === "SELECT" || campo.type === "date" ? "change" : "input";
    const acao = () => aplicar(chave, campo.value);
    campo.addEventListener(evento, evento === "input" ? aguardar(acao) : acao);
  }

  $("#ordem").addEventListener("change", (e) => aplicar("ordem", e.target.value));
  $("#btn-limpar-filtros").addEventListener("click", limparFiltros);

  const cabeca = $("#filtros-cabeca");
  const alternar = () => abrirFiltros($("#filtros-painel").classList.contains("oculto"));
  cabeca.addEventListener("click", alternar);
  cabeca.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); alternar(); }
  });

  $("#btn-nova").addEventListener("click", abrirCadastro);
  $("#btn-tema").addEventListener("click", trocarTema);
}

function aplicar(chave, valor) {
  filtros[chave] = valor;
  filtros.pagina = 1;
  if (chave === "supervisor_id") {
    $("#f-supervisor").value = valor;
    $("#supervisor-visao").value = valor;
  }
  recarregarTudo();
}

function abrirFiltros(abrir) {
  $("#filtros-painel").classList.toggle("oculto", !abrir);
  $("#filtros-cabeca").setAttribute("aria-expanded", String(abrir));
  $("#filtros-seta").textContent = abrir ? "▴" : "▾";
}

function trocarTema() {
  const escuro = document.documentElement.getAttribute("data-tema") === "escuro";
  if (escuro) document.documentElement.removeAttribute("data-tema");
  else document.documentElement.setAttribute("data-tema", "escuro");
  try { localStorage.setItem("w3g_tema", escuro ? "claro" : "escuro"); } catch {}
}

function limparFiltros() {
  for (const chave of Object.keys(filtros)) {
    if (!["ordem", "pagina"].includes(chave)) filtros[chave] = "";
  }
  filtros.pagina = 1;
  for (const { sel } of Object.values(CAMPOS_FILTRO)) $(sel).value = "";
  $("#busca").value = "";
  $("#supervisor-visao").value = "";
  $("#busca-limpar").classList.add("oculto");
  recarregarTudo();
}

// -------------------------------------------------------------- desenhar

async function recarregarTudo() {
  escreverEndereco();
  try {
    const [resumo, lista] = await Promise.all([api.painel(filtros), api.listar(filtros)]);
    desenharResumo(resumo);
    desenharEtapas(lista.contagem_por_etapa, lista.total_no_filtro);
    desenharLista(lista);
    desenharFiltrosAtivos();
  } catch (erro) {
    avisar(erro.message, "erro");
  }
}

/** Uma linha só: o que as abas de etapa não mostram. */
function desenharResumo(r) {
  const item = (valor, rotulo) =>
    `<div class="resumo-item"><span class="resumo-num">${valor}</span><span class="resumo-rot">${esc(rotulo)}</span></div>`;

  $("#resumo").innerHTML = [
    item(numero(r.total), "propostas"),
    item(moeda(r.valor_implantado), "implantado"),
    item(moeda(r.valor_pendente), "parado em pendência"),
  ].join("");
}

/**
 * As áreas por etapa. Cada uma mostra a contagem — que acompanha a busca e os
 * filtros ativos. Clicar entra na área; clicar de novo sai.
 */
function desenharEtapas(contagem, total) {
  const aba = (codigo, nome, quantidade, cor, ativa) => `
    <button class="etapa-aba ${ativa ? "ativa" : ""}" data-etapa="${codigo}"
            style="--cor:${cor}" aria-pressed="${ativa}">
      <span class="etapa-aba-nome">${esc(nome)}</span>
      <span class="etapa-aba-num">${numero(quantidade)}</span>
    </button>`;

  const abas = [aba("", "Todas", total, "154 167 188", !filtros.status)];
  for (const e of config.etapas) {
    abas.push(aba(e.codigo, e.nome, contagem[e.codigo] || 0, corRGB(e.cor), filtros.status === e.codigo));
  }
  $("#etapas").innerHTML = abas.join("");

  $$("#etapas .etapa-aba").forEach((botao) => {
    botao.addEventListener("click", () => {
      const codigo = botao.dataset.etapa;
      aplicar("status", filtros.status === codigo ? "" : codigo);
    });
  });
}

function desenharLista(lista) {
  const et = filtros.status ? etapaDe(filtros.status) : null;
  $("#lista-titulo").textContent = et ? et.nome : "Todas as propostas";
  $("#lista-contagem").textContent = lista.total
    ? `${numero(lista.total)} proposta${lista.total === 1 ? "" : "s"}`
      + (lista.paginas > 1 ? ` · página ${lista.pagina} de ${lista.paginas}` : "")
    : "";

  if (!lista.itens.length) {
    $("#cards").innerHTML = `
      <div class="vazio" style="grid-column:1/-1">
        Nenhuma proposta atende à busca e aos filtros atuais.
      </div>`;
    $("#paginacao").innerHTML = "";
    return;
  }

  $("#cards").innerHTML = lista.itens.map(cartao).join("");
  $$("#cards .proposta").forEach((card) => {
    card.addEventListener("click", () => abrirFicha(card.dataset.id));
  });

  desenharPaginacao(lista);
}

function cartao(p) {
  const et = etapaDe(p.status_atual);
  return `
  <button class="proposta" data-id="${p.id}" style="--cor:${corRGB(et.cor)}">
    <div class="proposta-topo">
      <div class="proposta-nome">${esc(p.razao_social)}</div>
      <span class="pill proposta-etapa">${esc(et.nome)}</span>
    </div>

    <div class="proposta-dado mono" title="CNPJ / CPF">${esc(p.documento_exibido || "—")}</div>
    <div class="proposta-dado"><b>${esc(p.operadora || "—")}</b> · proposta ${esc(p.numero_proposta || "—")}</div>
    <div class="proposta-dado" title="Corretor">${esc(p.corretor || "—")}</div>

    ${p.status_atual === "pendente" && (p.pendencia_tipo || p.pendencia_detalhe) ? `
      <div class="proposta-pendencia">
        <b>${esc(p.pendencia_tipo || "Pendência")}</b>${p.pendencia_detalhe ? ` — ${esc(p.pendencia_detalhe)}` : ""}
      </div>` : ""}

    <div class="proposta-rodape">
      <span title="Supervisor">${esc(p.nome_supervisor || "—")}</span>
      ${p.responsavel ? `<span title="Responsável">· ${esc(p.responsavel)}</span>` : ""}
      <span class="proposta-valor">${moeda(p.valor)}</span>
    </div>
  </button>`;
}

function desenharPaginacao(lista) {
  if (lista.paginas <= 1) { $("#paginacao").innerHTML = ""; return; }
  $("#paginacao").innerHTML = `
    <button class="btn btn-mini" id="pag-anterior" ${lista.pagina <= 1 ? "disabled" : ""}>← Anterior</button>
    <span class="muted mono">${lista.pagina} / ${lista.paginas}</span>
    <button class="btn btn-mini" id="pag-proxima" ${lista.pagina >= lista.paginas ? "disabled" : ""}>Próxima →</button>`;

  $("#pag-anterior").addEventListener("click", () => irParaPagina(filtros.pagina - 1));
  $("#pag-proxima").addEventListener("click", () => irParaPagina(filtros.pagina + 1));
}

function irParaPagina(numeroPagina) {
  filtros.pagina = numeroPagina;
  recarregarTudo();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/** Mostra o que está filtrando agora — e deixa remover um a um. */
function desenharFiltrosAtivos() {
  const ativos = Object.entries(CAMPOS_FILTRO)
    .filter(([chave]) => filtros[chave])
    .map(([chave, { rotulo }]) => {
      let valor = filtros[chave];
      if (chave === "supervisor_id") {
        valor = config.supervisores.find((s) => String(s.id) === String(valor))?.nome || valor;
      } else if (["de", "ate"].includes(chave)) {
        valor = data(valor);
      } else if (chave === "cadastrado") {
        valor = valor === "sim" ? "Sim" : "Não";
      }
      return `<span class="filtro-ativo">${esc(rotulo)}: ${esc(valor)}
                <button data-limpar="${chave}" title="Remover filtro">✕</button></span>`;
    });

  $("#filtros-ativos").innerHTML = ativos.join("");
  $("#filtros-resumo").textContent = ativos.length
    ? `${ativos.length} filtro${ativos.length === 1 ? "" : "s"}`
    : "nenhum filtro";

  $$("#filtros-ativos [data-limpar]").forEach((botao) => {
    botao.addEventListener("click", (e) => {
      e.stopPropagation();
      const chave = botao.dataset.limpar;
      $(CAMPOS_FILTRO[chave].sel).value = "";
      if (chave === "supervisor_id") $("#supervisor-visao").value = "";
      aplicar(chave, "");
    });
  });
}

iniciar();
