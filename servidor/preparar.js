/**
 * Preparação automática — roda antes do servidor subir.
 *
 * O objetivo é que exista UM comando só (`npm start`). Se o banco ainda está
 * vazio, este módulo procura as planilhas, converte e importa sozinho. Se o
 * banco já tem propostas, não faz nada e o servidor sobe direto.
 *
 * Onde as planilhas são procuradas (nessa ordem):
 *   ./planilhas/  ·  ./  ·  ~/Downloads  ·  ~/Área de Trabalho  ·  ~/Desktop
 *   ~/Documentos  ·  ~/Documents
 *
 * Dá para apontar a pasta na mão:  PLANILHAS=/caminho/da/pasta npm start
 */

import { abrirBanco, bancoFoiRecriado } from "./banco.js";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, "..");
const JSON_PLANILHAS = join(RAIZ, "dados", "planilhas.json");
const SCRIPT_PYTHON = join(RAIZ, "scripts", "planilha_para_json.py");

const log = (texto = "") => console.log(texto);

/** Pastas onde faz sentido procurar as planilhas dos supervisores. */
function pastasCandidatas() {
  if (process.env.PLANILHAS) return [resolve(process.env.PLANILHAS)];
  const casa = homedir();
  return [
    join(RAIZ, "planilhas"),
    RAIZ,
    join(casa, "Downloads"),
    join(casa, "Área de Trabalho"),
    join(casa, "Desktop"),
    join(casa, "Documentos"),
    join(casa, "Documents"),
  ];
}

/** Os .xlsx de uma pasta (sem entrar em subpastas). */
function planilhasDaPasta(pasta) {
  let arquivos;
  try {
    arquivos = readdirSync(pasta);
  } catch {
    return [];
  }
  return arquivos
    .filter((nome) => /\.xlsx$/i.test(nome) && !nome.startsWith("~$"))
    .map((nome) => join(pasta, nome))
    .filter((caminho) => {
      try { return statSync(caminho).isFile(); } catch { return false; }
    });
}

/** Subpastas visíveis de uma pasta (só um nível — não varre o disco inteiro). */
function subpastas(pasta) {
  try {
    return readdirSync(pasta, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => join(pasta, e.name));
  } catch {
    return [];
  }
}

/**
 * Procura as planilhas dos supervisores.
 *
 * Olha primeiro a pasta em si e, se não achar nada, as subpastas dela — na
 * prática as planilhas costumam estar em algo como "Desktop/SISTEMA", e não
 * soltas na Área de Trabalho.
 */
function procurarPlanilhas() {
  for (const pasta of pastasCandidatas()) {
    if (!existsSync(pasta)) continue;

    const aqui = planilhasDaPasta(pasta);
    if (aqui.length) return { pasta, achados: aqui };

    for (const sub of subpastas(pasta)) {
      const dentro = planilhasDaPasta(sub);
      if (dentro.length) return { pasta: sub, achados: dentro };
    }
  }
  return null;
}

/** Qual comando do Python existe nesta máquina. */
function acharPython() {
  for (const cmd of ["python3", "python", "py"]) {
    try {
      execFileSync(cmd, ["--version"], { stdio: "ignore" });
      return cmd;
    } catch { /* tenta o próximo */ }
  }
  return null;
}

function temOpenpyxl(python) {
  try {
    execFileSync(python, ["-c", "import openpyxl"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function instalarOpenpyxl(python) {
  log("  instalando openpyxl (leitor de planilha)…");
  for (const args of [["-m", "pip", "install", "--quiet", "openpyxl"],
                      ["-m", "pip", "install", "--quiet", "--user", "openpyxl"]]) {
    try {
      execFileSync(python, args, { stdio: "ignore" });
      if (temOpenpyxl(python)) return true;
    } catch { /* tenta a próxima forma */ }
  }
  return false;
}

function converterPlanilhas(python, arquivos) {
  log(`  convertendo ${arquivos.length} planilha(s)…`);
  execFileSync(python, [SCRIPT_PYTHON, ...arquivos], { stdio: ["ignore", "ignore", "inherit"] });
}

/**
 * Deixa o sistema pronto para uso. Devolve true se sobrou algo no banco.
 * Nunca derruba o servidor: se faltar planilha ou Python, avisa e segue — dá
 * para usar o sistema vazio e cadastrar as propostas na mão.
 */
export async function prepararSePreciso() {
  const db = abrirBanco();

  // O banco se recria sozinho quando é de uma versão anterior (ver banco.js).
  if (bancoFoiRecriado()) {
    log("\n  O banco era de uma versão anterior do sistema — refazendo a partir das planilhas.");
  }

  const quantas = db.prepare("SELECT COUNT(*) AS n FROM propostas").get().n;
  if (quantas > 0) return true;

  log("\n  Primeira execução — preparando o sistema.");

  // 1. o JSON já existe? então é só importar
  if (!existsSync(JSON_PLANILHAS)) {
    const encontradas = procurarPlanilhas();
    if (!encontradas) {
      log("\n  Não achei nenhuma planilha .xlsx. Procurei em:");
      for (const pasta of pastasCandidatas()) log(`    · ${pasta}${existsSync(pasta) ? "" : "  (não existe)"}`);
      log("\n  (e nas subpastas de cada uma, um nível)");
      log("\n  Copie os arquivos dos supervisores para a pasta \"planilhas\" aqui");
      log("  dentro do projeto e rode de novo — ou aponte a pasta certa:");
      log("      PLANILHAS=/caminho/da/pasta npm start\n");
      log("  O sistema vai subir vazio; dá para cadastrar as propostas na mão.\n");
      return false;
    }

    log(`  planilhas encontradas em: ${encontradas.pasta}`);
    for (const arquivo of encontradas.achados) log(`    · ${arquivo.split(/[/\\]/).pop()}`);

    const python = acharPython();
    if (!python) {
      log("\n  Python não encontrado — é ele que lê os arquivos .xlsx.");
      log("  Instale em https://python.org e rode de novo.\n");
      log("  O sistema vai subir vazio; dá para cadastrar as propostas na mão.\n");
      return false;
    }

    if (!temOpenpyxl(python) && !instalarOpenpyxl(python)) {
      log("\n  Não consegui instalar o openpyxl automaticamente. Rode na mão:");
      log(`      ${python} -m pip install openpyxl\n`);
      return false;
    }

    try {
      converterPlanilhas(python, encontradas.achados);
    } catch (erro) {
      log(`\n  Falha ao ler as planilhas: ${erro.message}\n`);
      return false;
    }
  }

  // 2. importar para o banco
  log("  importando para o banco…");
  const { importar } = await import("./importar.js");
  const r = importar();

  log("");
  log(`  ${r.importadas} propostas importadas · ${r.duplicadas} duplicadas ignoradas`
      + ` · ${r.comAviso} com aviso de validação`);
  for (const [nome, qtd] of Object.entries(r.porSupervisor).sort((a, b) => b[1] - a[1])) {
    log(`    ${nome.padEnd(16)} ${String(qtd).padStart(5)}`);
  }
  log("\n  Relatório completo desta importação: npm run importar:simular\n");

  return r.importadas > 0;
}
