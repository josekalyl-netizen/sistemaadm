/**
 * Importação das planilhas para o sistema.
 *
 * Lê dados/planilhas.json (gerado por scripts/planilha_para_json.py), valida
 * cada linha, evita duplicidade e grava uma proposta por registro.
 *
 * Uso:
 *   node servidor/importar.js              # importa e mostra o relatório
 *   node servidor/importar.js --simular    # só valida, não grava nada
 *   node servidor/importar.js --recomecar  # apaga tudo antes de importar
 *
 * Regras:
 *  - Cada arquivo é de um supervisor; o supervisor sai do nome do arquivo.
 *  - Abas idênticas em arquivos diferentes são cópias da mesma planilha-modelo:
 *    entram UMA vez, no supervisor "NÃO ATRIBUÍDO", para o admin redistribuir.
 *  - Deduplicação pela chave natural (proposta + documento). Registro repetido
 *    não vira proposta nova.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { abrirBanco, registrarHistorico, supervisorPorNome, usuarioPorNome } from "./banco.js";
import {
  chaveNatural, etapa, etapaDaSituacao, formatarDocumento, hoje, lerData,
  lerValor, normalizar, separarCorretor, somenteDigitos, texto, validarDocumento,
} from "./dominio.js";

const AQUI = dirname(fileURLToPath(import.meta.url));
const ARQUIVO_PLANILHAS = join(AQUI, "..", "dados", "planilhas.json");

export const SUPERVISOR_SEM_DONO = "NÃO ATRIBUÍDO";

/** Texto que alimenta a busca global de uma proposta. */
export function textoDeBusca(p) {
  return normalizar([
    p.razao_social, p.numero_proposta, p.corretor, p.operadora, p.responsavel,
    p.documento, p.documento_exibido, formatarDocumento(p.documento),
  ].filter(Boolean).join(" "));
}

/** Converte uma linha crua da planilha na proposta que vai para o banco. */
export function linhaParaProposta(linha, contexto) {
  const { corretor, valorEmbutido } = separarCorretor(linha.corretor);
  const situacao = texto(linha.situacao);
  const { codigo: status, reconhecida } = etapaDaSituacao(situacao);

  const proposta = {
    razao_social: texto(linha.estipulante),
    documento: somenteDigitos(linha.documento),
    documento_exibido: formatarDocumento(linha.documento) || texto(linha.documento),
    numero_proposta: texto(linha.proposta),
    operadora: texto(linha.operadora).toUpperCase(),
    corretor: texto(corretor).toUpperCase(),
    valor: lerValor(linha.valor) ?? valorEmbutido,
    data_proposta: lerData(linha.emissao) || dataDoMes(contexto.mes, contexto.ano),
    data_validade: lerData(linha.validade),
    cadastrado: texto(linha.cadastrado).toUpperCase(),
    observacoes: texto(linha.observacoes),
    status_atual: status,
    pendencia_tipo: "",
    pendencia_detalhe: "",
    situacao_origem: situacao,
    responsavel: texto(linha.responsavel).toUpperCase(),
    implantada_em: status === "implantada" ? lerData(linha.emissao) : null,

    // A proposta entrou na operação na data de emissão, não no dia em que a
    // planilha foi importada — senão o histórico diário começaria com 2 mil
    // "propostas novas hoje".
    criado_em: `${lerData(linha.emissao) || dataDoMes(contexto.mes, contexto.ano) || contexto.hojeData} 00:00:00`,

    // A importação é o marco zero do acompanhamento: a partir de hoje é que
    // passa a contar quem verificou e quem deixou de verificar. Sem isso, os
    // 865 processos abertos nasceriam todos como "crítica" no primeiro dia.
    ultima_verificacao: contexto.importadoEm,
    origem_arquivo: contexto.arquivo,
    origem_aba: contexto.aba,
  };

  proposta.chave_natural = chaveNatural({
    proposta: proposta.numero_proposta,
    documento: proposta.documento,
    estipulante: proposta.razao_social,
  });
  proposta.busca = textoDeBusca(proposta);

  return { proposta, situacaoReconhecida: reconhecida };
}

/** Data-âncora quando a planilha não trouxe emissão: dia 1º do mês da aba. */
function dataDoMes(mes, ano) {
  if (!mes) return null;
  return `${ano}-${String(mes).padStart(2, "0")}-01`;
}

