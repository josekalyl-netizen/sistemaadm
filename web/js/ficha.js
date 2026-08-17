/**
 * Ficha da proposta — a gaveta lateral onde a operação trabalha.
 *
 * Fluxo previsto: encontrar → abrir → conferir → ajustar pendência/observação
 * → alterar status → salvar. Mudar o status aqui é o que reorganiza a proposta
 * em todo o sistema: o card sai de uma área e aparece na outra sozinho.
 */

import { $, api, avisar, corRGB, data, dataHora, desde, esc, moeda } from "./util.js";

let config = null;
let atual = null;        // proposta aberta
let aoMudar = () => {};  // avisa o app para recarregar lista e painel

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
  cabeca.style.setProperty("--etapa-cor", corRGB(et.cor));
  cabeca.innerHTML = `
    <button class="btn btn-fantasma btn-mini ficha-fechar" id="fechar-ficha">✕ Fechar</button>
    <div class="etiqueta-editorial" style="margin-bottom:8px">Proposta #${p.id}</div>
    <h2 class="section-title">${esc(p.razao_social)}</h2>
    <div style="display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin-top:9px">
      <span class="pill proposta-etapa" style="--etapa-cor:${corRGB(et.cor)}">${esc(et.nome)}</span>
      <span class="pill pill-neutral">${esc(p.nome_supervisor || "sem supervisor")}</span>
      <span class="muted" style="font-size:11.5px">
        Atualizada ${desde(p.atualizado_em)} · ${dataHora(p.atualizado_em)}
      </span>
    </div>`;
  $("#fechar-ficha").addEventListener("click", fecharFicha);

  $("#ficha-corpo").innerHTML = [
    blocoStatus(p),
    blocoPendencia(p),
    blocoEmpresa(p),
    blocoProposta(p),
    blocoVidas(p),
    blocoObservacoes(p),
    blocoHistorico(p),
  ].join("");

  ligarEventos();
}

/** As 8 etapas em sequência: clicar troca a etapa da proposta. */
function blocoStatus(p) {
  const botoes = config.etapas.map((e) => `
    <button class="trocador-btn ${e.codigo === p.status_atual ? "atual" : ""}"
            data-etapa="${e.codigo}" style="--etapa-cor:${corRGB(e.cor)}"
            title="${esc(e.descricao)}">
      <span class="ordem">${e.ordem}</span>${esc(e.nome)}
    </button>`).join("");

  return `
    <section class="ficha-secao">
      <div class="etiqueta-editorial">Etapa do processo</div>
      <div class="trocador" id="trocador">${botoes}</div>
      <div class="dica">Ao trocar a etapa, a proposta muda de área sozinha — nada precisa ser copiado.</div>
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
      <div class="etiqueta-editorial">Pendência</div>
      <div class="grade-campos">
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
      <button class="btn btn-mini" id="salvar-pendencia" style="margin-top:10px">Salvar pendência</button>
    </section>`;
}

function campoEditavel(rotulo, campo, valor, tipo = "text", extra = "") {
  return `
    <div class="dado">
      <label class="dado-rotulo" for="ed-${campo}">${esc(rotulo)}</label>
      <input id="ed-${campo}" class="campo editavel" data-campo="${campo}" type="${tipo}"
             value="${esc(valor ?? "")}" ${extra} style="margin-top:4px">
    </div>`;
}

function blocoEmpresa(p) {
  return `
    <section class="ficha-secao">
      <div class="etiqueta-editorial">Empresa</div>
      <div class="grade-campos">
        ${campoEditavel("Razão social", "razao_social", p.razao_social)}
        ${campoEditavel("Nome fantasia", "nome_fantasia", p.nome_fantasia)}
        ${campoEditavel("CNPJ / CPF", "documento", p.documento_exibido)}
        ${campoEditavel("Titular", "titular", p.titular)}
      </div>
    </section>`;
}

