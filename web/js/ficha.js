/**
 * Ficha da proposta — a gaveta onde a ADM trabalha.
 *
 * Fluxo: encontrar → abrir → conferir → verificar / mudar etapa → copiar a
 * mensagem para o corretor. Tudo o que ela faz aqui vira histórico sozinho.
 */

import { $, $$, api, avisar, corRGB, data, dataHora, esc, ligarMascaraDocumento, ligarMascaraMoeda, moeda, valorParaCampo } from "./util.js";
import { estado, etapaDe, nivelDe } from "./estado.js";

let atual = null;
let aoMudar = () => {};

export function iniciarFicha(callbackMudanca) {
  aoMudar = callbackMudanca;
  $("#veu").addEventListener("click", fecharFicha);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $("#ficha").classList.contains("aberta")) fecharFicha();
  });
}

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
  const niv = nivelDe(p.nivel);
  const precisa = p.nivel !== "encerrada";

  $("#ficha-cabeca").innerHTML = `
    <button class="btn btn-limpo ficha-fechar" id="fechar-ficha">✕</button>
    <div class="rotulo">Proposta ${esc(p.numero_proposta || `#${p.id}`)}</div>
    <h2 class="titulo" style="padding-right:34px">${esc(p.razao_social)}</h2>
    <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-top:12px">
      <span class="etiqueta"><i class="ponto" style="--cor:${corRGB(et.cor)}"></i>${esc(et.nome)}</span>
      <span class="etiqueta">${esc(p.nome_adm || "sem responsável")}</span>
      ${precisa ? `<span class="nivel nivel-${p.nivel}">${niv.sinal} ${esc(niv.nome)}</span>` : ""}
    </div>`;
  $("#fechar-ficha").addEventListener("click", fecharFicha);

  $("#ficha-corpo").innerHTML = [
    blocoVerificacao(p),
    blocoEtapa(p),
    blocoPendencia(p),
    blocoMensagem(p),
    blocoDados(p),
    blocoObservacoes(p),
    blocoHistorico(p),
  ].join("");

  ligarEventos();
}

/** O botão de verificar, com a última verificação registrada logo abaixo. */
function blocoVerificacao(p) {
  if (p.nivel === "encerrada") return "";
  const jaHoje = p.nivel === "acompanhando";
  const ultima = p.verificacoes[0];

  return `
    <section class="ficha-secao">
      <button class="btn ${jaHoje ? "" : "btn-cheio"}" id="verificar"
              style="width:100%;padding:12px" ${jaHoje ? "disabled" : ""}>
        ${jaHoje ? "✓ Já verificada hoje" : "✓ Verificar proposta"}
      </button>
      <div class="dica">
        ${ultima
          ? `Última verificação: ${esc(dataHora(ultima.quando))}${ultima.usuario ? ` · ${esc(ultima.usuario)}` : ""}`
          : "Ainda não foi verificada nenhuma vez."}
      </div>
    </section>`;
}

function blocoEtapa(p) {
  const botoes = estado.config.etapas.map((e) => {
    const atual = e.codigo === p.status_atual;
    return `
    <button data-etapa="${e.codigo}" style="--cor:${corRGB(e.cor)}"
            class="${atual ? "atual" : ""}" title="${esc(e.descricao)}">
      <i class="ponto" style="--cor:${corRGB(e.cor)}"></i>${esc(e.nome)}${atual ? " · atual" : ""}
    </button>`;
  }).join("");

  return `
    <section class="ficha-secao">
      <div class="secao">Atualize a etapa (ou mantenha a atual)</div>
      <div class="trocador">${botoes}</div>
    </section>`;
}

function blocoPendencia(p) {
  if (p.status_atual !== "pendente") return "";

  return `
    <section class="ficha-secao">
      <div class="secao">Pendência</div>
      <label class="rotulo" for="pend-detalhe">O que a operadora retornou</label>
      <input id="pend-detalhe" class="campo" value="${esc(p.pendencia_detalhe)}"
             placeholder="descreva a pendência">
      <button class="btn btn-mini" id="salvar-pendencia" style="margin-top:12px">Salvar pendência</button>
    </section>`;
}

/**
 * Mensagem pronta para o corretor. Na etapa Pendente, a ADM digita a pendência
 * e a mensagem se monta com ela dentro.
 */
function blocoMensagem(p) {
  return `
    <section class="ficha-secao">
      <div class="secao">Mensagem para ${esc(p.corretor || "o corretor")}</div>
      ${p.status_atual === "pendente" ? `
        <label class="rotulo" for="msg-pendencia">Pendência (entra na mensagem)</label>
        <input id="msg-pendencia" class="campo" style="margin-bottom:14px"
               value="${esc(p.pendencia_detalhe || p.pendencia_tipo)}"
               placeholder="ex.: cópia do contrato social assinado">` : ""}
      <div class="mensagem-caixa" id="msg-texto">carregando…</div>
      <div class="mensagem-acoes">
        <button class="btn btn-mini btn-cheio" id="msg-copiar">Copiar</button>
        <button class="btn btn-mini" id="msg-outra">Outra mensagem</button>
        <span class="dica" id="msg-conta" style="margin:0"></span>
      </div>
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

