/**
 * Tela principal da operação.
 *
 * Tudo acontece aqui: dashboard, áreas por etapa, busca, filtros e a lista.
 * O estado da tela mora em `filtros`; qualquer mudança recarrega a lista e as
 * contagens. A proposta é sempre a mesma linha do banco — o que muda é o
 * filtro que a interface aplica.
 */

import {
  $, $$, aguardar, api, avisar, corRGB, data, desde, esc, moeda, numero,
} from "./util.js";
import { abrirFicha, fecharFicha, iniciarFicha } from "./ficha.js";
import { abrirCadastro, iniciarCadastro } from "./cadastro.js";

let config = null;

/** Estado da tela. Vira query string na API e no endereço do navegador. */
const filtros = {
  busca: "", status: "", supervisor_id: "", operadora: "", corretor: "",
  responsavel: "", tipo: "", empresa: "", documento: "", titular: "",
  de: "", ate: "", implantada_de: "", implantada_ate: "",
  vidas_min: "", vidas_max: "", ordem: "recentes", pagina: 1,
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
  encher("#f-tipo", config.tipos_proposta, (t) => t.nome, (t) => t.codigo);
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
  $("#f-supervisor").value = filtros.supervisor_id;
  $("#supervisor-visao").value = filtros.supervisor_id;
  $("#f-operadora").value = filtros.operadora;
  $("#f-corretor").value = filtros.corretor;
  $("#f-responsavel").value = filtros.responsavel;
  $("#f-tipo").value = filtros.tipo;
  $("#f-empresa").value = filtros.empresa;
  $("#f-documento").value = filtros.documento;
  $("#f-titular").value = filtros.titular;
  $("#f-de").value = filtros.de;
  $("#f-ate").value = filtros.ate;
  $("#f-impl-de").value = filtros.implantada_de;
  $("#f-impl-ate").value = filtros.implantada_ate;
  $("#f-vidas-min").value = filtros.vidas_min;
  $("#f-vidas-max").value = filtros.vidas_max;
  $("#ordem").value = filtros.ordem;

  if (temFiltroAvancado()) abrirFiltros(true);
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
    filtros.supervisor_id = e.target.value;
    $("#f-supervisor").value = e.target.value;
    filtros.pagina = 1;
    recarregarTudo();
  });

  const ligarFiltro = (sel, chave, imediato = true) => {
    const campo = $(sel);
    const aplicar = () => {
      filtros[chave] = campo.value;
      if (chave === "supervisor_id") $("#supervisor-visao").value = campo.value;
      filtros.pagina = 1;
      recarregarTudo();
    };
    campo.addEventListener(imediato ? "change" : "input", imediato ? aplicar : aguardar(aplicar));
  };

  ligarFiltro("#f-supervisor", "supervisor_id");
  ligarFiltro("#f-operadora", "operadora");
  ligarFiltro("#f-corretor", "corretor");
  ligarFiltro("#f-responsavel", "responsavel");
  ligarFiltro("#f-tipo", "tipo");
  ligarFiltro("#f-empresa", "empresa", false);
  ligarFiltro("#f-documento", "documento", false);
  ligarFiltro("#f-titular", "titular", false);
  ligarFiltro("#f-de", "de");
  ligarFiltro("#f-ate", "ate");
  ligarFiltro("#f-impl-de", "implantada_de");
  ligarFiltro("#f-impl-ate", "implantada_ate");
  ligarFiltro("#f-vidas-min", "vidas_min", false);
  ligarFiltro("#f-vidas-max", "vidas_max", false);
  ligarFiltro("#ordem", "ordem");

  $("#btn-limpar-filtros").addEventListener("click", limparFiltros);

  const cabeca = $("#filtros-cabeca");
  cabeca.addEventListener("click", () => abrirFiltros($("#filtros-painel").classList.contains("oculto")));
  cabeca.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      abrirFiltros($("#filtros-painel").classList.contains("oculto"));
    }
  });

  $("#btn-nova").addEventListener("click", abrirCadastro);
  $("#btn-tema").addEventListener("click", trocarTema);
}

