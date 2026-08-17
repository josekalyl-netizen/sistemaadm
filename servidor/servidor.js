/**
 * Servidor HTTP: serve a interface (web/) e a API (/api/...).
 * Sem framework e sem dependências — só o Node.
 *
 *   node servidor/servidor.js          # http://localhost:3000
 *   PORTA=8080 node servidor/servidor.js
 */

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { abrirBanco } from "./banco.js";
import { prepararSePreciso } from "./preparar.js";
import {
  ErroDeUso, conferirDocumento, config, criarProposta, criarSupervisor,
  editarProposta, listarPropostas, mudarStatus, obterProposta, painel,
} from "./api.js";

const AQUI = dirname(fileURLToPath(import.meta.url));
const PASTA_WEB = join(AQUI, "..", "web");
const PORTA = Number(process.env.PORTA || 3000);

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

// Na primeira execução, converte e importa as planilhas sozinho. Precisa vir
// antes de pegar o banco: se o esquema for antigo, a preparação o recria.
await prepararSePreciso();
const db = abrirBanco();

function responder(res, status, corpo) {
  const texto = JSON.stringify(corpo);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(texto);
}

async function lerCorpo(req) {
  const partes = [];
  let tamanho = 0;
  for await (const parte of req) {
    tamanho += parte.length;
    if (tamanho > 2_000_000) throw new ErroDeUso("Requisição grande demais.", 413);
    partes.push(parte);
  }
  if (!partes.length) return {};
  try {
    return JSON.parse(Buffer.concat(partes).toString("utf8"));
  } catch {
    throw new ErroDeUso("JSON inválido.");
  }
}

/** Roteador da API. Devolve o corpo da resposta ou lança ErroDeUso. */
async function rotaApi(req, res, url) {
  const caminho = url.pathname.replace(/^\/api/, "");
  const metodo = req.method;
  const filtros = Object.fromEntries(url.searchParams);

  if (caminho === "/config" && metodo === "GET") return config(db);
  if (caminho === "/painel" && metodo === "GET") return painel(db, filtros);
  if (caminho === "/propostas" && metodo === "GET") return listarPropostas(db, filtros);

  if (caminho === "/propostas" && metodo === "POST") {
    const corpo = await lerCorpo(req);
    res.statusCode = 201;
    return criarProposta(db, corpo, corpo.autor);
  }

  if (caminho === "/supervisores" && metodo === "POST") {
    res.statusCode = 201;
    return criarSupervisor(db, await lerCorpo(req));
  }

  if (caminho === "/conferir-documento" && metodo === "GET") {
    return conferirDocumento(filtros.documento || "");
  }

  let m;
  if ((m = caminho.match(/^\/propostas\/(\d+)$/))) {
    if (metodo === "GET") return obterProposta(db, m[1]);
    if (metodo === "PATCH") {
      const corpo = await lerCorpo(req);
      return editarProposta(db, m[1], corpo, corpo.autor);
    }
  }

  if ((m = caminho.match(/^\/propostas\/(\d+)\/status$/)) && metodo === "PATCH") {
    return mudarStatus(db, m[1], await lerCorpo(req));
  }

  throw new ErroDeUso("Rota não encontrada.", 404);
}

/** Arquivos estáticos da interface, presos dentro de web/. */
async function servirEstatico(res, pathname) {
  const relativo = normalize(pathname === "/" ? "/index.html" : pathname).replace(/^(\.\.[/\\])+/, "");
  const arquivo = join(PASTA_WEB, relativo);
  if (!arquivo.startsWith(PASTA_WEB)) {
    res.writeHead(403).end("Acesso negado");
    return;
  }
  try {
    const info = await stat(arquivo);
    if (info.isDirectory()) throw new Error("diretório");
    const conteudo = await readFile(arquivo);
    res.writeHead(200, {
      "Content-Type": TIPOS[extname(arquivo)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(conteudo);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Arquivo não encontrado");
  }
}

const servidor = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (url.pathname.startsWith("/api/")) {
    try {
      const corpo = await rotaApi(req, res, url);
      responder(res, res.statusCode === 200 ? 200 : res.statusCode, corpo);
    } catch (erro) {
      if (erro instanceof ErroDeUso) {
        responder(res, erro.status, { erro: erro.message });
      } else {
        console.error(erro);
        responder(res, 500, { erro: "Erro interno do servidor." });
      }
    }
    return;
  }

  await servirEstatico(res, url.pathname);
});

servidor.listen(PORTA, () => {
  const n = db.prepare("SELECT COUNT(*) AS n FROM propostas").get().n;
  const endereco = `http://localhost:${PORTA}`;
  console.log(`\n  ┌──────────────────────────────────────────────┐`);
  console.log(`  │  Sistema Administrativo Inteligente          │`);
  console.log(`  │  Grupo W3G                                   │`);
  console.log(`  └──────────────────────────────────────────────┘`);
  console.log(`\n  Abra no navegador:  ${endereco}`);
  console.log(`  ${n} propostas no sistema`);
  console.log(`\n  Para parar: Ctrl + C\n`);
  abrirNavegador(endereco);
});

/** Abre o navegador sozinho. Se não der, o endereço já está impresso acima. */
function abrirNavegador(endereco) {
  if (process.env.SEM_NAVEGADOR) return;
  const comando = process.platform === "darwin" ? "open"
    : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", endereco] : [endereco];
  try {
    spawn(comando, args, { stdio: "ignore", detached: true }).unref();
  } catch { /* sem navegador: o usuário abre na mão */ }
}