function blocoDados(p) {
  const admOpcoes = [`<option value="">— sem responsável —</option>`]
    .concat(estado.config.usuarios.map((u) =>
      `<option value="${u.id}" ${u.id === p.usuario_id ? "selected" : ""}>${esc(u.nome)}</option>`))
    .join("");

  return `
    <section class="ficha-secao">
      <div class="secao">Dados</div>
      <div class="grade">
        ${campo("Empresa", "razao_social", p.razao_social)}
        ${campo("CNPJ / CPF", "documento", p.documento_exibido)}
        ${campo("Proposta", "numero_proposta", p.numero_proposta)}
        ${campo("Operadora", "operadora", p.operadora)}
        ${campo("Corretor", "corretor", p.corretor)}
        <div>
          <label class="rotulo" for="ed-usuario">Responsável ADM</label>
          <select id="ed-usuario" class="campo editavel" data-campo="usuario_id">${admOpcoes}</select>
        </div>
        ${campo("Valor (R$)", "valor", valorParaCampo(p.valor))}
        ${campo("Emissão", "data_proposta", p.data_proposta ?? "", "date")}
        ${campo("Validade", "data_validade", p.data_validade ?? "", "date")}
        ${campo("Cadastrado", "cadastrado", p.cadastrado)}
      </div>
      ${p.situacao_origem ? `<div class="dica" style="margin-top:12px">
        Situação na planilha: ${esc(p.situacao_origem)}${p.origem_aba ? ` · aba ${esc(p.origem_aba)}` : ""}
      </div>` : ""}
    </section>`;
}

function blocoObservacoes(p) {
  return `
    <section class="ficha-secao">
      <div class="secao">Observações</div>
      <textarea id="ed-observacoes" class="campo editavel" data-campo="observacoes"
                placeholder="anotação livre">${esc(p.observacoes)}</textarea>
      <button class="btn btn-cheio" id="salvar-ficha" style="margin-top:12px">Salvar alterações</button>
    </section>`;
}

function blocoHistorico(p) {
  const itens = p.historico.map((h) => `
    <div class="tempo-item ${["status", "verificacao"].includes(h.tipo) ? "destaque" : ""}">
      <div class="tempo-quando">${esc(dataHora(h.quando))}${h.autor ? ` · ${esc(h.autor)}` : ""}</div>
      <div class="tempo-texto">${esc(h.descricao)}</div>
      ${h.motivo ? `<div class="tempo-motivo">Motivo: ${esc(h.motivo)}</div>` : ""}
    </div>`).join("");

  return `
    <section class="ficha-secao">
      <div class="secao">Histórico</div>
      <div class="tempo">${itens || '<div class="dica">Sem movimentações.</div>'}</div>
    </section>`;
}

// --------------------------------------------------------------- eventos

