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
  usouMensagem: (id, indice) => pedir(`/api/propostas/${id}/mensagem`, { method: "POST", corpo: { indice } }),
  atribuir: (corpo) => pedir("/api/propostas/atribuir", { method: "POST", corpo }),
  usuarios: () => pedir("/api/usuarios"),
  criarUsuario: (corpo) => pedir("/api/usuarios", { method: "POST", corpo }),
  alterarUsuario: (id, corpo) => pedir(`/api/master/usuarios/${id}`, { method: "PATCH", corpo }),
  conferirDocumento: (doc) => pedir(`/api/conferir-documento?documento=${encodeURIComponent(doc)}`),

  master: {
    sessao: () => pedir("/api/master/sessao"),
    entrar: (senha) => pedir("/api/master/entrar", { method: "POST", corpo: { senha } }),
    sair: () => pedir("/api/master/sair", { method: "POST" }),
    produtividade: () => pedir("/api/master/produtividade"),
    historico: (f) => pedir(`/api/master/historico?${query(f)}`),
    relatorio: (f) => pedir(`/api/master/relatorio?${query(f)}`),
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
