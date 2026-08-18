/**
 * Cadastro de proposta.
 *
 * Corretor e Responsável ADM são coisas diferentes e ficam separados no
 * formulário: o corretor é quem trouxe o negócio — escolhido da carteira que
 * o Master cadastrou, já vinculado a um supervisor — e a ADM é quem vai
 * acompanhar a proposta aqui dentro.
 *
 * Empresa, CPF/CNPJ, corretor, operadora, responsável ADM, valor e emissão
 * são obrigatórios: sem eles o cadastro não é liberado.
 */

import { $, api, avisar, esc, ligarMascaraDocumento, ligarMascaraMoeda } from "./util.js";
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
  const corretores = cfg.corretores_cadastro || [];

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
          <label class="rotulo" for="c-documento">CNPJ / CPF *</label>
          <input id="c-documento" class="campo" inputmode="numeric" placeholder="00.000.000/0000-00">
          <div class="dica" id="c-doc-dica"></div>
        </div>
        <div>
          <label class="rotulo" for="c-corretor">Corretor *</label>
          <select id="c-corretor" class="campo">
            <option value="">— escolha —</option>
            ${corretores.map((c) => `<option value="${esc(c.nome)}" data-supervisor="${c.supervisor_id ?? ""}" data-supervisor-nome="${esc(c.supervisor_nome || "")}">${esc(c.nome)}${c.supervisor_nome ? ` (${esc(c.supervisor_nome)})` : ""}</option>`).join("")}
          </select>
          <div class="dica" id="c-corretor-dica">${corretores.length ? "" : "Nenhum corretor cadastrado — peça ao Master para subir a carteira."}</div>
        </div>
        <div>
          <label class="rotulo" for="c-operadora">Operadora *</label>
          <input id="c-operadora" class="campo" list="l-operadoras">
          <datalist id="l-operadoras">${cfg.operadoras.slice(0, 60).map((v) => `<option value="${esc(v)}"></option>`).join("")}</datalist>
        </div>
        <div>
          <label class="rotulo" for="c-usuario">Responsável ADM *</label>
          <select id="c-usuario" class="campo">
            <option value="">— escolha —</option>
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
          <label class="rotulo" for="c-valor">Valor (R$) *</label>
          <input id="c-valor" class="campo" inputmode="decimal" placeholder="1.234,56">
        </div>
        <div>
          <label class="rotulo" for="c-data">Emissão *</label>
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

      <label class="marcador" for="c-emitida">
        <input type="checkbox" id="c-emitida">
        <span>
          <b>Emitida pelo corretor</b>
          <span class="dica">Fica marcado na proposta para sempre — não dá para desfazer depois.</span>
        </span>
      </label>

      <div id="c-pendencia" class="oculto" style="margin-top:20px">
        <label class="rotulo" for="c-pend-detalhe">Pendência</label>
        <input id="c-pend-detalhe" class="campo" placeholder="descreva a pendência">
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

  ligarMascaraMoeda($("#c-valor"));
  ligarMascaraDocumento($("#c-documento"));

  $("#c-status").addEventListener("change", (e) => {
    $("#c-pendencia").classList.toggle("oculto", e.target.value !== "pendente");
  });

  $("#c-corretor").addEventListener("change", (e) => {
    const opcao = e.target.selectedOptions[0];
    const supervisorNome = opcao?.dataset.supervisorNome;
    $("#c-corretor-dica").textContent = supervisorNome ? `Supervisor: ${supervisorNome}` : "";
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

/** Campos exigidos antes de liberar o cadastro. */
function camposFaltando() {
  const faltando = [];
  if (!$("#c-razao").value.trim()) faltando.push("Empresa");
  if (!$("#c-documento").value.replace(/\D/g, "")) faltando.push("CPF/CNPJ");
  if (!$("#c-corretor").value) faltando.push("Corretor");
  if (!$("#c-operadora").value.trim()) faltando.push("Operadora");
  if (!$("#c-usuario").value) faltando.push("Responsável ADM");
  if (!$("#c-valor").value.trim()) faltando.push("Valor");
  if (!$("#c-data").value) faltando.push("Emissão");
  return faltando;
}

function corpoFormulario() {
  const corretorOpcao = $("#c-corretor").selectedOptions[0];
  return {
    razao_social: $("#c-razao").value,
    documento: $("#c-documento").value,
    corretor: $("#c-corretor").value,
    supervisor_id: corretorOpcao?.dataset.supervisor || "",
    operadora: $("#c-operadora").value,
    usuario_id: $("#c-usuario").value,
    status_atual: $("#c-status").value,
    numero_proposta: $("#c-numero").value,
    valor: $("#c-valor").value,
    data_proposta: $("#c-data").value,
    data_validade: $("#c-validade").value,
    cadastrado: $("#c-cadastrado").value,
    observacoes: $("#c-obs").value,
    pendencia_detalhe: $("#c-pend-detalhe")?.value || "",
    emitida_pelo_corretor: $("#c-emitida").checked,
  };
}

async function salvar() {
  const faltando = camposFaltando();
  if (faltando.length) {
    mostrarErro(`Preencha antes de cadastrar: ${faltando.join(", ")}.`);
    return;
  }

  const corpo = corpoFormulario();

  try {
    const nova = await api.criar(corpo);
    fechar();
    avisar(`Proposta #${nova.id} cadastrada para ${nova.nome_adm}.`);
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