/** Confere a linha e devolve os avisos encontrados (nada é descartado por isso). */
function validarLinha(proposta, situacaoReconhecida) {
  const avisos = [];
  if (!proposta.razao_social) avisos.push("sem nome da estipulante");
  const doc = validarDocumento(proposta.documento_exibido || proposta.documento);
  if (!doc.valido) avisos.push(`documento inválido: ${doc.motivo}`);
  if (!proposta.numero_proposta) avisos.push("sem número de proposta");
  if (!proposta.operadora) avisos.push("sem operadora");
  if (!proposta.corretor) avisos.push("sem corretor");
  if (!proposta.situacao_origem) avisos.push("sem situação na planilha");
  else if (!situacaoReconhecida) avisos.push(`situação não reconhecida: "${proposta.situacao_origem}"`);
  if (!proposta.data_proposta) avisos.push("sem data");
  if (proposta.valor === null && proposta.status_atual !== "cancelada") avisos.push("sem valor");
  return avisos;
}

const CAMPOS = [
  "supervisor_id", "usuario_id", "responsavel", "razao_social", "documento", "documento_exibido",
  "numero_proposta", "operadora", "corretor", "valor", "data_proposta",
  "data_validade", "cadastrado", "observacoes", "status_atual", "pendencia_tipo",
  "pendencia_detalhe", "implantada_em", "situacao_origem", "origem_arquivo",
  "origem_aba", "chave_natural", "busca", "criado_em", "ultima_verificacao",
];

export function inserirProposta(db, proposta) {
  const sql = `INSERT INTO propostas (${CAMPOS.join(", ")})
               VALUES (${CAMPOS.map(() => "?").join(", ")})`;
  return Number(db.prepare(sql).run(...CAMPOS.map((c) => proposta[c] ?? null)).lastInsertRowid);
}

/**
 * Ordena as abas antes de importar: primeiro as que pertencem de fato a um
 * supervisor, depois as compartilhadas. Assim, quando um registro aparece nos
 * dois lugares, ele fica com o supervisor real e a cópia é descartada.
 */
function abasNaOrdemDeImportacao(arquivos) {
  const lista = [];
  for (const arq of arquivos) {
    for (const aba of arq.abas) {
      lista.push({
        supervisor: aba.compartilhada ? SUPERVISOR_SEM_DONO : arq.supervisor,
        arquivo: arq.arquivo,
        ...aba,
      });
    }
  }
  // compartilhadas por último; cada hash compartilhado entra uma única vez
  const vistas = new Set();
  return lista
    .sort((a, b) => Number(a.compartilhada) - Number(b.compartilhada))
    .filter((aba) => {
      if (!aba.compartilhada) return true;
      if (vistas.has(aba.hash)) return false;
      vistas.add(aba.hash);
      return true;
    });
}

