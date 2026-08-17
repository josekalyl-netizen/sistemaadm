/**
 * Cadastro de proposta — o formulário que o administrativo usa para incluir
 * contratos novos, um a um. Os campos são os mesmos da planilha.
 *
 * O supervisor é obrigatório: é ele que determina em qual visão a proposta vai
 * aparecer. Se o supervisor ainda não existe, dá para criar na hora.
 */

import { $, api, avisar, esc } from "./util.js";

let config = null;
let aoCriar = () => {};

export function iniciarCadastro(cfg, callback) {
  config = cfg;
  aoCriar = callback;
}

export function abrirCadastro() {
  const modal = $("#modal");
  modal.innerHTML = formulario();
  modal.classList.remove("oculto");
  ligar();
  $("#c-supervisor").focus();
}

function fecharCadastro() {
  $("#modal").classList.add("oculto");
  $("#modal").innerHTML = "";
}

function formulario() {
  const supervisores = config.supervisores
    .map((s) => `<option value="${esc(s.nome)}">${esc(s.nome)}</option>`).join("");
  const etapas = config.etapas
    .map((e) => `<option value="${e.codigo}" ${e.codigo === "nova" ? "selected" : ""}>${esc(e.nome)}</option>`)
    .join("");
  const lista = (valores, limite) => valores.slice(0, limite)
    .map((v) => `<option value="${esc(v)}"></option>`).join("");

  return `
  <div class="modal-caixa" role="dialog" aria-modal="true" aria-label="Nova proposta">
    <div class="modal-cabeca">
      <h2 class="titulo" style="flex:1">Nova proposta</h2>
      <button class="btn btn-limpo btn-mini" id="c-fechar">✕</button>
    </div>

    <div class="modal-corpo">
      <div class="modal-erro oculto" id="c-erro"></div>

      <div class="grade">
        <div>
          <label class="rotulo" for="c-supervisor">Supervisor *</label>
          <select id="c-supervisor" class="campo">
            <option value="">— escolha —</option>
            ${supervisores}
            <option value="__novo__">+ Cadastrar novo supervisor…</option>
          </select>
          <div class="dica">Define em qual visão a proposta aparece.</div>
        </div>
        <div>
          <label class="rotulo" for="c-status">Etapa inicial</label>
          <select id="c-status" class="campo">${etapas}</select>
        </div>
        <div>
          <label class="rotulo" for="c-responsavel">Responsável</label>
          <input id="c-responsavel" class="campo" list="lista-responsaveis">
          <datalist id="lista-responsaveis">${lista(config.responsaveis, 40)}</datalist>
        </div>
      </div>

      <div class="grade" style="margin-top:14px">
        <div>
          <label class="rotulo" for="c-razao">Estipulante *</label>
          <input id="c-razao" class="campo" type="text" placeholder="Nome da estipulante">
        </div>
        <div>
          <label class="rotulo" for="c-documento">CNPJ / CPF</label>
          <input id="c-documento" class="campo" type="text" inputmode="numeric" placeholder="00.000.000/0000-00">
          <div class="dica" id="c-doc-dica">Conferido ao sair do campo.</div>
        </div>
        <div>
          <label class="rotulo" for="c-numero">Proposta</label>
          <input id="c-numero" class="campo" type="text">
        </div>
        <div>
          <label class="rotulo" for="c-operadora">Operadora</label>
          <input id="c-operadora" class="campo" list="lista-operadoras">
          <datalist id="lista-operadoras">${lista(config.operadoras, 60)}</datalist>
        </div>
        <div>
          <label class="rotulo" for="c-corretor">Corretor</label>
          <input id="c-corretor" class="campo" list="lista-corretores">
          <datalist id="lista-corretores">${lista(config.corretores, 120)}</datalist>
        </div>
        <div>
          <label class="rotulo" for="c-valor">Valor (R$)</label>
          <input id="c-valor" class="campo" type="text" inputmode="decimal" placeholder="1.234,56">
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
          <input id="c-cadastrado" class="campo" type="text" placeholder="SIM / NA PASTA 17/08">
        </div>
      </div>

      <div id="c-bloco-pendencia" class="oculto" style="margin-top:14px">
        <div class="grade">
          <div>
            <label class="rotulo" for="c-pend-tipo">Qual é a pendência?</label>
            <select id="c-pend-tipo" class="campo">
              <option value="">— selecione —</option>
              ${config.tipos_pendencia.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join("")}
            </select>
          </div>
          <div>
            <label class="rotulo" for="c-pend-detalhe">Detalhe</label>
            <input id="c-pend-detalhe" class="campo" type="text">
          </div>
        </div>
      </div>

      <div style="margin-top:14px">
        <label class="rotulo" for="c-obs">Observações</label>
        <textarea id="c-obs" class="campo"></textarea>
      </div>
    </div>

    <div class="modal-rodape">
      <span class="dica" style="margin:0 auto 0 0">* obrigatório</span>
      <button class="btn btn-limpo" id="c-cancelar">Cancelar</button>
      <button class="btn btn-principal" id="c-salvar">Cadastrar</button>
    </div>
  </div>`;
}

