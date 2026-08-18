/**
 * Cadastro de proposta.
 *
 * Corretor e Responsável ADM são coisas diferentes e ficam separados no
 * formulário: o corretor é quem trouxe o negócio (texto livre); a ADM é quem
 * vai acompanhar a proposta aqui dentro (escolhida na lista de usuários).
 *
 * A proposta PODE ser cadastrada sem ADM — mas aí cai na fila "sem
 * responsável", que aparece em Alertas para o Master distribuir.
 */

import { $, api, avisar, esc } from "./util.js";
import { estado } from "./estado.js";

let aoCriar = () => {};

export function iniciarCadastro(callback) {
  aoCriar = callback;
}

export function abrirCadastro() {
  $("#modal").innerHTML = formulario();
  $("#modal").classList.remove("oculto");
  ligar();
  $("#c-razao").focus();
}

function fechar() {
  $("#modal").classList.add("oculto");
  $("#modal").innerHTML = "";
}

function formulario() {
  const cfg = estado.config;
  const lista = (valores, limite) => valores.slice(0, limite)
    .map((v) => `<option value="${esc(v)}"></option>`).join("");

  return `
  <div class="modal-caixa" role="dialog" aria-modal="true" aria-label="Nova proposta">
    <div class="modal-cabeca">
      <h2 class="titulo" style="flex:1">Nova proposta</h2>
      <button class="btn btn-limpo" id="c-fechar">✕</button>
    </div>

    <div class="modal-corpo">
      <div class="modal-erro oculto" id="c-erro"></div>

      <div class="grade">
        <div>
          <label class="rotulo" for="c-razao">Empresa *</label>
          <input id="c-razao" class="campo" placeholder="razão social">
        </div>
        <div>
          <label class="rotulo" for="c-documento">CNPJ / CPF</label>
          <input id="c-documento" class="campo" inputmode="numeric" placeholder="00.000.000/0000-00">
          <div class="dica" id="c-doc-dica"></div>
        </div>
        <div>
          <label class="rotulo" for="c-corretor">Corretor</label>
          <input id="c-corretor" class="campo" list="l-corretores" placeholder="quem trouxe o negócio">
          <datalist id="l-corretores">${lista(cfg.corretores, 120)}</datalist>
        </div>
        <div>
          <label class="rotulo" for="c-operadora">Operadora</label>
          <input id="c-operadora" class="campo" list="l-operadoras">
          <datalist id="l-operadoras">${lista(cfg.operadoras, 60)}</datalist>
        </div>
        <div>
          <label class="rotulo" for="c-usuario">Responsável ADM</label>
          <select id="c-usuario" class="campo">
            <option value="">— definir depois —</option>
            ${cfg.usuarios.map((u) => `<option value="${u.id}"
              ${String(u.id) === String(estado.usuario) ? "selected" : ""}>${esc(u.nome)}</option>`).join("")}
          </select>
          <div class="dica">Quem vai acompanhar a proposta.</div>
        </div>
        <div>
          <label class="rotulo" for="c-status">Etapa</label>
          <select id="c-status" class="campo">
            ${cfg.etapas.map((e) => `<option value="${e.codigo}" ${e.codigo === "nova" ? "selected" : ""}>${esc(e.nome)}</option>`).join("")}
          </select>
        </div>
        <div>
          <label class="rotulo" for="c-numero">Proposta</label>
          <input id="c-numero" class="campo" placeholder="número">
        </div>
        <div>
          <label class="rotulo" for="c-valor">Valor (R$)</label>
          <input id="c-valor" class="campo" inputmode="decimal" placeholder="1.234,56">
        </div>
        <div>
          <label class="rotulo" for="c-data">Emissão</label>
          <input id="c-data" class="campo" type="date">
        </div>
        <div>
          <label class="rotulo" for="c-validade">Validade</label>
          <input id="c-validade" class="campo" type="date">
        </div>
        <div>
          <label class="rotulo" for="c-cadastrado">Cadastrado</label>
          <input id="c-cadastrado" class="campo" placeholder="SIM / NA PASTA 17/08">
        </div>
      </div>

      <div id="c-pendencia" class="oculto" style="margin-top:20px">
        <div class="grade">
          <div>
            <label class="rotulo" for="c-pend-tipo">Qual é a pendência?</label>
            <select id="c-pend-tipo" class="campo">
              <option value="">—</option>
              ${cfg.tipos_pendencia.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join("")}
            </select>
          </div>
          <div>
            <label class="rotulo" for="c-pend-detalhe">Detalhe</label>
            <input id="c-pend-detalhe" class="campo">
          </div>
        </div>
      </div>

      <div style="margin-top:20px">
        <label class="rotulo" for="c-obs">Observações</label>
        <textarea id="c-obs" class="campo"></textarea>
      </div>
    </div>

    <div class="modal-rodape">
      <span class="dica" style="margin:0 auto 0 0">* obrigatório</span>
      <button class="btn" id="c-cancelar">Cancelar</button>
      <button class="btn btn-cheio" id="c-salvar">Cadastrar</button>
    </div>
  </div>`;
}

