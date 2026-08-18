/** Funções de apoio: DOM, formatação e conversa com a API. */

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

/** Escapa texto para interpolar em HTML com segurança. */
export function esc(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Espera o usuário parar de digitar antes de disparar a busca. */
export function aguardar(fn, ms = 260) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// ----------------------------------------------------------- formatação

export function moeda(valor) {
  if (valor === null || valor === undefined || valor === "") return "—";
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function numero(valor) {
  return Number(valor || 0).toLocaleString("pt-BR");
}

/** "2026-07-08" -> "08/07" (o ano só aparece quando não é o corrente). */
export function dataCurta(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "—";
  const anoAtual = String(new Date().getFullYear());
  return m[1] === anoAtual ? `${m[3]}/${m[2]}` : `${m[3]}/${m[2]}/${m[1]}`;
}

export function data(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
}

export function dataHora(valor) {
  const m = String(valor || "").match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  return m ? `${m[3]}/${m[2]} às ${m[4]}:${m[5]}` : data(valor);
}

/** Dia da semana + data: "seg · 17/08". Usado no histórico diário. */
export function diaSemana(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "—";
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  const nomes = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  return `${nomes[d.getUTCDay()]} · ${m[3]}/${m[2]}`;
}

/**
 * Máscara de moeda em tempo real: o usuário digita só números e o campo se
 * comporta como valor em reais — "123456" vira "1.234,56" enquanto digita,
 * igual a um totem de pagamento. `input.value` fica sempre pronto para
 * `lerValor()` no domínio do servidor.
 */
export function ligarMascaraMoeda(input) {
  if (!input) return;
  const aplicar = () => {
    const digitos = input.value.replace(/\D/g, "");
    if (!digitos) { input.value = ""; return; }
    const numero = Number(digitos) / 100;
    input.value = numero.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  input.addEventListener("input", aplicar);
}

/** Preenche um campo de valor já mascarado, a partir do número vindo do servidor. */
export function valorParaCampo(numero) {
  if (numero === null || numero === undefined || numero === "") return "";
  return Number(numero).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Máscara de CPF/CNPJ em tempo real. Até 11 dígitos, formata como CPF
 * (000.000.000-00); a partir do 12º dígito, passa sozinho a formatar como
 * CNPJ (00.000.000/0000-00) — o comprimento é quem diz qual é.
 */
export function ligarMascaraDocumento(input) {
  if (!input) return;
  input.addEventListener("input", () => {
    const digitos = input.value.replace(/\D/g, "").slice(0, 14);
    input.value = mascararDocumento(digitos);
  });
}

export function mascararDocumento(digitos) {
  const d = String(digitos || "").replace(/\D/g, "").slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
  }
  return d
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4")
    .replace(/(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, "$1.$2.$3/$4-$5");
}

/** #D4AF37 -> "212 175 55" (formato dos tokens de cor). */
export function corRGB(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
  if (!m) return "154 167 188";
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

// ------------------------------------------------------------------ API

async function pedir(caminho, opcoes = {}) {
  const resposta = await fetch(caminho, {
    headers: { "Content-Type": "application/json" },
    ...opcoes,
    body: opcoes.corpo ? JSON.stringify(opcoes.corpo) : undefined,
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    const erro = new Error(dados.erro || `Falha na requisição (${resposta.status}).`);
    erro.status = resposta.status;
    throw erro;
  }
  return dados;
}

const query = (objeto = {}) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(objeto)) {
    if (v !== "" && v !== null && v !== undefined) p.set(k, v);
  }
  return p.toString();
};

export const api = {
  config: () => pedir("/api/config"),
  painel: (f) => pedir(`/api/painel?${query(f)}`),
  listar: (f) => pedir(`/api/propostas?${query(f)}`),
  obter: (id) => pedir(`/api/propostas/${id}`),
  criar: (corpo) => pedir("/api/propostas", { method: "POST", corpo }),
  editar: (id, corpo) => pedir(`/api/propostas/${id}`, { method: "PATCH", corpo }),
  status: (id, corpo) => pedir(`/api/propostas/${id}/status`, { method: "PATCH", corpo }),
  verificar: (id, corpo) => pedir(`/api/propostas/${id}/verificar`, { method: "POST", corpo }),
  mensagem: (id, f) => pedir(`/api/propostas/${id}/mensagem?${query(f)}`),
  usouMensagem: (id, indice, canal) => pedir(`/api/propostas/${id}/mensagem`, { method: "POST", corpo: { indice, canal } }),
  atribuir: (corpo) => pedir("/api/propostas/atribuir", { method: "POST", corpo }),
  usuarios: () => pedir("/api/usuarios"),
  criarUsuario: (corpo) => pedir("/api/usuarios", { method: "POST", corpo }),
  alterarUsuario: (id, corpo) => pedir(`/api/master/usuarios/${id}`, { method: "PATCH", corpo }),
  conferirDocumento: (doc) => pedir(`/api/conferir-documento?documento=${encodeURIComponent(doc)}`),
  implantadasResumo: () => pedir("/api/implantadas/resumo"),
  corretores: () => pedir("/api/corretores"),

  master: {
    sessao: () => pedir("/api/master/sessao"),
    entrar: (senha) => pedir("/api/master/entrar", { method: "POST", corpo: { senha } }),
    sair: () => pedir("/api/master/sair", { method: "POST" }),
    produtividade: () => pedir("/api/master/produtividade"),
    historico: (f) => pedir(`/api/master/historico?${query(f)}`),
    relatorio: (f) => pedir(`/api/master/relatorio?${query(f)}`),
    corretoresCSV: (csv) => pedir("/api/master/corretores/csv", { method: "POST", corpo: { csv } }),
    corretoresXlsx: (base64) => pedir("/api/master/corretores/xlsx", { method: "POST", corpo: { arquivo: base64 } }),
    criarCorretor: (corpo) => pedir("/api/master/corretores", { method: "POST", corpo }),
    carteira: () => pedir("/api/master/carteira"),
    criarSupervisor: (nome) => pedir("/api/master/supervisores", { method: "POST", corpo: { nome } }),
    editarCorretor: (id, corpo) => pedir(`/api/master/corretores/${id}`, { method: "PATCH", corpo }),
    editarSupervisor: (id, nome) => pedir(`/api/master/supervisores/${id}`, { method: "PATCH", corpo: { nome } }),
    excluir: (tabela, id) => pedir(`/api/master/${tabela}/${id}`, { method: "DELETE" }),
    reativar: (tabela, id) => pedir(`/api/master/${tabela}/${id}/reativar`, { method: "POST" }),
    conteudo: () => pedir("/api/master/conteudo"),
    trocarSenha: (atual, nova) => pedir("/api/master/senha", { method: "POST", corpo: { atual, nova } }),
    zerar: (confirmacao) => pedir("/api/master/zerar", { method: "POST", corpo: { confirmacao } }),
  },
};

// ------------------------------------------------------------------ aviso

let tempoAviso;
export function avisar(mensagem, tipo = "ok") {
  const caixa = $("#aviso");
  caixa.textContent = mensagem;
  caixa.className = `aviso visivel${tipo === "erro" ? " erro" : ""}`;
  clearTimeout(tempoAviso);
  tempoAviso = setTimeout(() => caixa.classList.remove("visivel"), 3400);
}
