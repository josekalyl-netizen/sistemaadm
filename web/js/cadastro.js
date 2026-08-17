/**
 * Cadastro de proposta — o formulário que o administrativo usa para incluir
 * contratos novos, um a um.
 *
 * O supervisor é obrigatório: é ele que determina em qual visão a proposta vai
 * aparecer. Se o supervisor ainda não existe, dá para criar na hora.
 */

import { $, api, avisar, corRGB, esc } from "./util.js";

let config = null;
let aoCriar = () => {};

export function iniciarCadastro(cfg, callback) {
  config = cfg;
  aoCriar = callback;
}

export function atualizarConfigCadastro(cfg) {
  config = cfg;
}

export function abrirCadastro() {
  const modal = $("#modal");
  modal.innerHTML = formulario();
  modal.classList.remove("oculto");
  ligar();
  $("#c-razao").focus();
}

function fecharCadastro() {
  $("#modal").classList.add("oculto");
  $("#modal").innerHTML = "";
}

function formulario() {
  const supervisores = config.supervisores
    .map((s) => `<option value="${esc(s.nome)}">${esc(s.nome)}</option>`).join("");
  const etapas = config.etapas
    .map((e) => `<option value="${e.codigo}" ${e.codigo === "nova" ? "selected" : ""}>${e.ordem}. ${esc(e.nome)}</option>`)
    .join("");
  const tipos = config.tipos_proposta
    .map((t) => `<option value="${t.codigo}">${esc(t.nome)}</option>`).join("");
  const operadoras = config.operadoras.slice(0, 60)
    .map((o) => `<option value="${esc(o)}"></option>`).join("");
  const corretores = config.corretores.slice(0, 120)
    .map((c) => `<option value="${esc(c)}"></option>`).join("");
  const responsaveis = config.responsaveis.slice(0, 40)
    .map((r) => `<option value="${esc(r)}"></option>`).join("");

  return `
  <div class="modal-caixa" role="dialog" aria-modal="true" aria-label="Nova proposta">
    <div class="modal-cabeca">
      <div style="flex:1">
        <div class="etiqueta-editorial" style="margin-bottom:7px">Cadastro</div>
        <h2 class="section-title">Nova proposta</h2>
      </div>
      <button class="btn btn-fantasma btn-mini" id="c-fechar">✕</button>
    </div>

    <div class="modal-corpo">
      <div class="modal-erro oculto" id="c-erro"></div>

      <div class="etiqueta-editorial" style="margin-bottom:11px">Responsabilidade</div>
      <div class="grade-campos" style="margin-bottom:22px">
        <div>
          <label class="rotulo" for="c-supervisor">Supervisor responsável *</label>
          <select id="c-supervisor" class="campo">
            <option value="">— escolha o supervisor —</option>
            ${supervisores}
            <option value="__novo__">+ Cadastrar novo supervisor…</option>
          </select>
          <div class="dica">Define em qual visão a proposta vai aparecer.</div>
        </div>
        <div>
          <label class="rotulo" for="c-responsavel">Responsável operacional</label>
          <input id="c-responsavel" class="campo" list="lista-responsaveis" placeholder="Quem vai tocar a proposta">
          <datalist id="lista-responsaveis">${responsaveis}</datalist>
        </div>
        <div>
          <label class="rotulo" for="c-status">Etapa inicial</label>
          <select id="c-status" class="campo">${etapas}</select>
        </div>
      </div>

      <div class="etiqueta-editorial" style="margin-bottom:11px">Empresa</div>
      <div class="grade-campos" style="margin-bottom:22px">
        <div>
          <label class="rotulo" for="c-razao">Razão social / nome do titular *</label>
          <input id="c-razao" class="campo" type="text" placeholder="Nome da estipulante">
        </div>
        <div>
          <label class="rotulo" for="c-fantasia">Nome fantasia</label>
          <input id="c-fantasia" class="campo" type="text">
        </div>
        <div>
          <label class="rotulo" for="c-documento">CNPJ / CPF</label>
          <input id="c-documento" class="campo" type="text" inputmode="numeric" placeholder="00.000.000/0000-00">
          <div class="dica" id="c-doc-dica">Validado ao digitar.</div>
        </div>
        <div>
          <label class="rotulo" for="c-titular">Titular</label>
          <input id="c-titular" class="campo" type="text">
        </div>
      </div>

      <div class="etiqueta-editorial" style="margin-bottom:11px">Proposta</div>
      <div class="grade-campos">
        <div>
          <label class="rotulo" for="c-numero">Número da proposta</label>
          <input id="c-numero" class="campo" type="text">
        </div>
        <div>
          <label class="rotulo" for="c-operadora">Operadora</label>
          <input id="c-operadora" class="campo" list="lista-operadoras">
          <datalist id="lista-operadoras">${operadoras}</datalist>
        </div>
        <div>
          <label class="rotulo" for="c-produto">Produto</label>
          <input id="c-produto" class="campo" type="text">
        </div>
        <div>
          <label class="rotulo" for="c-corretor">Corretor</label>
          <input id="c-corretor" class="campo" list="lista-corretores">
          <datalist id="lista-corretores">${corretores}</datalist>
        </div>
        <div>
          <label class="rotulo" for="c-tipo">Tipo de proposta</label>
          <select id="c-tipo" class="campo"><option value="">Deduzir pelo documento</option>${tipos}</select>
        </div>
        <div>
          <label class="rotulo" for="c-valor">Valor (R$)</label>
          <input id="c-valor" class="campo" type="text" inputmode="decimal" placeholder="1.234,56">
        </div>
        <div>
          <label class="rotulo" for="c-vidas">Quantidade de vidas</label>
          <input id="c-vidas" class="campo" type="number" min="0">
        </div>
        <div>
          <label class="rotulo" for="c-data">Data da proposta</label>
          <input id="c-data" class="campo" type="date">
        </div>
        <div>
          <label class="rotulo" for="c-validade">Validade</label>
          <input id="c-validade" class="campo" type="date">
        </div>
      </div>

      <div id="c-bloco-pendencia" class="oculto" style="margin-top:22px">
        <div class="etiqueta-editorial" style="margin-bottom:11px">Pendência</div>
        <div class="grade-campos">
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

      <div style="margin-top:22px">
        <label class="rotulo" for="c-obs">Observações</label>
        <textarea id="c-obs" class="campo"></textarea>
      </div>
    </div>

    <div class="modal-rodape">
      <span class="dica" style="margin-right:auto">* campos obrigatórios</span>
      <button class="btn btn-fantasma" id="c-cancelar">Cancelar</button>
      <button class="btn btn-ouro" id="c-salvar">Cadastrar proposta</button>
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
      const opcao = new Option(novo.nome, novo.nome, true, true);
      e.target.add(opcao, e.target.options.length - 1);
      avisar(`Supervisor ${novo.nome} cadastrado.`);
    } catch (erro) {
      avisar(erro.message, "erro");
    }
  });

  // conferência do documento enquanto digita
  $("#c-documento").addEventListener("blur", async (e) => {
    const dica = $("#c-doc-dica");
    const valor = e.target.value.trim();
    if (!valor) { dica.className = "dica"; dica.textContent = "Validado ao digitar."; return; }
    try {
      const r = await api.conferirDocumento(valor);
      if (r.valido) {
        e.target.value = r.formatado;
        dica.className = "dica boa";
        dica.textContent = `${r.tipo.toUpperCase()} válido.`;
      } else {
        dica.className = "dica ruim";
        dica.textContent = `Atenção: ${r.motivo}. Dá para cadastrar mesmo assim.`;
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
    nome_fantasia: $("#c-fantasia").value,
    documento: $("#c-documento").value,
    titular: $("#c-titular").value,
    numero_proposta: $("#c-numero").value,
    operadora: $("#c-operadora").value,
    produto: $("#c-produto").value,
    corretor: $("#c-corretor").value,
    tipo: $("#c-tipo").value,
    valor: $("#c-valor").value,
    vidas: $("#c-vidas").value,
    data_proposta: $("#c-data").value,
    data_validade: $("#c-validade").value,
    observacoes: $("#c-obs").value,
    pendencia_tipo: $("#c-pend-tipo")?.value || "",
    pendencia_detalhe: $("#c-pend-detalhe")?.value || "",
  };

  if (corpo.nome_supervisor === "__novo__") corpo.nome_supervisor = "";

  try {
    const nova = await api.criar(corpo);
    fecharCadastro();
    avisar(`Proposta #${nova.id} cadastrada em "${etapaNome(nova.status_atual)}".`);
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

const etapaNome = (codigo) => config.etapas.find((e) => e.codigo === codigo)?.nome || codigo;
