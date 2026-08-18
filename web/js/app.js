/**
 * Ponto de entrada: monta o topo, as abas e desenha a tela atual.
 *
 * O sistema inteiro obedece a duas coisas do topo — o USUÁRIO selecionado e a
 * BUSCA. Trocar o usuário refaz todas as telas para a carteira dela.
 */

import { $, $$, aguardar, api, avisar, esc, numero } from "./util.js";
import {
  escreverEndereco, estado, lerEndereco, recarregarConfig,
} from "./estado.js";
import { TELAS, ligarNavegacao } from "./telas.js";
import { abrirFicha, iniciarFicha } from "./ficha.js";
import { abrirCadastro, iniciarCadastro } from "./cadastro.js";

/** Contagens mostradas ao lado do nome das abas. */
let contagens = { pendentes: 0, alertas: 0 };

async function iniciar() {
  try {
    await recarregarConfig();
  } catch {
    document.body.innerHTML = '<p style="padding:48px;font-family:system-ui">'
      + "Não consegui falar com o servidor. Rode <code>npm start</code> e recarregue a página.</p>";
    return;
  }

  estado.masterAberto = await api.master.sessao().then((r) => r.entrou).catch(() => false);

  lerEndereco();
  montarTopo();
  iniciarFicha(redesenhar);
  iniciarCadastro(async (id) => { await redesenhar(); abrirFicha(id); });
  ligarNavegacao(irPara, redesenhar);

  await redesenhar();
}

function montarTopo() {
  const seletor = $("#usuario");
  for (const u of estado.config.usuarios) {
    seletor.add(new Option(u.nome, u.id));
  }
  seletor.add(new Option("Sem responsável", "sem"));
  seletor.value = estado.usuario;

  seletor.addEventListener("change", (e) => {
    estado.usuario = e.target.value;
    estado.filtros.pagina = 1;
    redesenhar();
  });

  $("#busca").value = estado.filtros.busca;
  $("#busca").addEventListener("input", aguardar(() => {
    estado.filtros.busca = $("#busca").value.trim();
    estado.filtros.pagina = 1;
    // buscar leva para a lista completa: é onde a busca faz sentido
    if (estado.filtros.busca && estado.tela === "dashboard") estado.tela = "propostas";
    redesenhar();
  }));

  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
      e.preventDefault();
      $("#busca").focus();
    }
  });

  $("#btn-nova").addEventListener("click", abrirCadastro);
  $("#btn-tema").addEventListener("click", () => {
    const escuro = document.documentElement.getAttribute("data-tema") === "escuro";
    if (escuro) document.documentElement.removeAttribute("data-tema");
    else document.documentElement.setAttribute("data-tema", "escuro");
    try { localStorage.setItem("w3g_tema", escuro ? "claro" : "escuro"); } catch {}
  });

  desenharAbas();
}

function desenharAbas() {
  $("#abas").innerHTML = Object.entries(TELAS).map(([chave, t]) => {
    const conta = chave === "pendentes" ? contagens.pendentes
      : chave === "alertas" ? contagens.alertas : null;
    const emAlerta = chave === "alertas" && contagens.alertas > 0;
    return `<button class="aba ${estado.tela === chave ? "ativa" : ""} ${emAlerta ? "alerta" : ""}"
                    data-tela="${chave}">
              ${esc(t.nome)}${conta ? `<span class="conta">${numero(conta)}</span>` : ""}
            </button>`;
  }).join("");

  $$("#abas .aba").forEach((b) => b.addEventListener("click", () => irPara(b.dataset.tela)));
}

function irPara(tela) {
  estado.tela = tela;
  estado.filtros.pagina = 1;
  redesenhar();
  window.scrollTo({ top: 0 });
}

/** Redesenha a tela atual e atualiza as contagens das abas. */
async function redesenhar() {
  escreverEndereco();
  desenharAbas();

  const tela = TELAS[estado.tela] || TELAS.dashboard;
  try {
    await tela.desenhar();
  } catch (erro) {
    avisar(erro.message, "erro");
    $("#tela").innerHTML = `<div class="vazio">${esc(erro.message)}</div>`;
  }

  atualizarContagens();
}

/** Números das abas Pendentes e Alertas — sempre do usuário selecionado. */
async function atualizarContagens() {
  try {
    const p = await api.painel({ usuario_id: estado.usuario });
    const novas = { pendentes: p.pendentes, alertas: p.em_alerta + (estado.usuario ? 0 : p.sem_responsavel) };
    if (novas.pendentes !== contagens.pendentes || novas.alertas !== contagens.alertas) {
      contagens = novas;
      desenharAbas();
    }
  } catch { /* silencioso: é só o contador */ }
}

iniciar();
