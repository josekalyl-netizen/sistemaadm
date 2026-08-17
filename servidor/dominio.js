/**
 * Domínio da operação: as etapas, o mapeamento vindo da planilha e as regras
 * derivadas (faixa etária, normalização de documento, busca).
 *
 * Regra central do sistema: uma proposta tem UM status_atual. É ele — e só ele
 * — que decide em que etapa a proposta aparece. Não existe cópia de registro
 * entre etapas; a interface filtra pelo status.
 */

/**
 * As 8 etapas do processo, na sequência operacional. A ordem é a do fluxo.
 *
 * Cada etapa tem UMA cor, e é ela que tinge o card na lista. Os tons são
 * fracos de propósito (pastel): a tela mostra centenas de cards e cor forte
 * cansa a vista. `cor` é o traço/rótulo; o fundo do card usa a mesma cor com
 * pouca opacidade — ver `--etapa-cor` em web/css/sistema.css.
 */
export const ETAPAS = [
  { codigo: "nova",           nome: "Nova",             ordem: 1, grupo: "aberta",    cor: "#9AA7BC", descricao: "Propostas recém cadastradas." },
  { codigo: "em_analise",     nome: "Em análise",       ordem: 2, grupo: "aberta",    cor: "#E8877D", descricao: "Propostas sendo trabalhadas pelo operacional." },
  { codigo: "cotacao",        nome: "Cotação",          ordem: 3, grupo: "aberta",    cor: "#7FC6D9", descricao: "Propostas em processo de cotação." },
  { codigo: "enviada",        nome: "Proposta enviada", ordem: 4, grupo: "aberta",    cor: "#A79BD4", descricao: "Propostas já enviadas ao cliente." },
  { codigo: "pendente",       nome: "Pendente",         ordem: 5, grupo: "atencao",   cor: "#E3C46A", descricao: "Propostas que possuem alguma pendência." },
  { codigo: "em_implantacao", nome: "Em implantação",   ordem: 6, grupo: "andamento", cor: "#D8A97E", descricao: "Propostas que já avançaram para implantação." },
  { codigo: "implantada",     nome: "Implantada",       ordem: 7, grupo: "concluida", cor: "#84C5A3", descricao: "Propostas cuja implantação foi concluída." },
  { codigo: "cancelada",      nome: "Cancelada",        ordem: 8, grupo: "encerrada", cor: "#C96F6F", descricao: "Processos encerrados sem implantação." },
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

/** Faixas etárias usadas pela operação (as mesmas da tabela de preço). */
export const FAIXAS_ETARIAS = [
  { codigo: "00-18", rotulo: "00 a 18", min: 0,  max: 18 },
  { codigo: "19-23", rotulo: "19 a 23", min: 19, max: 23 },
  { codigo: "24-28", rotulo: "24 a 28", min: 24, max: 28 },
  { codigo: "29-33", rotulo: "29 a 33", min: 29, max: 33 },
  { codigo: "34-38", rotulo: "34 a 38", min: 34, max: 38 },
  { codigo: "39-43", rotulo: "39 a 43", min: 39, max: 43 },
  { codigo: "44-48", rotulo: "44 a 48", min: 44, max: 48 },
  { codigo: "49-53", rotulo: "49 a 53", min: 49, max: 53 },
  { codigo: "54-58", rotulo: "54 a 58", min: 54, max: 58 },
  { codigo: "59+",   rotulo: "59 ou +", min: 59, max: 200 },
];

export function faixaEtaria(idade) {
  const n = Number(idade);
  if (!Number.isFinite(n) || n < 0) return null;
  const faixa = FAIXAS_ETARIAS.find((f) => n >= f.min && n <= f.max);
  return faixa ? faixa.codigo : null;
}

/** Tipos de proposta. PF/PME/adesão é a divisão que a operação já usa. */
export const TIPOS_PROPOSTA = [
  { codigo: "pf",       nome: "Pessoa Física" },
  { codigo: "pme",      nome: "PME / Empresarial" },
  { codigo: "adesao",   nome: "Coletivo por adesão" },
  { codigo: "odonto",   nome: "Odontológico" },
  { codigo: "outro",    nome: "Outro" },
];

/** Deduz o tipo pelo documento e pelo nome da operadora (planilha não tem campo). */
export function deduzirTipo(documento, operadora = "") {
  const op = texto(operadora).toUpperCase();
  if (op.includes("ODONTO") || op.includes("DENTAL")) return "odonto";
  if (op.includes("QUALICORP") || op.includes("ADESAO")) return "adesao";
  const digitos = somenteDigitos(documento);
  if (digitos.length === 14) return "pme";
  if (digitos.length === 11) return "pf";
  return "outro";
}

// ---------------------------------------------------------------- utilidades

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
  if (d.length === 14) return { valido: validarCNPJ(d), tipo: "cnpj", motivo: validarCNPJ(d) ? null : "dígito verificador do CNPJ não confere" };
  if (d.length === 11) return { valido: validarCPF(d), tipo: "cpf", motivo: validarCPF(d) ? null : "dígito verificador do CPF não confere" };
  return { valido: false, tipo: null, motivo: `${d.length} dígitos (não é CPF nem CNPJ)` };
}

function validarCNPJ(d) {
  if (/^(\d)\1{13}$/.test(d)) return false;
  const calc = (fatiar) => {
    const pesos = fatiar === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2];
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
