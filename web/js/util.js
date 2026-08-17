/** Funções de apoio: DOM, formatação e conversa com a API. */

// ------------------------------------------------------------------ DOM

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
  return Number(valor).toLocaleString("pt-BR", {
    style: "currency", currency: "BRL", maximumFractionDigits: 2,
  });
}

export function numero(valor) {
  return Number(valor || 0).toLocaleString("pt-BR");
}

/** "2026-07-08" -> "08/07/2026" */
export function data(iso) {
  if (!iso) return "—";
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso);
}

/** "2026-08-17 14:32:01" -> "17/08/2026 14:32" */
export function dataHora(valor) {
  if (!valor) return "—";
  const m = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : data(valor);
}

/** "há 3 dias" — usado no rodapé do card para mostrar o quanto está parada. */
export function desde(valor) {
  if (!valor) return "—";
  const quando = new Date(String(valor).replace(" ", "T") + (String(valor).includes("Z") ? "" : "Z"));
  const seg = (Date.now() - quando.getTime()) / 1000;
  if (!Number.isFinite(seg)) return "—";
  if (seg < 90) return "agora";
  if (seg < 3600) return `há ${Math.round(seg / 60)} min`;
  if (seg < 86400) return `há ${Math.round(seg / 3600)} h`;
  const dias = Math.round(seg / 86400);
  if (dias < 30) return `há ${dias} ${dias === 1 ? "dia" : "dias"}`;
  const meses = Math.round(dias / 30);
  return `há ${meses} ${meses === 1 ? "mês" : "meses"}`;
}

/** #D4AF37 -> "212 175 55" (formato dos tokens de cor da identidade). */
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

export const api = {
  config: () => pedir("/api/config"),
  painel: (filtros) => pedir(`/api/painel?${new URLSearchParams(limpar(filtros))}`),
  listar: (filtros) => pedir(`/api/propostas?${new URLSearchParams(limpar(filtros))}`),
  obter: (id) => pedir(`/api/propostas/${id}`),
  criar: (corpo) => pedir("/api/propostas", { method: "POST", corpo }),
  editar: (id, corpo) => pedir(`/api/propostas/${id}`, { method: "PATCH", corpo }),
  status: (id, corpo) => pedir(`/api/propostas/${id}/status`, { method: "PATCH", corpo }),
  novoSupervisor: (nome) => pedir("/api/supervisores", { method: "POST", corpo: { nome } }),
  conferirDocumento: (doc) => pedir(`/api/conferir-documento?documento=${encodeURIComponent(doc)}`),
};

/** Tira do objeto os campos vazios — a URL fica limpa e legível. */
function limpar(objeto = {}) {
  const saida = {};
  for (const [k, v] of Object.entries(objeto)) {
    if (v !== "" && v !== null && v !== undefined) saida[k] = v;
  }
  return saida;
}

// ------------------------------------------------------------------ aviso

let tempoAviso;
export function avisar(mensagem, tipo = "ok") {
  const caixa = $("#aviso");
  caixa.textContent = mensagem;
  caixa.className = `aviso visivel${tipo === "erro" ? " erro" : ""}`;
  clearTimeout(tempoAviso);
  tempoAviso = setTimeout(() => caixa.classList.remove("visivel"), 3600);
}