function ligar() {
  $("#c-fechar").addEventListener("click", fecharCadastro);
  $("#c-cancelar").addEventListener("click", fecharCadastro);
  $("#modal").addEventListener("click", (e) => {
    if (e.target.id === "modal") fecharCadastro();
  });

  $("#c-data").valueAsDate = new Date();

  // campos de pendência só aparecem quando a etapa inicial é "Pendente"
  $("#c-status").addEventListener("change", (e) => {
    $("#c-bloco-pendencia").classList.toggle("oculto", e.target.value !== "pendente");
  });

  // criar supervisor sem sair do formulário
  $("#c-supervisor").addEventListener("change", async (e) => {
    if (e.target.value !== "__novo__") return;
    const nome = prompt("Nome do novo supervisor:", "");
    e.target.value = "";
    if (!nome || !nome.trim()) return;
    try {
      const novo = await api.novoSupervisor(nome.trim());
      config.supervisores.push({ ...novo, total: 0 });
      config.supervisores.sort((a, b) => a.nome.localeCompare(b.nome));
      e.target.add(new Option(novo.nome, novo.nome, true, true), e.target.options.length - 1);
      avisar(`Supervisor ${novo.nome} cadastrado.`);
    } catch (erro) {
      avisar(erro.message, "erro");
    }
  });

  // conferência do documento ao sair do campo
  $("#c-documento").addEventListener("blur", async (e) => {
    const dica = $("#c-doc-dica");
    const valor = e.target.value.trim();
    if (!valor) { dica.className = "dica"; dica.textContent = "Conferido ao sair do campo."; return; }
    try {
      const r = await api.conferirDocumento(valor);
      if (r.valido) {
        e.target.value = r.formatado;
        dica.className = "dica boa";
        dica.textContent = `${r.tipo.toUpperCase()} válido.`;
      } else {
        dica.className = "dica ruim";
        dica.textContent = `${r.motivo}. Dá para cadastrar mesmo assim.`;
      }
    } catch { /* sem rede: segue sem a dica */ }
  });

  $("#c-salvar").addEventListener("click", salvar);
}

async function salvar() {
  const erro = $("#c-erro");
  const corpo = {
    nome_supervisor: $("#c-supervisor").value,
    responsavel: $("#c-responsavel").value,
    status_atual: $("#c-status").value,
    razao_social: $("#c-razao").value,
    documento: $("#c-documento").value,
    numero_proposta: $("#c-numero").value,
    operadora: $("#c-operadora").value,
    corretor: $("#c-corretor").value,
    valor: $("#c-valor").value,
    data_proposta: $("#c-data").value,
    data_validade: $("#c-validade").value,
    cadastrado: $("#c-cadastrado").value,
    observacoes: $("#c-obs").value,
    pendencia_tipo: $("#c-pend-tipo")?.value || "",
    pendencia_detalhe: $("#c-pend-detalhe")?.value || "",
  };

  if (corpo.nome_supervisor === "__novo__") corpo.nome_supervisor = "";

  try {
    const nova = await api.criar(corpo);
    fecharCadastro();
    avisar(`Proposta #${nova.id} cadastrada.`);
    aoCriar(nova.id);
  } catch (e) {
    // 409 = já existe proposta igual; o usuário decide se cadastra assim mesmo
    if (e.status === 409 && confirm(`${e.message}\n\nCadastrar mesmo assim?`)) {
      try {
        const nova = await api.criar({ ...corpo, confirmar_duplicada: true });
        fecharCadastro();
        avisar(`Proposta #${nova.id} cadastrada.`);
        aoCriar(nova.id);
        return;
      } catch (e2) { mostrarErro(erro, e2.message); return; }
    }
    mostrarErro(erro, e.message);
  }
}

function mostrarErro(caixa, mensagem) {
  caixa.textContent = mensagem;
  caixa.classList.remove("oculto");
  caixa.scrollIntoView({ behavior: "smooth", block: "nearest" });
}
