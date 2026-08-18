/**
 * ZERAR — deixa o sistema em branco, mantendo a estrutura.
 *
 * Apaga TODOS os registros: propostas, histórico, verificações, fechamentos de
 * dia, uso de mensagens, corretores, supervisores e usuários. As tabelas, os
 * índices e as regras continuam exatamente como estão — o que sai é o conteúdo.
 *
 *   npm run zerar              mostra o que seria apagado, sem apagar
 *   npm run zerar -- --agora   apaga de verdade
 *
 * Depois de zerar, o sistema NÃO reimporta as planilhas sozinho. Sem isso, o
 * banco vazio seria confundido com uma primeira execução e a próxima subida
 * traria tudo de volta — justamente o contrário do que se pediu. Para religar
 * a importação automática:  npm run zerar -- --religar-importacao
 */

import { abrirBanco, fecharBanco } from "./banco.js";

/* A ordem importa: filhos antes dos pais, senão a chave estrangeira barra. */
const TABELAS = [
  "mensagens_uso",
  "dia_resumo",
  "verificacoes",
  "historico",
  "propostas",
  "corretores",
  "usuarios",
  "supervisores",
];

const log = (t = "") => console.log(t);

export function contar(db) {
  const linhas = {};
  for (const t of TABELAS) linhas[t] = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
  return linhas;
}

/**
 * As tabelas usam `INTEGER PRIMARY KEY` puro (sem AUTOINCREMENT), então o
 * próximo id volta a ser 1 assim que a última linha sai — o sistema fica
 * mesmo novo, sem precisar mexer em sqlite_sequence.
 */
export function zerar(db) {
  db.exec("PRAGMA foreign_keys = OFF");
  for (const t of TABELAS) db.exec(`DELETE FROM ${t}`);
  db.exec("PRAGMA foreign_keys = ON");
  desligarImportacaoAutomatica(db);
  db.exec("VACUUM");
}

export function desligarImportacaoAutomatica(db) {
  db.prepare("INSERT OR REPLACE INTO configuracao (chave, valor) VALUES ('importacao_automatica', 'nao')").run();
}

export function religarImportacaoAutomatica(db) {
  db.prepare("DELETE FROM configuracao WHERE chave = 'importacao_automatica'").run();
}

/** A preparação consulta isto antes de sair procurando planilha. */
export function importacaoAutomaticaLigada(db) {
  const linha = db.prepare("SELECT valor FROM configuracao WHERE chave = 'importacao_automatica'").get();
  return !linha || linha.valor !== "nao";
}

function principal() {
  const db = abrirBanco();
  const argumentos = process.argv.slice(2);

  if (argumentos.includes("--religar-importacao")) {
    religarImportacaoAutomatica(db);
    log("\n  Importação automática religada: a próxima subida com o banco vazio");
    log("  volta a procurar as planilhas.\n");
    fecharBanco();
    return;
  }

  const antes = contar(db);
  const total = Object.values(antes).reduce((a, b) => a + b, 0);

  log("\n  O que existe hoje no banco:\n");
  for (const [tabela, n] of Object.entries(antes)) {
    log(`    ${tabela.padEnd(16)} ${String(n).padStart(7)}`);
  }

  if (!argumentos.includes("--agora")) {
    log("\n  Nada foi apagado — isto foi só a conferência.");
    if (total > 0) {
      log("  Para apagar de verdade:  npm run zerar -- --agora");
      log("\n  Não tem como desfazer. Se quiser guardar o que existe hoje, copie");
      log("  o arquivo dados/sistema.db antes.\n");
    } else {
      log("  O sistema já está vazio.\n");
    }
    fecharBanco();
    return;
  }

  zerar(db);

  const depois = contar(db);
  const sobrou = Object.values(depois).reduce((a, b) => a + b, 0);

  log(`\n  ${total} registros apagados. Restam ${sobrou}.`);
  log("  A estrutura do sistema continua igual — só o conteúdo saiu.");
  log("\n  A importação automática das planilhas ficou desligada, para o banco");
  log("  vazio não ser confundido com primeira execução. Para religar:");
  log("      npm run zerar -- --religar-importacao\n");
  log("  Agora suba o sistema e cadastre os corretores e usuários pela Área");
  log("  Master:  npm start\n");

  fecharBanco();
}

if (import.meta.url === `file://${process.argv[1]}`) principal();