function ligarEventos() {
  const corpo = $("#ficha-corpo");

  const btnVerificar = $("#verificar");
  if (btnVerificar) btnVerificar.addEventListener("click", verificar);

  corpo.querySelectorAll("[data-etapa]").forEach((b) =>
    b.addEventListener("click", () => trocarEtapa(b.dataset.etapa)));

  const pend = $("#salvar-pendencia");
  if (pend) pend.addEventListener("click", salvarPendencia);

  $("#salvar-ficha").addEventListener("click", salvarCampos);

  ligarMascaraMoeda($("#ed-valor"));
  ligarMascaraDocumento($("#ed-documento"));

  corpo.querySelectorAll(".editavel").forEach((c) => {
    c.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && c.tagName !== "TEXTAREA") { e.preventDefault(); salvarCampos(); }
    });
  });

  carregarMensagem();
  $("#msg-outra").addEventListener("click", () => carregarMensagem(true));
  $("#msg-copiar").addEventListener("click", copiarMensagem);
  const pendMsg = $("#msg-pendencia");
  if (pendMsg) pendMsg.addEventListener("input", () => carregarMensagem(false, true));
}

async function verificar() {
  if (!estado.usuario || estado.usuario === "sem") {
    avisar("Selecione seu nome em Usuário, no topo, para registrar a verificação.", "erro");
    return;
  }
  try {
    const r = await api.verificar(atual.id, { usuario_id: estado.usuario });
    await recarregar(r.proposta, `Verificada às ${r.quando.slice(11, 16)} por ${r.usuario}.`);
  } catch (erro) { avisar(erro.message, "erro"); }
}

async function trocarEtapa(codigo) {
  if (codigo === atual.status_atual) return;
  const nova = estado.config.etapas.find((e) => e.codigo === codigo);

  let motivo = "";
  if (["cancelada", "pendente"].includes(codigo)) {
    motivo = prompt(`Motivo para mover para "${nova.nome}":`, "") ?? "";
  }
  try {
    const corpo = { status: codigo, motivo, autor: nomeDoAutor() };
    if (codigo === "pendente") corpo.pendencia_detalhe = motivo;
    await recarregar(await api.status(atual.id, corpo), `Agora em "${nova.nome}".`);
  } catch (erro) { avisar(erro.message, "erro"); }
}

async function salvarPendencia() {
  try {
    await recarregar(await api.status(atual.id, {
      status: "pendente",
      pendencia_detalhe: $("#pend-detalhe").value,
      autor: nomeDoAutor(),
    }), "Pendência atualizada.");
  } catch (erro) { avisar(erro.message, "erro"); }
}

async function salvarCampos() {
  const mudancas = { autor: nomeDoAutor() };
  document.querySelectorAll("#ficha-corpo .editavel").forEach((c) => {
    mudancas[c.dataset.campo] = c.value;
  });
  try {
    await recarregar(await api.editar(atual.id, mudancas), "Alterações salvas.");
  } catch (erro) { avisar(erro.message, "erro"); }
}

// ---------------------------------------------------------- mensagens

let mensagemAtual = null;

async function carregarMensagem(outra = false, apenasPendencia = false) {
  const caixa = $("#msg-texto");
  if (!caixa) return;
  const pendencia = $("#msg-pendencia")?.value || "";

  try {
    // "Outra mensagem" pede a próxima; digitar a pendência só re-preenche a mesma
    const indice = apenasPendencia && mensagemAtual ? mensagemAtual.indice : undefined;
    const m = await api.mensagem(atual.id, { pendencia, indice });
    mensagemAtual = m;
    caixa.textContent = m.texto;
    $("#msg-conta").textContent = `${m.indice + 1} de ${m.total}`;
  } catch (erro) {
    caixa.textContent = "Não há mensagem pronta para esta etapa.";
    $("#msg-conta").textContent = "";
  }
}

async function copiarMensagem() {
  if (!mensagemAtual) return;
  try {
    await navigator.clipboard.writeText(mensagemAtual.texto);
    avisar("Mensagem copiada.");
  } catch {
    // navegador sem permissão de área de transferência: seleciona o texto
    const faixa = document.createRange();
    faixa.selectNodeContents($("#msg-texto"));
    getSelection().removeAllRanges();
    getSelection().addRange(faixa);
    avisar("Selecionei a mensagem — use Ctrl+C.");
  }
  // registra o uso para não repetir a mesma com esse corretor
  api.usouMensagem(atual.id, mensagemAtual.indice).catch(() => {});
}

function nomeDoAutor() {
  if (!estado.usuario || estado.usuario === "sem") return "operacional";
  return estado.config.usuarios.find((u) => String(u.id) === String(estado.usuario))?.nome || "operacional";
}
