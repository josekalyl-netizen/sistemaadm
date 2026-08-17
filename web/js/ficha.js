/**
 * Ficha da proposta — a gaveta lateral onde o administrativo trabalha.
 *
 * Fluxo: encontrar → abrir → conferir → ajustar pendência/observação →
 * alterar status → salvar. Mudar o status aqui é o que reorganiza a proposta
 * em todo o sistema: o card sai de uma área e aparece na outra sozinho.
 *
 * Os campos são os mesmos da planilha — nada além disso.
 */

import { $, api, avisar, corRGB, dataHora, desde, esc } from "./util.js";

let config = null;
let atual = null;        // proposta aberta
let aoMudar = () => {};  // avisa o app para recarregar a lista

export function iniciarFicha(cfg, callbackMudanca) {
  config = cfg;
  aoMudar = callbackMudanca;

  $("#veu").addEventListener("click", fecharFicha);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $("#ficha").classList.contains("aberta")) fecharFicha();
  });
}

const etapaDe = (codigo) => config.etapas.find((e) => e.codigo === codigo) || config.etapas[0];

export async function abrirFicha(id) {
  try {
    atual = await api.obter(id);
    desenhar();
    $("#veu").classList.add("aberta");
    $("#ficha").classList.add("aberta");
    $("#ficha").setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  } catch (erro) {
    avisar(erro.message, "erro");
  }
}

export function fecharFicha() {
  $("#veu").classList.remove("aberta");
  $("#ficha").classList.remove("aberta");
  $("#ficha").setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  atual = null;
}

/** Recarrega a ficha depois de uma alteração e avisa o resto da tela. */
async function recarregar(proposta, mensagem) {
  atual = proposta;
  desenhar();
  if (mensagem) avisar(mensagem);
  aoMudar();
}

// --------------------------------------------------------------- desenho

function desenhar() {
  const p = atual;
  const et = etapaDe(p.status_atual);

  const cabeca = $("#ficha-cabeca");
  cabeca.style.setProperty("--cor", corRGB(et.cor));
  cabeca.innerHTML = `
    <button class="btn btn-limpo btn-mini ficha-fechar" id="fechar-ficha">✕</button>
    <div class="muted" style="font-size:11px">Proposta #${p.id}</div>
    <h2 class="titulo" style="margin:3px 0 7px;padding-right:30px">${esc(p.razao_social)}</h2>
    <div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap">
      <span class="pill proposta-etapa" style="--cor:${corRGB(et.cor)}">${esc(et.nome)}</span>
      <span class="pill pill-neutro">${esc(p.nome_supervisor || "sem supervisor")}</span>
      <span class="muted" style="font-size:11.5px">atualizada ${desde(p.atualizado_em)}</span>
    </div>`;
  $("#fechar-ficha").addEventListener("click", fecharFicha);

  $("#ficha-corpo").innerHTML = [
    blocoStatus(p),
    blocoPendencia(p),
    blocoDados(p),
    blocoObservacoes(p),
    blocoHistorico(p),
  ].join("");

  ligarEventos();
}

/** As 8 etapas em sequência: clicar troca a etapa da proposta. */
function blocoStatus(p) {
  const botoes = config.etapas.map((e) => `
    <button class="trocador-btn ${e.codigo === p.status_atual ? "atual" : ""}"
            data-etapa="${e.codigo}" style="--cor:${corRGB(e.cor)}" title="${esc(e.descricao)}">
      ${esc(e.nome)}
    </button>`).join("");

  return `
    <section class="ficha-secao">
      <div class="secao-titulo">Etapa</div>
      <div class="trocador" id="trocador">${botoes}</div>
    </section>`;
}

/** Só aparece quando a proposta está pendente: o que está travando. */
function blocoPendencia(p) {
  if (p.status_atual !== "pendente") return "";
  const opcoes = config.tipos_pendencia
    .map((t) => `<option value="${esc(t)}" ${t === p.pendencia_tipo ? "selected" : ""}>${esc(t)}</option>`)
    .join("");

  return `
    <section class="ficha-secao">
      <div class="secao-titulo">Pendência</div>
      <div class="grade">
        <div>
          <label class="rotulo" for="pend-tipo">Qual é a pendência?</label>
          <select id="pend-tipo" class="campo">
            <option value="">— selecione —</option>${opcoes}
          </select>
        </div>
        <div>
          <label class="rotulo" for="pend-detalhe">Detalhe</label>
          <input id="pend-detalhe" class="campo" type="text"
                 value="${esc(p.pendencia_detalhe)}" placeholder="Ex.: falta contrato social assinado">
        </div>
      </div>
      <button class="btn btn-mini" id="salvar-pendencia" style="margin-top:9px">Salvar pendência</button>
    </section>`;
}

function campo(rotulo, nome, valor, tipo = "text") {
  return `
    <div>
      <label class="rotulo" for="ed-${nome}">${esc(rotulo)}</label>
      <input id="ed-${nome}" class="campo editavel" data-campo="${nome}" type="${tipo}"
             value="${esc(valor ?? "")}">
    </div>`;
}

