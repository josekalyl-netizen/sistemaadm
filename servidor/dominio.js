/**
 * Domínio da operação: as etapas e as regras derivadas.
 *
 * Regra central do sistema: uma proposta tem UM status_atual. É ele — e só ele
 * — que decide em que etapa a proposta aparece. Não existe cópia de registro
 * entre etapas; a interface filtra pelo status.
 *
 * Os campos são exatamente os da planilha da operação:
 *   estipulante · CNPJ/CPF · proposta · operadora · situação · validade ·
 *   corretor · valor · responsável · emissão · cadastrado · observações
 * mais o supervisor (que vem do arquivo) e a pendência (quando é o caso).
 */

/**
 * As 8 etapas do processo, na sequência operacional.
 *
 * Cada etapa tem UMA cor, e é ela que tinge o card na lista. Os tons são
 * fracos de propósito: a tela mostra centenas de cards e cor forte cansa a
 * vista. `cor` é o traço e o rótulo; o fundo usa a mesma cor com pouca
 * opacidade — ver `--cor` em web/css/sistema.css.
 *
 * `prazo` é de quantos em quantos dias a proposta precisa ser verificada pela
 * ADM responsável. Etapas encerradas (implantada, cancelada) têm prazo null:
 * saem da fila de acompanhamento.
 */
export const ETAPAS = [
  { codigo: "nova",           nome: "Nova",             ordem: 1, cor: "#9AA7BC", prazo: 1, descricao: "Propostas recém cadastradas." },
  { codigo: "em_analise",     nome: "Em análise",       ordem: 2, cor: "#E8877D", prazo: 1, descricao: "Propostas sendo trabalhadas pelo operacional." },
  { codigo: "cotacao",        nome: "Cotação",          ordem: 3, cor: "#7FC6D9", prazo: 1, descricao: "Propostas em processo de cotação." },
  { codigo: "enviada",        nome: "Proposta enviada", ordem: 4, cor: "#A79BD4", prazo: 1, descricao: "Propostas já enviadas ao cliente." },
  { codigo: "pendente",       nome: "Pendente",         ordem: 5, cor: "#E3C46A", prazo: 1, descricao: "Propostas que possuem alguma pendência." },
  { codigo: "em_implantacao", nome: "Em implantação",   ordem: 6, cor: "#D8A97E", prazo: 1, descricao: "Propostas que já avançaram para implantação." },
  { codigo: "implantada",     nome: "Implantada",       ordem: 7, cor: "#84C5A3", prazo: null, descricao: "Propostas cuja implantação foi concluída." },
  { codigo: "cancelada",      nome: "Cancelada",        ordem: 8, cor: "#C96F6F", prazo: null, descricao: "Processos encerrados sem implantação." },
];

export const CODIGOS_ETAPA = ETAPAS.map((e) => e.codigo);

export function etapa(codigo) {
  return ETAPAS.find((e) => e.codigo === codigo) || null;
}

/**
 * Tradução das SITUAÇÕES escritas na planilha para as etapas do sistema.
 * A situação original nunca é descartada: fica gravada em `situacao_origem`,
 * para a operação conseguir conferir de onde o registro veio.
 */
export const MAPA_SITUACAO_PLANILHA = {
  "AGUARDANDO ANALISE":     "em_analise",
  "AGUARDANDO ANALISES":    "em_analise",
  "AGUARDANDO RETORNO":     "pendente",
  "AGUARDANDO ASSINATURA":  "enviada",
  "AGUARDANDO PAGAMENTO":   "em_implantacao",
  "AGUARDANDO VIGENCIA":    "em_implantacao",
  "PAGAMENTO":              "em_implantacao",
  "CONTRATO":               "implantada",
  "IMPLANTADA":             "implantada",
  "IMPLANTADO":             "implantada",
  "PENDENTE":               "pendente",
  "DEVOLVIDA":              "pendente",
  "DEVOLVIDO":              "pendente",
  "CANCELADA":              "cancelada",
  "CANCELADO":              "cancelada",
  "DECLINADA":              "cancelada",
  "DECLINADO":              "cancelada",
  "EXPIRADA":               "cancelada",
  "EXPIRADO":               "cancelada",
  "DESISTENCIA":            "cancelada",
  "CLIENTE DESISTIU":       "cancelada",
};

