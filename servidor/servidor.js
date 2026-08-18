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
import { contar, zerar } from "./zerar.js";
import {
  ErroDeUso, alterarUsuario, atribuirAdm, conferirDocumento, config,
  criarProposta, criarUsuario, editarProposta, implantadasPorMes,
  importarCorretoresCSV, listarCorretores, listarPropostas, listarUsuarios,
  mudarStatus, obterProposta,
} from "./api.js";
import {
  fecharDiasPassados, historicoDiario, porUsuario, relatorio, situacaoAtual,
  valoresPainel, verificar,
} from "./acompanhamento.js";
import { escolherMensagem, registrarUso } from "./mensagens.js";
import {
  COOKIE_LIMPO, cookieDeSessao, entrar, sair, senhaMaster, senhaVemDoAmbiente,
  sessaoValida, tokenDoPedido, trocarSenhaMaster,
} from "./autenticacao.js";

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

// Fecha os dias que passaram enquanto o sistema esteve desligado e garante que
// a senha da Área Master exista (na primeira vez, ela é criada e impressa).
fecharDiasPassados(db);
senhaMaster();

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

  // ------------------------------------------------------------ básico
  if (caminho === "/config" && metodo === "GET") return config(db);

  if (caminho === "/propostas" && metodo === "GET") return listarPropostas(db, filtros);

  if (caminho === "/propostas" && metodo === "POST") {
    const corpo = await lerCorpo(req);
    res.statusCode = 201;
    return criarProposta(db, corpo, corpo.autor);
  }

  if (caminho === "/conferir-documento" && metodo === "GET") {
    return conferirDocumento(filtros.documento || "");
  }

  // ------------------------------------------------ dashboard da ADM
  // Todos os números respeitam o usuário selecionado no topo da tela.
  if (caminho === "/painel" && metodo === "GET") {
    return {
      ...situacaoAtual(db, { usuario_id: filtros.usuario_id }),
      sem_responsavel: db.prepare("SELECT COUNT(*) AS n FROM propostas WHERE usuario_id IS NULL").get().n,
      valores: valoresPainel(db, { usuario_id: filtros.usuario_id }),
    };
  }

  if (caminho === "/implantadas/resumo" && metodo === "GET") {
    return { meses: implantadasPorMes(db) };
  }

  if (caminho === "/corretores" && metodo === "GET") return listarCorretores(db);

  // --------------------------------------------------------- usuários
  // A lista é aberta (é ela que alimenta o seletor do topo); cadastrar e
  // desativar são atos do Master.
  if (caminho === "/usuarios" && metodo === "GET") return listarUsuarios(db);

  if (caminho === "/usuarios" && metodo === "POST") {
    if (!sessaoValida(tokenDoPedido(req))) {
      throw new ErroDeUso("Só o Master cadastra usuários. Entre na Área Master.", 401);
    }
    res.statusCode = 201;
    return criarUsuario(db, await lerCorpo(req));
  }

  // ------------------------------------------------------- propostas
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

  // O botão "Verificar proposta": o coração do acompanhamento diário.
  if ((m = caminho.match(/^\/propostas\/(\d+)\/verificar$/)) && metodo === "POST") {
    const corpo = await lerCorpo(req);
    const feito = verificar(db, m[1], corpo);
    if (!feito) throw new ErroDeUso("Proposta não encontrada.", 404);
    return { ...feito, proposta: obterProposta(db, m[1]) };
  }

  // Mensagem pronta para o corretor.
  if ((m = caminho.match(/^\/propostas\/(\d+)\/mensagem$/))) {
    const proposta = obterProposta(db, m[1]);
    if (metodo === "GET") {
      const escolhida = escolherMensagem(db, proposta, {
        pendencia: filtros.pendencia || "",
        indice: filtros.indice === undefined ? null : Number(filtros.indice),
        canal: filtros.canal === "email" ? "email" : "whatsapp",
      });
      if (!escolhida) throw new ErroDeUso("Não há mensagem para esta etapa.", 404);
      return escolhida;
    }
    // POST = a ADM copiou; registra para não repetir com o mesmo corretor
    if (metodo === "POST") {
      const corpo = await lerCorpo(req);
      registrarUso(db, proposta, corpo.indice, corpo.canal);
      return { registrado: true };
    }
  }

  if ((m = caminho.match(/^\/propostas\/(\d+)\/verificacoes$/)) && metodo === "GET") {
    return obterProposta(db, m[1]).verificacoes;
  }

  if (caminho === "/propostas/atribuir" && metodo === "POST") {
    return atribuirAdm(db, await lerCorpo(req));
  }

  // ----------------------------------------------------------- master
  // Tudo abaixo exige a sessão criada com a senha da Área Master.
  if (caminho === "/master/entrar" && metodo === "POST") {
    const corpo = await lerCorpo(req);
    const sessao = entrar(corpo.senha);
    if (!sessao) throw new ErroDeUso("Senha incorreta.", 401);
    res.setHeader("Set-Cookie", cookieDeSessao(sessao.token));
    return { entrou: true };
  }

  if (caminho === "/master/sair" && metodo === "POST") {
    sair(tokenDoPedido(req));
    res.setHeader("Set-Cookie", COOKIE_LIMPO);
    return { entrou: false };
  }

  if (caminho === "/master/sessao" && metodo === "GET") {
    return { entrou: sessaoValida(tokenDoPedido(req)) };
  }

  if (caminho.startsWith("/master/")) {
    if (!sessaoValida(tokenDoPedido(req))) {
      throw new ErroDeUso("Área Master: é preciso entrar com a senha.", 401);
    }

    if (caminho === "/master/produtividade" && metodo === "GET") {
      fecharDiasPassados(db);
      return porUsuario(db);
    }
    if (caminho === "/master/historico" && metodo === "GET") {
      return {
        dias: historicoDiario(db, {
          usuario_id: filtros.usuario_id || null,
          de: filtros.de,
          ate: filtros.ate,
        }),
      };
    }
    if (caminho === "/master/relatorio" && metodo === "GET") {
      return relatorio(db, {
        periodo: filtros.periodo,
        de: filtros.de,
        ate: filtros.ate,
        usuario_id: filtros.usuario_id || null,
      });
    }
    if ((m = caminho.match(/^\/master\/usuarios\/(\d+)$/)) && metodo === "PATCH") {
      return alterarUsuario(db, m[1], await lerCorpo(req));
    }
    if (caminho === "/master/corretores/csv" && metodo === "POST") {
      const corpo = await lerCorpo(req);
      return importarCorretoresCSV(db, corpo.csv || "");
    }
    if (caminho === "/master/conteudo" && metodo === "GET") {
      return { tabelas: contar(db), senha_do_ambiente: senhaVemDoAmbiente() };
    }
    // Troca de senha. A senha nova só vai no pedido — nunca volta na resposta,
    // nem entra em log.
    if (caminho === "/master/senha" && metodo === "POST") {
      const corpo = await lerCorpo(req);
      try {
        trocarSenhaMaster(corpo.atual, corpo.nova);
      } catch (erro) {
        throw new ErroDeUso(erro.message);
      }
      // trocarSenhaMaster derruba todas as sessões, esta inclusive.
      res.setHeader("Set-Cookie", COOKIE_LIMPO);
      return { trocada: true };
    }
    // Zerar o sistema pela tela, sem terminal. A confirmação digitada não é
    // burocracia: é a única barreira entre um clique errado e 2 mil propostas.
    if (caminho === "/master/zerar" && metodo === "POST") {
      const corpo = await lerCorpo(req);
      if (String(corpo.confirmacao || "").trim().toUpperCase() !== "ZERAR") {
        throw new ErroDeUso('Para apagar tudo, digite ZERAR na confirmação.');
      }
      const antes = contar(db);
      zerar(db);
      return { apagados: Object.values(antes).reduce((a, b) => a + b, 0), antes };
    }
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
  const alerta = situacaoAtual(db).em_alerta;
  console.log(`  ${n} propostas · ${alerta} em alerta de acompanhamento`);
  console.log(`\n  Para parar: Ctrl + C\n`);
  abrirNavegador(endereco);
});

