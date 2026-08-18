/**
 * A listagem de propostas — usada por quase todas as telas.
 *
 * Cada linha traz o que a ADM precisa para decidir sem abrir nada: empresa,
 * CNPJ, operadora, corretor, quem é a responsável, há quantos dias está sem
 * verificação e o botão de verificar. Clicar na linha abre a ficha.
 */

import { $, $$, api, avisar, corRGB, dataCurta, esc, moeda, numero } from "./util.js";
import { estado, etapaDe, nivelDe } from "./estado.js";
import { abrirFicha } from "./ficha.js";

/** Texto curto do nível: "há 3 dias", "hoje". */
export function textoNivel(p) {
  if (p.nivel === "encerrada") return "";
  const d = Number(p.dias_sem_verificar);
  if (d <= 0) return "verificada hoje";
  if (d === 1) return "ontem";
  return `há ${d} dias`;
}

export function linhaProposta(p, { comVerificar = true } = {}) {
  const et = etapaDe(p.status_atual);
  const niv = nivelDe(p.nivel);
  const precisa = p.nivel !== "encerrada";
  const jaHoje = p.nivel === "acompanhando";

  return `
  <div class="linha" data-id="${p.id}" style="--cor:${corRGB(et.cor)}">
    <div class="linha-cor"></div>
    <div class="linha-corpo">
      <div class="linha-nome">${esc(p.razao_social)}</div>
      <div class="linha-meta">
        <span class="etiqueta"><i class="ponto" style="--cor:${corRGB(et.cor)}"></i>${esc(et.nome)}</span>
        <span class="mono">${esc(p.documento_exibido || "—")}</span>
        <span>${esc(p.operadora || "—")}</span>
        <span>${esc(p.corretor || "sem corretor")}</span>
        <span>${esc(p.nome_adm || "sem responsável")}</span>
        ${p.pendencia_tipo ? `<span>· ${esc(p.pendencia_tipo)}</span>` : ""}
      </div>
    </div>
    <div class="linha-fim">
      ${precisa ? `<span class="nivel nivel-${p.nivel}">${niv.sinal} ${esc(textoNivel(p))}</span>` : ""}
      <span class="linha-valor">${moeda(p.valor)}</span>
      ${comVerificar && precisa ? `
        <button class="btn-verificar ${jaHoje ? "feito" : ""}" data-verificar="${p.id}"
                ${jaHoje ? "disabled" : ""}>${jaHoje ? "✓ verificada" : "Verificar"}</button>` : ""}
    </div>
  </div>`;
}

export function listaVazia(mensagem) {
  return `<div class="vazio">${esc(mensagem)}</div>`;
}

/** Desenha a lista dentro de um elemento e liga os cliques. */
export function montarLista(alvo, resultado, opcoes = {}) {
  const { vazio = "Nenhuma proposta encontrada.", comVerificar = true } = opcoes;

  alvo.innerHTML = resultado.itens.length
    ? `<div class="linhas">${resultado.itens.map((p) => linhaProposta(p, { comVerificar })).join("")}</div>`
      + paginacao(resultado)
    : listaVazia(vazio);

  $$(".linha", alvo).forEach((linha) => {
    linha.addEventListener("click", (e) => {
      if (e.target.closest("[data-verificar]")) return;   // o botão tem ação própria
      abrirFicha(linha.dataset.id);
    });
  });

  $$("[data-verificar]", alvo).forEach((botao) => {
    botao.addEventListener("click", async (e) => {
      e.stopPropagation();
      await verificarProposta(botao.dataset.verificar, botao);
    });
  });

  const anterior = $("#pag-anterior", alvo);
  const proxima = $("#pag-proxima", alvo);
  if (anterior) anterior.addEventListener("click", () => opcoes.aoPaginar?.(resultado.pagina - 1));
  if (proxima) proxima.addEventListener("click", () => opcoes.aoPaginar?.(resultado.pagina + 1));
}

/**
 * O botão "Verificar". Só funciona com um usuário selecionado no topo: é
 * preciso saber QUEM verificou, senão o acompanhamento não serve de auditoria.
 */
export async function verificarProposta(id, botao) {
  if (!estado.usuario || estado.usuario === "sem") {
    avisar("Selecione seu nome em Usuário, no topo, para registrar a verificação.", "erro");
    return null;
  }
  try {
    const r = await api.verificar(id, { usuario_id: estado.usuario });
    if (botao) {
      botao.textContent = "✓ verificada";
      botao.classList.add("feito");
      botao.disabled = true;
      const nivel = botao.closest(".linha")?.querySelector(".nivel");
      if (nivel) {
        nivel.className = "nivel nivel-acompanhando";
        nivel.textContent = "🟢 verificada hoje";
      }
    }
    avisar(`Verificada às ${r.quando.slice(11, 16)} por ${r.usuario}.`);
    return r;
  } catch (erro) {
    avisar(erro.message, "erro");
    return null;
  }
}

function paginacao(r) {
  if (r.paginas <= 1) return "";
  return `
    <div class="paginacao">
      <button class="btn btn-mini" id="pag-anterior" ${r.pagina <= 1 ? "disabled" : ""}>anterior</button>
      <span class="mono">${numero(r.total)} propostas · página ${r.pagina} de ${r.paginas}</span>
      <button class="btn btn-mini" id="pag-proxima" ${r.pagina >= r.paginas ? "disabled" : ""}>próxima</button>
    </div>`;
}

/** Cabeçalho padrão de tela. */
export function cabecalhoTela(titulo, apoio = "", direita = "") {
  return `
    <div class="tela-topo">
      <h1 class="titulo">${esc(titulo)}</h1>
      ${apoio ? `<span class="apoio">${esc(apoio)}</span>` : ""}
      ${direita ? `<div class="direita">${direita}</div>` : ""}
    </div>`;
}

export { dataCurta };
