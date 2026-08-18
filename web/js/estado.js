/**
 * Estado compartilhado da interface.
 *
 * Duas coisas moram aqui e valem para o sistema inteiro:
 *   `usuario`  quem está usando — filtra TODAS as telas para a carteira dela
 *   `filtros`  busca e filtros da listagem
 *
 * O endereço do navegador espelha esse estado, então dá para mandar um link
 * do que se está vendo.
 */

import { api } from "./util.js";

export const estado = {
  config: null,
  masterAberto: false,

  /** "" = todos · "sem" = propostas sem responsável · número = id da ADM */
  usuario: "",

  tela: "propostas",

  filtros: {
    busca: "", status: "", nivel: "", operadora: "", corretor: "",
    cadastrado: "", de: "", ate: "", ordem: "recentes", pagina: 1,
  },
};

/** Os filtros que a API precisa, já com o usuário selecionado embutido. */
export function filtrosDaBusca(extra = {}) {
  return { ...estado.filtros, usuario_id: estado.usuario, ...extra };
}

export const etapaDe = (codigo) =>
  estado.config.etapas.find((e) => e.codigo === codigo) || estado.config.etapas[0];

export const nivelDe = (codigo) =>
  estado.config.niveis.find((n) => n.codigo === codigo) || estado.config.niveis[0];

export const nomeDoUsuario = () => {
  if (estado.usuario === "sem") return "Sem responsável";
  if (!estado.usuario) return "Todos";
  return estado.config.usuarios.find((u) => String(u.id) === String(estado.usuario))?.nome || "";
};

/** Recarrega a configuração (usada depois de cadastrar uma ADM nova). */
export async function recarregarConfig() {
  estado.config = await api.config();
}

// --------------------------------------------------------------- endereço

const CHAVES_URL = ["tela", "usuario", "busca", "status", "nivel", "operadora",
  "corretor", "cadastrado", "de", "ate", "ordem", "pagina"];

export function lerEndereco() {
  const p = new URLSearchParams(location.search);
  if (p.has("tela")) estado.tela = p.get("tela");
  if (p.has("usuario")) estado.usuario = p.get("usuario");
  for (const chave of Object.keys(estado.filtros)) {
    if (p.has(chave)) estado.filtros[chave] = p.get(chave);
  }
  estado.filtros.pagina = Number(estado.filtros.pagina) || 1;
}

export function escreverEndereco() {
  const p = new URLSearchParams();
  const valores = { tela: estado.tela, usuario: estado.usuario, ...estado.filtros };
  for (const chave of CHAVES_URL) {
    const v = valores[chave];
    if (v && !(chave === "pagina" && Number(v) === 1)
          && !(chave === "ordem" && v === "recentes")
          && !(chave === "tela" && v === "propostas")) {
      p.set(chave, v);
    }
  }
  const q = p.toString();
  history.replaceState(null, "", q ? `?${q}` : location.pathname);
}