function abrirFiltros(abrir) {
  $("#filtros-painel").classList.toggle("oculto", !abrir);
  $("#filtros-cabeca").setAttribute("aria-expanded", String(abrir));
  $("#filtros-seta").textContent = abrir ? "▴" : "▾";
}

function trocarTema() {
  const claro = document.documentElement.getAttribute("data-tema") === "claro";
  if (claro) document.documentElement.removeAttribute("data-tema");
  else document.documentElement.setAttribute("data-tema", "claro");
  try { localStorage.setItem("atlas_tema", claro ? "escuro" : "claro"); } catch {}
}

function limparFiltros() {
  for (const chave of Object.keys(filtros)) {
    if (!["ordem", "pagina"].includes(chave)) filtros[chave] = "";
  }
  filtros.pagina = 1;
  $$(".filtros-grade .campo").forEach((c) => { c.value = ""; });
  $("#busca").value = "";
  $("#supervisor-visao").value = "";
  $("#busca-limpar").classList.add("oculto");
  recarregarTudo();
}

const CAMPOS_AVANCADOS = [
  "supervisor_id", "operadora", "corretor", "responsavel", "tipo", "empresa",
  "documento", "titular", "de", "ate", "implantada_de", "implantada_ate",
  "vidas_min", "vidas_max",
];
const temFiltroAvancado = () => CAMPOS_AVANCADOS.some((c) => filtros[c]);

// -------------------------------------------------------------- desenhar

async function recarregarTudo() {
  escreverEndereco();
  try {
    const [resumo, lista] = await Promise.all([api.painel(filtros), api.listar(filtros)]);
    desenharPainel(resumo);
    desenharEtapas(lista.contagem_por_etapa, lista.total_no_filtro);
    desenharLista(lista);
    desenharFiltrosAtivos();
  } catch (erro) {
    avisar(erro.message, "erro");
  }
}

/** Dashboard: só os números que ajudam a operação a decidir o que fazer. */
function desenharPainel(r) {
  const tile = (rotulo, valor, nota = "") => `
    <div class="card painel-tile">
      <div class="kpi-value mono">${valor}</div>
      <span class="kpi-label">${esc(rotulo)}</span>
      ${nota ? `<div class="painel-nota">${esc(nota)}</div>` : ""}
    </div>`;

  const pendentes = r.por_etapa.pendente || 0;
  const emImplantacao = r.por_etapa.em_implantacao || 0;
  const implantadas = r.por_etapa.implantada || 0;

  $("#painel").innerHTML = [
    tile("Total de propostas", numero(r.total)),
    tile("Pendentes", numero(pendentes), moeda(r.valor_pendente)),
    tile("Em implantação", numero(emImplantacao), moeda(r.valor_em_implantacao)),
    tile("Implantadas", numero(implantadas), moeda(r.valor_implantado)),
    tile("Total de vidas", numero(r.total_vidas)),
  ].join("");
}

/**
 * As áreas por etapa. Cada uma mostra a contagem — que acompanha a busca e os
 * filtros ativos. Clicar entra na área; clicar de novo sai.
 */