function blocoProposta(p) {
  const tipos = config.tipos_proposta
    .map((t) => `<option value="${t.codigo}" ${t.codigo === p.tipo ? "selected" : ""}>${esc(t.nome)}</option>`)
    .join("");
  const supervisores = config.supervisores
    .map((s) => `<option value="${esc(s.nome)}" ${s.nome === p.nome_supervisor ? "selected" : ""}>${esc(s.nome)}</option>`)
    .join("");

  return `
    <section class="ficha-secao">
      <div class="etiqueta-editorial">Proposta</div>
      <div class="grade-campos">
        ${campoEditavel("Número da proposta", "numero_proposta", p.numero_proposta)}
        ${campoEditavel("Operadora", "operadora", p.operadora)}
        ${campoEditavel("Produto", "produto", p.produto)}
        ${campoEditavel("Corretor", "corretor", p.corretor)}
        <div class="dado">
          <label class="dado-rotulo" for="ed-tipo">Tipo de proposta</label>
          <select id="ed-tipo" class="campo editavel" data-campo="tipo" style="margin-top:4px">${tipos}</select>
        </div>
        ${campoEditavel("Valor (R$)", "valor", p.valor ?? "", "text")}
        ${campoEditavel("Quantidade de vidas", "vidas", p.vidas ?? "", "number", 'min="0"')}
        ${campoEditavel("Data da proposta", "data_proposta", p.data_proposta ?? "", "date")}
        ${campoEditavel("Validade", "data_validade", p.data_validade ?? "", "date")}
        ${campoEditavel("Data de implantação", "data_implantacao", p.data_implantacao ?? "", "date")}
        ${campoEditavel("Responsável operacional", "responsavel", p.responsavel)}
        <div class="dado">
          <label class="dado-rotulo" for="ed-supervisor">Supervisor</label>
          <select id="ed-supervisor" class="campo editavel" data-campo="nome_supervisor" style="margin-top:4px">
            ${supervisores}
          </select>
        </div>
      </div>
      ${p.situacao_origem ? `
        <div class="dica" style="margin-top:10px">
          Situação na planilha de origem: <b>${esc(p.situacao_origem)}</b>
          ${p.origem_arquivo ? `· ${esc(p.origem_arquivo)}${p.origem_aba ? ` · aba ${esc(p.origem_aba)}` : ""}` : ""}
        </div>` : ""}
    </section>`;
}

/** Vidas da proposta + a contagem por faixa etária usada na operação. */
function blocoVidas(p) {
  const faixas = config.faixas_etarias.map((f) => {
    const n = p.vidas_por_faixa[f.codigo] || 0;
    return `
      <div class="faixa ${n ? "tem" : ""}">
        <div class="faixa-rotulo">${esc(f.rotulo)}</div>
        <div class="faixa-num">${n}</div>
      </div>`;
  }).join("");

  const linhas = p.vidas_lista.length
    ? p.vidas_lista.map((v) => `
        <div class="vida-linha">
          <span class="pill ${v.parentesco === "titular" ? "pill-accent" : "pill-neutral"}">
            ${v.parentesco === "titular" ? "Titular" : "Dependente"}
          </span>
          <span class="nome">${esc(v.nome)}</span>
          <span class="muted mono">${v.idade ?? "—"} anos</span>
          <span class="muted mono" style="min-width:56px;text-align:right">${esc(v.faixa || "—")}</span>
          <button class="btn btn-fantasma btn-mini btn-perigo" data-remover-vida="${v.id}" title="Remover">✕</button>
        </div>`).join("")
    : `<div class="dica">Nenhuma vida cadastrada nesta proposta.</div>`;

  return `
    <section class="ficha-secao">
      <div class="etiqueta-editorial">Vidas — ${p.vidas_lista.length} cadastrada(s)</div>
      <div class="faixas" style="margin-bottom:14px">${faixas}</div>
      <div>${linhas}</div>
      <div class="grade-campos tres" style="margin-top:12px;align-items:end">
        <div>
          <label class="rotulo" for="vida-nome">Nome</label>
          <input id="vida-nome" class="campo" type="text" placeholder="Nome da vida">
        </div>
        <div>
          <label class="rotulo" for="vida-parentesco">Vínculo</label>
          <select id="vida-parentesco" class="campo">
            <option value="titular">Titular</option>
            <option value="dependente">Dependente</option>
          </select>
        </div>
        <div>
          <label class="rotulo" for="vida-idade">Idade</label>
          <input id="vida-idade" class="campo" type="number" min="0" max="130" placeholder="—">
        </div>
        <div><button class="btn btn-mini" id="add-vida" style="width:100%">+ Incluir vida</button></div>
      </div>
    </section>`;
}