/**
 * Porta ocupada é o erro mais comum do dia a dia: quase sempre é o próprio
 * sistema, já aberto numa janela anterior. Sem isto o Node cospe um stack
 * trace de EADDRINUSE, que não diz o que fazer.
 */
servidor.on("error", (erro) => {
  if (erro.code !== "EADDRINUSE") throw erro;
  console.error(`\n  A porta ${PORTA} já está em uso.`);
  console.error(`  Quase sempre é o próprio sistema, aberto numa janela anterior.\n`);
  console.error(`  Feche a janela antiga (Ctrl + C nela) ou encerre o Node:`);
  console.error(process.platform === "win32"
    ? `      taskkill /F /IM node.exe`
    : `      pkill -f servidor/servidor.js`);
  console.error(`\n  Ou suba numa porta livre:  PORTA=${PORTA + 1} npm start\n`);
  process.exit(1);
});

/** Abre o navegador sozinho. Se não der, o endereço já está impresso acima. */
function abrirNavegador(endereco) {
  if (process.env.SEM_NAVEGADOR) return;
  const comando = process.platform === "darwin" ? "open"
    : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", endereco] : [endereco];
  try {
    const filho = spawn(comando, args, { stdio: "ignore", detached: true });
    // Sem o listener, um "spawn ENOENT" (Linux sem xdg-open) vira 'error' não
    // tratado e DERRUBA o servidor inteiro — o try/catch não pega, porque o
    // erro chega depois, de forma assíncrona.
    filho.on("error", () => {});
    filho.unref();
  } catch { /* sem navegador: o usuário abre na mão */ }
}
