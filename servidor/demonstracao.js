/**
 * DEMONSTRAÇÃO — preenche o sistema com dados fictícios para apresentar.
 *
 *   npm run demo             preenche (recusa se já houver propostas)
 *   npm run demo -- --agora  preenche apagando o que estiver lá
 *
 * Tudo aqui é inventado: empresas, CNPJs, números de proposta e valores. O
 * único jeito de uma apresentação fazer sentido é a tela inteira ter conteúdo,
 * então os dados são espalhados de propósito — pelas oito etapas, pelos meses,
 * pelas cinco ADMs e pelas cinco carteiras. Uma pilha de propostas todas
 * iguais e todas de hoje deixaria metade do sistema em branco.
 *
 * Para desfazer:  npm run zerar -- --agora
 */

import { abrirBanco, fecharBanco, SUPERVISORES_PADRAO } from "./banco.js";
import { criarProposta, criarCorretor, criarUsuario, mudarStatus } from "./api.js";
import { verificar, fecharDiasPassados } from "./acompanhamento.js";
import { zerar, desligarImportacaoAutomatica } from "./zerar.js";
import { hoje } from "./dominio.js";
import { pathToFileURL } from "node:url";

/* Sorteio com semente fixa: a mesma demonstração sai igual toda vez que roda.
   Numa apresentação isso importa — dá para ensaiar a fala em cima dos números
   que vão aparecer na tela. */