export function importar({ simular = false, recomecar = false, ano = 2026, caminho = ARQUIVO_PLANILHAS } = {}) {
  const db = abrirBanco();
  const bruto = JSON.parse(readFileSync(caminho, "utf8"));

  if (recomecar && !simular) {
    db.exec("DELETE FROM historico; DELETE FROM propostas;");
  }

  const relatorio = {
    lidas: 0,
    importadas: 0,
    duplicadas: 0,
    comAviso: 0,
    avisos: {},          // motivo -> quantidade
    porSupervisor: {},   // supervisor -> quantidade
    porEtapa: {},        // etapa -> quantidade
    semResponsavel: 0,
    abasCompartilhadas: [],
    exemplosDuplicados: [],
  };

  // chaves já existentes no banco (importações repetidas não duplicam nada)
  const jaNoBanco = new Set(
    db.prepare("SELECT chave_natural FROM propostas WHERE chave_natural <> ''")
      .all().map((r) => r.chave_natural),
  );

  const abas = abasNaOrdemDeImportacao(bruto.arquivos);
  const importadoEm = new Date().toISOString().slice(0, 19).replace("T", " ");

  if (!simular) db.exec("BEGIN");
  try {
    for (const aba of abas) {
      const antesDaAba = relatorio.importadas;
      const supervisor = simular ? null : supervisorPorNome(db, aba.supervisor);

      for (const linha of aba.registros) {
        relatorio.lidas += 1;
        const contexto = {
          arquivo: aba.arquivo, aba: aba.aba, mes: aba.mes, ano,
          hojeData: hoje(), importadoEm,
        };
        const { proposta, situacaoReconhecida } = linhaParaProposta(linha, contexto);

        const avisos = validarLinha(proposta, situacaoReconhecida);
        if (avisos.length) {
          relatorio.comAviso += 1;
          for (const a of avisos) {
            const motivo = a.replace(/: ".*"$/, ": (valor)");
            relatorio.avisos[motivo] = (relatorio.avisos[motivo] || 0) + 1;
          }
        }

        // sem nome da empresa a linha não é uma proposta — é lixo de planilha
        if (!proposta.razao_social) continue;

        if (jaNoBanco.has(proposta.chave_natural)) {
          relatorio.duplicadas += 1;
          if (relatorio.exemplosDuplicados.length < 5) {
            relatorio.exemplosDuplicados.push(
              `${proposta.razao_social} · proposta ${proposta.numero_proposta} (${aba.aba})`,
            );
          }
          continue;
        }
        jaNoBanco.add(proposta.chave_natural);

        if (!simular) {
          proposta.supervisor_id = supervisor.id;
          // A coluna RESPONSÁVEL da planilha é justamente a ADM que acompanha:
          // cada nome vira um usuário, e a proposta já nasce vinculada a ela.
          proposta.usuario_id = usuarioPorNome(db, proposta.responsavel)?.id ?? null;
          const id = inserirProposta(db, proposta);
          registrarHistorico(db, id, {
            tipo: "importacao",
            para: proposta.status_atual,
            descricao: `Importada da planilha ${aba.arquivo} · aba ${aba.aba}`
              + (proposta.situacao_origem ? ` · situação de origem: ${proposta.situacao_origem}` : ""),
            autor: "importação",
          });

          // Marco zero do acompanhamento. Sem esta linha, o primeiro dia do
          // histórico apareceria com a carteira inteira "não acompanhada" —
          // uma acusação falsa contra a equipe por um dia em que o sistema
          // sequer existia. A observação deixa claro que veio da importação.
          if (etapa(proposta.status_atual)?.prazo) {
            db.prepare(`
              INSERT INTO verificacoes (proposta_id, usuario_id, dia, quando, etapa, observacao)
              VALUES (?, ?, ?, ?, ?, ?)
            `).run(id, proposta.usuario_id ?? null, importadoEm.slice(0, 10), importadoEm,
                   proposta.status_atual, "marco inicial — importação da planilha");
          }
        }

        relatorio.importadas += 1;
        relatorio.porSupervisor[aba.supervisor] = (relatorio.porSupervisor[aba.supervisor] || 0) + 1;
        relatorio.porEtapa[proposta.status_atual] = (relatorio.porEtapa[proposta.status_atual] || 0) + 1;
        if (!proposta.responsavel) relatorio.semResponsavel += 1;
      }

      if (aba.compartilhada) {
        const novas = relatorio.importadas - antesDaAba;
        relatorio.abasCompartilhadas.push(
          `${aba.aba}: ${aba.registros.length} linhas · ${novas} novas · `
          + `${aba.registros.length - novas} já existiam em outro supervisor`,
        );
      }
    }
    if (!simular) db.exec("COMMIT");
  } catch (erro) {
    if (!simular) db.exec("ROLLBACK");
    throw erro;
  }

  return relatorio;
}

function imprimirRelatorio(r, simulacao) {
  const linha = (t = "") => console.log(t);
  linha();
  linha(simulacao ? "SIMULAÇÃO — nada foi gravado" : "IMPORTAÇÃO CONCLUÍDA");
  linha("─".repeat(58));
  linha(`  linhas lidas .......... ${r.lidas}`);
  linha(`  propostas importadas .. ${r.importadas}`);
  linha(`  duplicadas ignoradas .. ${r.duplicadas}`);
  linha(`  linhas com aviso ...... ${r.comAviso}`);
  linha(`  sem ADM responsável ... ${r.semResponsavel}`);

  linha();
  linha("  Por supervisor");
  for (const [nome, qtd] of Object.entries(r.porSupervisor).sort((a, b) => b[1] - a[1])) {
    linha(`    ${nome.padEnd(18)} ${String(qtd).padStart(5)}`);
  }

  linha();
  linha("  Por etapa");
  for (const [codigo, qtd] of Object.entries(r.porEtapa).sort((a, b) => b[1] - a[1])) {
    linha(`    ${(etapa(codigo)?.nome || codigo).padEnd(18)} ${String(qtd).padStart(5)}`);
  }

  if (Object.keys(r.avisos).length) {
    linha();
    linha("  Avisos de validação (o registro entrou mesmo assim)");
    for (const [motivo, qtd] of Object.entries(r.avisos).sort((a, b) => b[1] - a[1])) {
      linha(`    ${String(qtd).padStart(5)}  ${motivo}`);
    }
  }

  if (r.abasCompartilhadas.length) {
    linha();
    linha(`  Abas iguais em mais de um arquivo (o que sobrar vai para "${SUPERVISOR_SEM_DONO}")`);
    for (const a of r.abasCompartilhadas) linha(`    ${a}`);
  }

  if (r.exemplosDuplicados.length) {
    linha();
    linha("  Exemplos de duplicidade evitada");
    for (const d of r.exemplosDuplicados) linha(`    ${d}`);
  }
  linha();
}

// executado direto pela linha de comando
if (process.argv[1] && process.argv[1].endsWith("importar.js")) {
  const simular = process.argv.includes("--simular");
  const recomecar = process.argv.includes("--recomecar");
  imprimirRelatorio(importar({ simular, recomecar }), simular);
}