function desenharEtapas(contagem, total) {
  const aba = (codigo, nome, quantidade, cor, ativa) => `
    <button class="etapa-aba ${ativa ? "ativa" : ""}" data-etapa="${codigo}"
            style="--etapa-cor:${cor}" aria-pressed="${ativa}">
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
      filtros.status = filtros.status === codigo ? "" : codigo;
      filtros.pagina = 1;
      recarregarTudo();
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
        <div class="section-title" style="font-size:1.2rem">Nada por aqui</div>
        <p style="margin:8px 0 0">Nenhuma proposta atende à busca e aos filtros atuais.</p>
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
  const vidas = Number(p.total_vidas || 0);

  return `
  <button class="proposta" data-id="${p.id}" style="--etapa-cor:${corRGB(et.cor)}">
    <div class="proposta-topo">
      <div class="proposta-nome">${esc(p.razao_social)}</div>
      <span class="pill proposta-etapa">${esc(et.nome)}</span>
    </div>

    <div class="proposta-linha">
      <span class="mono">${esc(p.documento_exibido || "—")}</span>
    </div>
    <div class="proposta-linha">
      <b>${esc(p.operadora || "—")}</b>
      <span>·</span>
      <span>proposta ${esc(p.numero_proposta || "—")}</span>
    </div>
    <div class="proposta-linha">
      <span>Corretor ${esc(p.corretor || "—")}</span>
    </div>

    ${p.status_atual === "pendente" && (p.pendencia_tipo || p.pendencia_detalhe) ? `
      <div class="proposta-pendencia">
        <b>${esc(p.pendencia_tipo || "Pendência")}</b>
        ${p.pendencia_detalhe ? ` — ${esc(p.pendencia_detalhe)}` : ""}
      </div>` : ""}

    <div class="proposta-rodape">
      <span title="Supervisor">${esc(p.nome_supervisor || "sem supervisor")}</span>
      ${p.responsavel ? `<span>· ${esc(p.responsavel)}</span>` : ""}
      ${vidas ? `<span>· ${vidas} vida${vidas === 1 ? "" : "s"}</span>` : ""}
      <span class="proposta-valor">${moeda(p.valor)}</span>
    </div>
    <div class="proposta-linha" style="margin-top:6px;font-size:10.5px">
      <span>${esc(data(p.data_proposta))}</span>
      <span>· atualizada ${esc(desde(p.atualizado_em))}</span>
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

/** Mostra em fichas o que está filtrando agora — e deixa remover uma a uma. */
function desenharFiltrosAtivos() {
  const rotulos = {
    supervisor_id: "Supervisor", operadora: "Operadora", corretor: "Corretor",
    responsavel: "Responsável", tipo: "Tipo", empresa: "Empresa",
    documento: "Documento", titular: "Titular", de: "De", ate: "Até",
    implantada_de: "Implantada de", implantada_ate: "Implantada até",
    vidas_min: "Vidas ≥", vidas_max: "Vidas ≤",
  };

  const ativos = CAMPOS_AVANCADOS.filter((c) => filtros[c]).map((campo) => {
    let valor = filtros[campo];
    if (campo === "supervisor_id") {
      valor = config.supervisores.find((s) => String(s.id) === String(valor))?.nome || valor;
    } else if (campo === "tipo") {
      valor = config.tipos_proposta.find((t) => t.codigo === valor)?.nome || valor;
    } else if (["de", "ate", "implantada_de", "implantada_ate"].includes(campo)) {
      valor = data(valor);
    }
    return `<span class="filtro-ativo">${esc(rotulos[campo])}: ${esc(valor)}
              <button data-limpar="${campo}" title="Remover filtro">✕</button></span>`;
  });

  $("#filtros-ativos").innerHTML = ativos.join("");
  $("#filtros-resumo").textContent = ativos.length
    ? `${ativos.length} filtro${ativos.length === 1 ? "" : "s"} ativo${ativos.length === 1 ? "" : "s"}`
    : "nenhum filtro ativo";

  $$("#filtros-ativos [data-limpar]").forEach((botao) => {
    botao.addEventListener("click", (e) => {
      e.stopPropagation();
      const campo = botao.dataset.limpar;
      filtros[campo] = "";
      const mapa = {
        supervisor_id: "#f-supervisor", operadora: "#f-operadora", corretor: "#f-corretor",
        responsavel: "#f-responsavel", tipo: "#f-tipo", empresa: "#f-empresa",
        documento: "#f-documento", titular: "#f-titular", de: "#f-de", ate: "#f-ate",
        implantada_de: "#f-impl-de", implantada_ate: "#f-impl-ate",
        vidas_min: "#f-vidas-min", vidas_max: "#f-vidas-max",
      };
      if (mapa[campo]) $(mapa[campo]).value = "";
      if (campo === "supervisor_id") $("#supervisor-visao").value = "";
      filtros.pagina = 1;
      recarregarTudo();
    });
  });
}

iniciar();
