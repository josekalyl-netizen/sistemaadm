/**
 * MÓDULO 5 — acesso à Área Master.
 *
 * A senha NÃO fica no código nem no repositório. Ela é lida, nesta ordem:
 *   1. variável de ambiente SENHA_MASTER
 *   2. arquivo dados/senha-master.txt (fora do controle de versão)
 *
 * Se nenhuma das duas existir, o sistema cria o arquivo com uma senha
 * aleatória e a imprime uma única vez no terminal — assim nunca existe uma
 * senha padrão conhecida.
 *
 * Escopo honesto: isto é um sistema local, rodando na máquina da operação.
 * A sessão é um token aleatório guardado em memória e enviado num cookie. Isso
 * impede que a ADM entre no painel do Master pela interface; não é proteção
 * contra quem tem acesso ao computador e ao arquivo do banco.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, timingSafeEqual } from "node:crypto";

const AQUI = dirname(fileURLToPath(import.meta.url));
const ARQUIVO_SENHA = join(AQUI, "..", "dados", "senha-master.txt");

const DURACAO_SESSAO = 8 * 60 * 60 * 1000;   // 8 horas
const sessoes = new Map();                    // token -> expira em

let senhaEmMemoria = null;

/** Lê a senha configurada; na primeira vez, cria uma e avisa no terminal. */
export function senhaMaster() {
  if (senhaEmMemoria) return senhaEmMemoria;

  if (process.env.SENHA_MASTER) {
    senhaEmMemoria = process.env.SENHA_MASTER.trim();
    return senhaEmMemoria;
  }

  if (existsSync(ARQUIVO_SENHA)) {
    const guardada = readFileSync(ARQUIVO_SENHA, "utf8").trim();
    if (guardada) {
      senhaEmMemoria = guardada;
      return senhaEmMemoria;
    }
  }

  const nova = randomBytes(6).toString("base64url");
  mkdirSync(dirname(ARQUIVO_SENHA), { recursive: true });
  writeFileSync(ARQUIVO_SENHA, `${nova}\n`, { mode: 0o600 });
  senhaEmMemoria = nova;

  console.log("\n  ─────────────────────────────────────────────");
  console.log("  Área Master — senha criada agora:");
  console.log(`      ${nova}`);
  console.log("  Guardada em dados/senha-master.txt (fora do Git).");
  console.log("  Troque quando quiser: edite o arquivo e reinicie,");
  console.log("  ou rode com SENHA_MASTER=suasenha npm start");
  console.log("  ─────────────────────────────────────────────\n");

  return senhaEmMemoria;
}

/** Comparação em tempo constante — não vaza o tamanho pela demora. */
function senhaConfere(informada) {
  const a = Buffer.from(String(informada ?? ""));
  const b = Buffer.from(senhaMaster());
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function entrar(senha) {
  if (!senhaConfere(senha)) return null;
  const token = randomBytes(24).toString("hex");
  sessoes.set(token, Date.now() + DURACAO_SESSAO);
  return { token, expira_em: DURACAO_SESSAO / 1000 };
}

export function sair(token) {
  sessoes.delete(token);
}

export function sessaoValida(token) {
  if (!token) return false;
  const expira = sessoes.get(token);
  if (!expira) return false;
  if (expira < Date.now()) {
    sessoes.delete(token);
    return false;
  }
  return true;
}

/** Lê o token do cookie da requisição. */
export function tokenDoPedido(req) {
  const bruto = req.headers.cookie || "";
  const achado = bruto.split(";")
    .map((p) => p.trim().split("="))
    .find(([nome]) => nome === "master");
  return achado ? decodeURIComponent(achado[1] || "") : null;
}

export function cookieDeSessao(token) {
  return `master=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${DURACAO_SESSAO / 1000}`;
}

export const COOKIE_LIMPO = "master=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0";