let semente = 20260819;
const sorte = () => ((semente = (semente * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const entre = (a, b) => a + Math.floor(sorte() * (b - a + 1));
const um = (lista) => lista[entre(0, lista.length - 1)];

const ADMS = ["LETICIA RAMOS", "AMANDA COSTA", "JULIANA MENDES", "PRISCILA ARAUJO", "BRUNA CARVALHO"];

const CORRETORES = {
  "KALYL SOARES":     ["ANDRE LUIZ MARTINS", "PATRICIA GOMES", "RAFAEL TEIXEIRA", "SIMONE DUARTE", "WESLEY PINTO"],
  "LARISSA LARA":     ["CAMILA FERREIRA", "DIEGO SANTANA", "ELAINE ROCHA", "MARCELO ANDRADE"],
  "LUCAS SOUZA":      ["FERNANDA BARROS", "GUSTAVO NEVES", "HELENA CARDOSO", "IGOR MONTEIRO", "TALITA RIBEIRO"],
  "LUCAS VINICIUS":   ["JOAO PEDRO ALVES", "KARINA LOPES", "LEONARDO CUNHA", "MARIANA PRADO"],
  "KATHELLYN GODOY":  ["NATALIA FREITAS", "OTAVIO BORGES", "RENATA SIQUEIRA", "THIAGO MELO"],
};

const OPERADORAS = ["AMIL", "BRADESCO SAUDE", "SULAMERICA", "HAPVIDA", "PORTO SEGURO", "UNIMED", "NOTREDAME INTERMEDICA"];

const RAMOS = ["COMERCIO", "SERVICOS", "TRANSPORTES", "ENGENHARIA", "ALIMENTOS", "TECNOLOGIA", "CONSTRUCOES",
  "LOGISTICA", "CONSULTORIA", "DISTRIBUIDORA", "INDUSTRIA", "AGROPECUARIA", "CONFECCOES", "MATERIAIS"];
const SOBRENOMES = ["SILVA", "OLIVEIRA", "PEREIRA", "ALMEIDA", "NOGUEIRA", "BATISTA", "MOREIRA", "CAMPOS",
  "AZEVEDO", "PACHECO", "VIEIRA", "SAMPAIO", "FONSECA", "GUIMARAES", "REZENDE", "TAVARES", "BRANDAO", "MACIEL"];
const FORMAS = ["LTDA", "ME", "EIRELI", "S/A", "EPP"];

const PENDENCIAS = [
  ["Documento faltante", "Falta o contrato social atualizado."],
  ["Assinatura pendente", "Aguardando assinatura do representante legal."],
  ["Informação incorreta", "Data de nascimento de dependente divergente."],
  ["Documento da empresa", "Cartão CNPJ vencido, aguardando reenvio."],
  ["Documento de beneficiário", "Falta RG de dois beneficiários."],
  ["Pendência da operadora", "Operadora solicitou declaração de saúde complementar."],
];

const OBSERVACOES = [
  "Cliente pediu retorno por e-mail.", "Grupo com 12 vidas.", "Renovação de contrato anterior.",
  "Corretor acompanha direto com o RH.", "Vigência solicitada para o dia 1º.",
  "Empresa já teve plano com a mesma operadora.", "", "", "",
];

/** CNPJ fictício mas com dígitos verificadores válidos — a máscara e a
    conferência da tela precisam aceitar, senão a demonstração mostra erro. */
function cnpj() {
  const n = Array.from({ length: 8 }, () => entre(0, 9));
  // Ordem da filial: quase toda empresa que aparece numa proposta é matriz
  // (0001). Sortear os quatro dígitos daria CNPJs válidos porém estranhos —
  // e quem vê a tela trabalha com CNPJ o dia inteiro.
  n.push(0, 0, 0, sorte() < 0.9 ? 1 : entre(2, 4));
  for (const pesos of [[5,4,3,2,9,8,7,6,5,4,3,2], [6,5,4,3,2,9,8,7,6,5,4,3,2]]) {
    const soma = pesos.reduce((s, p, i) => s + p * n[i], 0);
    const r = soma % 11;
    n.push(r < 2 ? 0 : 11 - r);
  }
  return n.join("");
}

const empresa = () => `${um(SOBRENOMES)} ${um(RAMOS)} ${um(FORMAS)}`;

/** Data a N dias atrás, em AAAA-MM-DD. */
function diasAtras(n) {
  const d = new Date(`${hoje()}T12:00:00`);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/* Quantas propostas em cada etapa. A forma da pilha é a de uma operação real:
   muita coisa andando no meio, poucas paradas em "nova", e um acumulado de
   implantadas e canceladas que dá corpo aos relatórios e ao histórico de meses. */
const DISTRIBUICAO = [
  ["nova", 6], ["em_analise", 11], ["cotacao", 8], ["enviada", 9],
  ["pendente", 10], ["em_implantacao", 7], ["implantada", 26], ["cancelada", 8],
];

export function preencher(db) {
  // Sempre parte do zero. Preencher por cima do que já existe daria nomes
  // repetidos, carteiras misturadas e contagens que não batem com a fala da
  // apresentação — a proteção contra apagar dado de verdade fica lá embaixo,
  // antes de chegar aqui.
  zerar(db);

  const feito = { supervisores: 0, corretores: 0, usuarios: 0, propostas: 0, verificacoes: 0 };

  for (const nome of ADMS) { criarUsuario(db, { nome }); feito.usuarios++; }
  feito.supervisores = db.prepare("SELECT COUNT(*) n FROM supervisores").get().n;

  for (const [supervisor, nomes] of Object.entries(CORRETORES)) {
    const { id } = db.prepare("SELECT id FROM supervisores WHERE nome = ?").get(supervisor);
    for (const nome of nomes) { criarCorretor(db, { nome, supervisor_id: id }); feito.corretores++; }
  }

  const todosCorretores = Object.values(CORRETORES).flat();
  const criadas = [];

  for (const [status, quantos] of DISTRIBUICAO) {
    for (let i = 0; i < quantos; i++) {
      // Encerradas espalhadas por ~7 meses (alimentam o relatório mensal e a
      // navegação por ano/mês); as em andamento ficam nas últimas semanas,
      // que é onde elas de fato estariam.
      const encerrada = status === "implantada" || status === "cancelada";
      const emissao = diasAtras(encerrada ? entre(20, 210) : entre(0, 45));
      const [tipo, detalhe] = um(PENDENCIAS);

      const p = criarProposta(db, {
        razao_social: empresa(),
        documento: cnpj(),
        numero_proposta: String(entre(100000, 999999)),
        operadora: um(OPERADORAS),
        corretor: um(todosCorretores),
        nome_adm: um(ADMS),
        valor: entre(1400, 46000) + entre(0, 99) / 100,
        data_proposta: emissao,
        data_validade: null,
        observacoes: um(OBSERVACOES),
        emitida_pelo_corretor: sorte() < 0.25,
        status_atual: status,
        pendencia_tipo: status === "pendente" ? tipo : "",
        pendencia_detalhe: status === "pendente" ? detalhe : "",
      }, "demonstração");
      criadas.push(p);
      feito.propostas++;
    }
  }

  // A data de cadastro acompanha a emissão. Sem isto o painel abriria dizendo
  // "85 novas hoje" — o sistema teria nascido inteiro no dia da apresentação.
  const ajusteCriacao = db.prepare("UPDATE propostas SET criado_em = ?, atualizado_em = ? WHERE id = ?");
  for (const p of criadas) {
    const q = `${p.data_proposta} ${String(entre(8, 18)).padStart(2, "0")}:${String(entre(0, 59)).padStart(2, "0")}:00`;
    ajusteCriacao.run(q, q, p.id);
  }

  // Datas de encerramento espalhadas: sem isto toda implantada teria caído
  // hoje, e o gráfico por mês viraria uma barra só.
  const ajusteEncerramento = db.prepare(
    "UPDATE propostas SET implantada_em = CASE WHEN status_atual = 'implantada' THEN ? END," +
    " cancelada_em = CASE WHEN status_atual = 'cancelada' THEN ? END WHERE id = ?",
  );
  for (const p of criadas) {
    if (p.status_atual !== "implantada" && p.status_atual !== "cancelada") continue;
    const d = diasAtras(Math.max(0, Math.round((Date.now() - new Date(`${p.data_proposta}T12:00:00`)) / 86400000) - entre(5, 25)));
    ajusteEncerramento.run(d, d, p.id);
  }

  // Um pouco de história em algumas propostas: sem isso a aba de histórico
  // abre vazia justamente na proposta que a gente for clicar na frente de todo
  // mundo.
  for (const p of criadas.filter((x) => !["nova", "implantada", "cancelada"].includes(x.status_atual)).slice(0, 18)) {
    mudarStatus(db, p.id, { status: p.status_atual, pendencia_detalhe: p.pendencia_detalhe, autor: "demonstração" });
  }

  // Acompanhamento: parte verificada hoje, parte há dias — é essa diferença
  // que faz aparecer "em dia", "atrasada" e "crítica" na tela de acompanhamento.
  const usuarios = db.prepare("SELECT id, nome FROM usuarios WHERE papel = 'adm'").all();
  const emAndamento = criadas.filter((p) => !["implantada", "cancelada"].includes(p.status_atual));
  const marcar = db.prepare("UPDATE verificacoes SET dia = ?, quando = ? WHERE id = (SELECT MAX(id) FROM verificacoes)");
  for (const [pos, p] of emAndamento.entries()) {
    if (pos % 6 === 0) continue;                       // 1 em cada 6 nunca verificada
    // A verificação mais recente é o que decide se a proposta aparece em dia,
    // atrasada ou crítica. Espalhada assim, a tela de acompanhamento mostra os
    // três estados — que é o ponto de ter essa tela.
    const recente = pos % 5 === 0 ? entre(4, 12) : pos % 3 === 0 ? entre(2, 3) : 0;
    // E o rastro dos dias anteriores, porque o relatório da semana e o
    // histórico diário somam dia a dia: sem passado, o período fecha com uma
    // taxa de acompanhamento baixa que não é a da equipe, é a do banco vazio.
    for (let atras = 14; atras >= recente; atras--) {
      if (atras !== recente && sorte() > 0.55) continue;
      const dia = diasAtras(atras);
      verificar(db, p.id, { usuario_id: um(usuarios).id, observacao: "" });
      marcar.run(dia, `${dia} ${String(entre(8, 18)).padStart(2, "0")}:${String(entre(0, 59)).padStart(2, "0")}:00`);
      db.prepare("UPDATE propostas SET ultima_verificacao = ? WHERE id = ?").run(`${dia} 12:00:00`, p.id);
      feito.verificacoes++;
    }
  }

  fecharDiasPassados(db);          // preenche o histórico diário do Master
  desligarImportacaoAutomatica(db);
  return feito;
}

/* Windows: process.argv[1] chega como C:\\Users\\... e `file://` + isso nao bate
   com import.meta.url, que e file:///C:/Users/... . Sem pathToFileURL o script
   roda, nao entra aqui, e termina em silencio sem fazer nada. */
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const agora = process.argv.includes("--agora");
  const db = abrirBanco();
  const jaTem = db.prepare("SELECT COUNT(*) n FROM propostas").get().n;

  if (jaTem && !agora) {
    console.log(`\n  O sistema já tem ${jaTem} proposta(s).`);
    console.log("  Para substituir tudo por dados fictícios:  npm run demo -- --agora\n");
    fecharBanco();
    process.exit(1);
  }

  const feito = preencher(db);
  console.log("\n  Sistema preenchido com dados fictícios:\n");
  for (const [k, v] of Object.entries(feito)) console.log(`    ${String(v).padStart(4)}  ${k}`);
  console.log("\n  Para limpar antes de usar de verdade:  npm run zerar -- --agora\n");
  fecharBanco();
}