function ligar() {
  $("#c-fechar").addEventListener("click", fechar);
  $("#c-cancelar").addEventListener("click", fechar);
  $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") fechar(); });

  $("#c-data").valueAsDate = new Date();

  $("#c-status").addEventListener("change", (e) => {
    $("#c-pendencia").classList.toggle("oculto", e.target.value !== "pendente");
  });

  $("#c-documento").addEventListener("blur", async (e) => {
    const dica = $("#c-doc-dica");
    const valor = e.target.value.trim();
    if (!valor) { dica.className = "dica"; dica.textContent = ""; return; }
    try {
      const r = await api.conferirDocumento(valor);
      if (r.valido) {
        e.target.value = r.formatado;
        dica.className = "dica boa";
        dica.textContent = `${r.tipo.toUpperCase()} válido`;
      } else {
        dica.className = "dica ruim";
        dica.textContent = `${r.motivo} — dá para cadastrar mesmo assim`;
      }
    } catch { /* sem rede: segue sem a dica */ }
  });

  $("#c-salvar").addEventListener("click", salvar);
}

async function salvar() {
  const corpo = {
    razao_social: $("#c-razao").value,
    documento: $("#c-documento").value,
    corretor: $("#c-corretor").value,
    operadora: $("#c-operadora").value,
    usuario_id: $("#c-usuario").value,
    status_atual: $("#c-status").value,
    numero_proposta: $("#c-numero").value,
    valor: $("#c-valor").value,
    data_proposta: $("#c-data").value,
    data_validade: $("#c-validade").value,
    cadastrado: $("#c-cadastrado").value,
    observacoes: $("#c-obs").value,
    pendencia_tipo: $("#c-pend-tipo")?.value || "",
    pendencia_detalhe: $("#c-pend-detalhe")?.value || "",
  };

  try {
    const nova = await api.criar(corpo);
    fechar();
    avisar(nova.usuario_id
      ? `Proposta #${nova.id} cadastrada para ${nova.nome_adm}.`
      : `Proposta #${nova.id} cadastrada SEM responsável — aparece em Alertas.`);
    aoCriar(nova.id);
  } catch (e) {
    if (e.status === 409 && confirm(`${e.message}\n\nCadastrar mesmo assim?`)) {
      try {
        const nova = await api.criar({ ...corpo, confirmar_duplicada: true });
        fechar();
        avisar(`Proposta #${nova.id} cadastrada.`);
        aoCriar(nova.id);
        return;
      } catch (e2) { mostrarErro(e2.message); return; }
    }
    mostrarErro(e.message);
  }
}

function mostrarErro(mensagem) {
  const caixa = $("#c-erro");
  caixa.textContent = mensagem;
  caixa.classList.remove("oculto");
}