/** Tipos de pendência oferecidos quando a proposta entra em "Pendente". */
export const TIPOS_PENDENCIA = [
  "Documento faltante",
  "Assinatura pendente",
  "Informação incorreta",
  "Documento da empresa",
  "Documento de beneficiário",
  "Pendência da operadora",
];

// ---------------------------------------------------------------- utilidades

/**
 * Marcação de caixa de seleção, venha de onde vier: o formulário manda `true`,
 * o JSON pode mandar "1", "sim" ou "on". Qualquer outra coisa é "não marcado" —
 * inclusive string vazia e null.
 */
export function verdadeiro(valor) {
  if (valor === true || valor === 1) return true;
  const t = String(valor ?? "").trim().toLowerCase();
  return t === "1" || t === "true" || t === "sim" || t === "on";
}

export function texto(valor) {
  return String(valor ?? "").replace(/\s+/g, " ").trim();
}

export function somenteDigitos(valor) {
  return texto(valor).replace(/\D/g, "");
}

/** Remove acento e caixa — usado na busca e nas comparações de deduplicação. */
export function normalizar(valor) {
  return texto(valor)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
}

/** CNPJ 00.000.000/0000-00 · CPF 000.000.000-00 · o resto sai como veio. */
export function formatarDocumento(valor) {
  const d = somenteDigitos(valor);
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return texto(valor);
}

/**
 * Valida o documento. A planilha tem muito CNPJ digitado errado (dígito a
 * menos, barra trocada) — por isso a importação avisa, mas não descarta.
 */
export function validarDocumento(valor) {
  const d = somenteDigitos(valor);
  if (!d) return { valido: false, tipo: null, motivo: "documento vazio" };
  if (d.length === 14) {
    const ok = validarCNPJ(d);
    return { valido: ok, tipo: "cnpj", motivo: ok ? null : "dígito verificador do CNPJ não confere" };
  }
  if (d.length === 11) {
    const ok = validarCPF(d);
    return { valido: ok, tipo: "cpf", motivo: ok ? null : "dígito verificador do CPF não confere" };
  }
  return { valido: false, tipo: null, motivo: `${d.length} dígitos (não é CPF nem CNPJ)` };
}