/** Os campos da planilha, todos editáveis. */
function blocoDados(p) {
  const supervisores = config.supervisores
    .map((s) => `<option value="${esc(s.nome)}" ${s.nome === p.nome_supervisor ? "selected" : ""}>${esc(s.nome)}</option>`)
    .join("");

  return `
    <section class="ficha-secao">
      <div class="secao-titulo">Dados da proposta</div>
      <div class="grade">
        ${campo("Estipulante", "razao_social", p.razao_social)}
        ${campo("CNPJ / CPF", "documento", p.documento_exibido)}
        ${campo("Proposta", "numero_proposta", p.numero_proposta)}
        ${campo("Operadora", "operadora", p.operadora)}
        ${campo("Corretor", "corretor", p.corretor)}
        ${campo("Valor (R$)", "valor", p.valor ?? "")}
        ${campo("Emissão", "data_proposta", p.data_proposta ?? "", "date")}
        ${campo("Validade", "data_validade", p.data_validade ?? "", "date")}
        ${campo("Responsável", "responsavel", p.responsavel)}
        ${campo("Cadastrado", "cadastrado", p.cadastrado)}
        <div>
          <label class="rotulo" for="ed-supervisor">Supervisor</label>
          <select id="ed-supervisor" class="campo editavel" data-campo="nome_supervisor">
            ${supervisores}
          </select>
        </div>
      </div>
      ${p.situacao_origem ? `
        <div class="dica" style="margin-top:9px">
          Situação na planilha: <b>${esc(p.situacao_origem)}</b>
          ${p.origem_aba ? ` · aba ${esc(p.origem_aba)}` : ""}
        </div>` : ""}
    </section>`;
}

function blocoObservacoes(p) {
  return `
    <section class="ficha-secao">
      <div class="secao-titulo">Observações</div>
      <textarea id="ed-observacoes" class="campo editavel" data-campo="observacoes"
                placeholder="Anotação livre">${esc(p.observacoes)}</textarea>
      <div style="display:flex;gap:9px;align-items:center;margin-top:10px">
        <button class="btn btn-principal" id="salvar-ficha">Salvar</button>
        <span class="dica" style="margin:0">Toda alteração entra no histórico sozinha.</span>
      </div>
    </section>`;
}

function blocoHistorico(p) {
  const itens = p.historico.map((h) => `
    <div class="historico-item ${h.tipo === "status" ? "status" : ""}">
      <div class="historico-quando">${dataHora(h.quando)}${h.autor ? ` · ${esc(h.autor)}` : ""}</div>
      <div class="historico-texto">${esc(h.descricao)}</div>
      ${h.motivo ? `<div class="historico-motivo">Motivo: ${esc(h.motivo)}</div>` : ""}
    </div>`).join("");

  return `
    <section class="ficha-secao">
      <div class="secao-titulo">Histórico</div>
      <div class="historico">${itens || '<div class="dica">Sem movimentações.</div>'}</div>
    </section>`;
}

// --------------------------------------------------------------- eventos

function ligarEventos() {
  const corpo = $("#ficha-corpo");

  corpo.querySelectorAll("[data-etapa]").forEach((botao) => {
    botao.addEventListener("click", () => trocarEtapa(botao.dataset.etapa));
  });

  const pendencia = $("#salvar-pendencia");
  if (pendencia) pendencia.addEventListener("click", salvarPendencia);

  $("#salvar-ficha").addEventListener("click", salvarCampos);

  // Enter salva de qualquer campo (menos na observação, onde quebra linha)
  corpo.querySelectorAll(".editavel").forEach((c) => {
    c.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && c.tagName !== "TEXTAREA") {
        e.preventDefault();
        salvarCampos();
      }
    });
  });
}

async function trocarEtapa(codigo) {
  if (codigo === atual.status_atual) return;
  const nova = config.etapas.find((e) => e.codigo === codigo);

  // Cancelar e travar pedem um motivo — é o que o histórico mostra depois.
  let motivo = "";
  if (["cancelada", "pendente"].includes(codigo)) {
    motivo = prompt(`Motivo para mover para "${nova.nome}":`, "") ?? "";
  }

  try {
    const corpo = { status: codigo, motivo };
    if (codigo === "pendente") corpo.pendencia_detalhe = motivo;
    await recarregar(await api.status(atual.id, corpo), `Agora em "${nova.nome}".`);
  } catch (erro) {
    avisar(erro.message, "erro");
  }
}

async function salvarPendencia() {
  try {
    await recarregar(
      await api.status(atual.id, {
        status: "pendente",
        pendencia_tipo: $("#pend-tipo").value,
        pendencia_detalhe: $("#pend-detalhe").value,
      }),
      "Pendência atualizada.",
    );
  } catch (erro) { avisar(erro.message, "erro"); }
}

async function salvarCampos() {
  const mudancas = {};
  document.querySelectorAll("#ficha-corpo .editavel").forEach((c) => {
    mudancas[c.dataset.campo] = c.value;
  });
  try {
    await recarregar(await api.editar(atual.id, mudancas), "Alterações salvas.");
  } catch (erro) { avisar(erro.message, "erro"); }
}