function blocoObservacoes(p) {
  return `
    <section class="ficha-secao">
      <div class="etiqueta-editorial">Observações</div>
      <textarea id="ed-observacoes" class="campo editavel" data-campo="observacoes"
                placeholder="Anotação livre do operador">${esc(p.observacoes)}</textarea>
      <div style="display:flex;gap:9px;margin-top:11px">
        <button class="btn btn-ouro" id="salvar-ficha">Salvar alterações</button>
        <span class="dica" style="align-self:center">As alterações entram no histórico automaticamente.</span>
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
      <div class="etiqueta-editorial">Histórico</div>
      <div class="historico">${itens || '<div class="dica">Sem movimentações.</div>'}</div>
    </section>`;
}

// --------------------------------------------------------------- eventos

function ligarEventos() {
  const corpo = $("#ficha-corpo");

  // trocar de etapa
  corpo.querySelectorAll("[data-etapa]").forEach((botao) => {
    botao.addEventListener("click", () => trocarEtapa(botao.dataset.etapa));
  });

  const pendencia = $("#salvar-pendencia");
  if (pendencia) pendencia.addEventListener("click", salvarPendencia);

  $("#salvar-ficha").addEventListener("click", salvarCampos);

  $("#add-vida").addEventListener("click", incluirVida);
  corpo.querySelectorAll("[data-remover-vida]").forEach((botao) => {
    botao.addEventListener("click", async () => {
      try {
        await recarregar(await api.delVida(atual.id, botao.dataset.removerVida), "Vida removida.");
      } catch (erro) { avisar(erro.message, "erro"); }
    });
  });

  // Ctrl+Enter salva de qualquer campo
  corpo.querySelectorAll(".editavel").forEach((campo) => {
    campo.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey || campo.tagName !== "TEXTAREA")) {
        e.preventDefault();
        salvarCampos();
      }
    });
  });
}

async function trocarEtapa(codigo) {
  if (codigo === atual.status_atual) return;
  const nova = config.etapas.find((e) => e.codigo === codigo);

  // Etapas que encerram ou travam o processo pedem um motivo — é o que o
  // histórico mostra depois ("Status alterado ... Motivo: ...").
  let motivo = "";
  if (["cancelada", "pendente"].includes(codigo)) {
    motivo = prompt(`Motivo para mover para "${nova.nome}":`, "") ?? "";
  }

  try {
    const corpo = { status: codigo, motivo };
    if (codigo === "pendente") {
      corpo.pendencia_detalhe = motivo;
      corpo.pendencia_tipo = atual.pendencia_tipo;
    }
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
  document.querySelectorAll("#ficha-corpo .editavel").forEach((campo) => {
    mudancas[campo.dataset.campo] = campo.value;
  });
  try {
    await recarregar(await api.editar(atual.id, mudancas), "Alterações salvas.");
  } catch (erro) { avisar(erro.message, "erro"); }
}

async function incluirVida() {
  const nome = $("#vida-nome").value.trim();
  if (!nome) { avisar("Informe o nome da vida.", "erro"); return; }
  try {
    await recarregar(
      await api.addVida(atual.id, {
        nome,
        parentesco: $("#vida-parentesco").value,
        idade: $("#vida-idade").value,
      }),
      "Vida incluída.",
    );
  } catch (erro) { avisar(erro.message, "erro"); }
}