function validarCNPJ(d) {
  if (/^(\d)\1{13}$/.test(d)) return false;
  const calc = (ate) => {
    const pesos = ate === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2];
    const soma = pesos.reduce((acc, p, i) => acc + p * Number(d[i]), 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

function validarCPF(d) {
  if (/^(\d)\1{10}$/.test(d)) return false;
  const calc = (ate) => {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(d[i]) * (ate + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

/**
 * Lê valores monetários como aparecem na planilha: "1.234,56", "1234.56",
 * "R$ 2.397,06". Devolve número ou null.
 */
export function lerValor(bruto) {
  let s = texto(bruto).replace(/R\$/gi, "").trim();
  if (!s) return null;
  s = s.replace(/[^\d.,-]/g, "");
  if (!s) return null;
  const temVirgula = s.includes(",");
  const temPonto = s.includes(".");
  if (temVirgula && temPonto) {
    // "1.234,56" -> ponto é milhar; "1,234.56" -> vírgula é milhar
    s = s.lastIndexOf(",") > s.lastIndexOf(".")
      ? s.replace(/\./g, "").replace(",", ".")
      : s.replace(/,/g, "");
  } else if (temVirgula) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Lê datas em qualquer formato que aparece na planilha: "2026-07-06",
 * "06/07/2026" e até "06/07/2026 // 23/07/2026" (retransmissão — fica a 1ª).
 * Devolve "AAAA-MM-DD" ou null.
 */
export function lerData(bruto) {
  const s = texto(bruto);
  if (!s) return null;
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (br) {
    const [, d, m, a] = br;
    const ano = a.length === 2 ? `20${a}` : a;
    return `${ano}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

/**
 * O campo CORRETOR da planilha às vezes carrega o valor junto:
 * "GUILHERME AUGUSTO R$ 485,45" ou "MARISTELA R$ 28.046,03".
 * Separa o nome do corretor do valor embutido.
 */
export function separarCorretor(bruto) {
  const s = texto(bruto);
  if (!s) return { corretor: "", valorEmbutido: null };
  const m = s.match(/(.*?)\s*(?:R\$\s*)?((?:\d{1,3}(?:\.\d{3})*|\d+)(?:,\d{2}))\s*$/);
  if (m && m[1].trim()) {
    return { corretor: texto(m[1]), valorEmbutido: lerValor(m[2]) };
  }
  return { corretor: s, valorEmbutido: null };
}

/** Etapa a partir da SITUAÇÃO escrita na planilha. Desconhecido -> "nova". */
export function etapaDaSituacao(situacao) {
  const chave = normalizar(situacao);
  if (!chave) return { codigo: "nova", reconhecida: false };
  const codigo = MAPA_SITUACAO_PLANILHA[chave];
  if (codigo) return { codigo, reconhecida: true };
  // tolerância a variações de digitação ("IMPLANTADA ", "AGUARDANDO  ANÁLISE")
  const parcial = Object.keys(MAPA_SITUACAO_PLANILHA).find(
    (k) => chave.startsWith(k) || k.startsWith(chave),
  );
  if (parcial) return { codigo: MAPA_SITUACAO_PLANILHA[parcial], reconhecida: true };
  return { codigo: "nova", reconhecida: false };
}

/**
 * Chave natural de uma proposta — é o que evita duplicidade na importação.
 * Números de proposta "0000-0" / "000000-0" não identificam nada, então nesses
 * casos a chave cai para documento + nome da empresa.
 */
export function chaveNatural({ proposta, documento, estipulante }) {
  const num = somenteDigitos(proposta);
  const doc = somenteDigitos(documento);
  const nome = normalizar(estipulante).slice(0, 40);
  const propostaInutil = !num || /^0+$/.test(num);
  return propostaInutil ? `N|${doc}|${nome}` : `P|${num}|${doc}`;
}

// ------------------------------------------------- acompanhamento diário

/**
 * Níveis de acompanhamento. A diferença entre "não acompanhou hoje" e "está
 * atrasada" é o que permite o Master separar pendência operacional (normal,
 * acontece todo dia) de problema real.
 *
 * `dias` é o número de dias corridos desde a última verificação — ou desde o
 * cadastro, quando a proposta nunca foi verificada.
 */
export const NIVEIS = [
  { codigo: "acompanhando", nome: "Acompanhando", sinal: "🟢", cor: "#84C5A3", desde: 0, ate: 0 },
  { codigo: "pendente",     nome: "Pendente",     sinal: "🟡", cor: "#E3C46A", desde: 1, ate: 1 },
  { codigo: "atrasada",     nome: "Atrasada",     sinal: "🔴", cor: "#D8834E", desde: 2, ate: 4 },
  { codigo: "critica",      nome: "Crítica",      sinal: "🔴", cor: "#C0392B", desde: 5, ate: Infinity },
  { codigo: "encerrada",    nome: "Encerrada",    sinal: "⚪", cor: "#9AA7BC", desde: null, ate: null },
];

export const NIVEIS_EM_ALERTA = ["atrasada", "critica"];

export function nivel(codigo) {
  return NIVEIS.find((n) => n.codigo === codigo) || null;
}

/**
 * Nível de acompanhamento de uma proposta.
 * Etapas encerradas (implantada, cancelada) não exigem acompanhamento.
 */
export function nivelAcompanhamento({ status_atual, dias_sem_verificar }) {
  if (!etapa(status_atual)?.prazo) return "encerrada";
  const dias = Number(dias_sem_verificar);
  if (!Number.isFinite(dias)) return "critica";
  if (dias <= 0) return "acompanhando";
  if (dias === 1) return "pendente";
  if (dias <= 4) return "atrasada";
  return "critica";
}

/** "AAAA-MM-DD" de hoje, no fuso local da máquina (não em UTC). */
export function hoje() {
  const agora = new Date();
  const local = new Date(agora.getTime() - agora.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

/** Diferença em dias corridos entre duas datas "AAAA-MM-DD". */
export function diasEntre(de, ate) {
  if (!de || !ate) return null;
  const ms = Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`);
  return Math.round(ms / 86400000);
}
