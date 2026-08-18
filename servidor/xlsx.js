/**
 * XLSX mínimo — ler e escrever, sem dependência nenhuma.
 *
 * Um .xlsx é um zip com XML dentro. Node traz o zlib, que é a parte difícil;
 * o resto é montar (e desmontar) o zip na mão. É pouco código porque o escopo
 * é pequeno de propósito: planilhas de texto, uma aba, sem fórmula e sem data.
 * É exatamente o que a carteira de corretores precisa — nome e supervisor.
 *
 * Existir aqui, e não como biblioteca de fora, é escolha do projeto: o sistema
 * roda na máquina da operação, sem npm install.
 */

import { deflateRawSync, inflateRawSync } from "node:zlib";

/* ------------------------------------------------------------------ zip */

let TABELA_CRC = null;
function crc32(buf) {
  if (!TABELA_CRC) {
    TABELA_CRC = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TABELA_CRC[n] = c;
    }
  }
  let c = -1;
  for (const b of buf) c = TABELA_CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** Monta um zip a partir de { "caminho/no/zip": Buffer }. */
function zipar(arquivos) {
  const locais = [];
  const centrais = [];
  let deslocamento = 0;

  for (const [nome, conteudo] of Object.entries(arquivos)) {
    const cru = Buffer.from(conteudo);
    const comprimido = deflateRawSync(cru, { level: 9 });
    const nomeBuf = Buffer.from(nome, "utf8");
    const crc = crc32(cru);

    const local = Buffer.alloc(30 + nomeBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);          // versão necessária
    local.writeUInt16LE(0, 6);           // flags
    local.writeUInt16LE(8, 8);           // método: deflate
    local.writeUInt16LE(0, 10);          // hora
    local.writeUInt16LE(0x21, 12);       // data (1980-01-01)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comprimido.length, 18);
    local.writeUInt32LE(cru.length, 22);
    local.writeUInt16LE(nomeBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nomeBuf.copy(local, 30);
    locais.push(local, comprimido);

    const central = Buffer.alloc(46 + nomeBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comprimido.length, 20);
    central.writeUInt32LE(cru.length, 24);
    central.writeUInt16LE(nomeBuf.length, 28);
    central.writeUInt32LE(0, 38);        // atributos externos
    central.writeUInt32LE(deslocamento, 42);
    nomeBuf.copy(central, 46);
    centrais.push(central);

    deslocamento += local.length + comprimido.length;
  }

  const corpo = Buffer.concat(locais);
  const diretorio = Buffer.concat(centrais);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(centrais.length, 8);
  fim.writeUInt16LE(centrais.length, 10);
  fim.writeUInt32LE(diretorio.length, 12);
  fim.writeUInt32LE(corpo.length, 16);

  return Buffer.concat([corpo, diretorio, fim]);
}

/** Desmonta um zip em { nome: Buffer }, lendo pelo diretório central. */
function desziparz(buf) {
  const fim = acharFimDoDiretorio(buf);
  if (fim < 0) throw new Error("Arquivo não é um .xlsx válido (zip sem índice).");

  const quantos = buf.readUInt16LE(fim + 10);
  let p = buf.readUInt32LE(fim + 16);
  const arquivos = {};

  for (let i = 0; i < quantos; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const metodo = buf.readUInt16LE(p + 10);
    const tamComprimido = buf.readUInt32LE(p + 20);
    const tamNome = buf.readUInt16LE(p + 28);
    const tamExtra = buf.readUInt16LE(p + 30);
    const tamComentario = buf.readUInt16LE(p + 32);
    const inicio = buf.readUInt32LE(p + 42);
    const nome = buf.toString("utf8", p + 46, p + 46 + tamNome);

    // no cabeçalho local os campos de nome e extra têm tamanho próprio
    const nomeLocal = buf.readUInt16LE(inicio + 26);
    const extraLocal = buf.readUInt16LE(inicio + 28);
    const dados = buf.subarray(
      inicio + 30 + nomeLocal + extraLocal,
      inicio + 30 + nomeLocal + extraLocal + tamComprimido,
    );

    arquivos[nome] = metodo === 0 ? Buffer.from(dados) : inflateRawSync(dados);
    p += 46 + tamNome + tamExtra + tamComentario;
  }
  return arquivos;
}

/** O índice fica no fim do arquivo, depois de um comentário de tamanho livre. */
function acharFimDoDiretorio(buf) {
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

/* ------------------------------------------------------------------ xml */

const escaparXml = (t) => String(t ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const desescaparXml = (t) => String(t ?? "")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&amp;/g, "&");

/** "C" -> 2, "AB" -> 27. Coluna vem na referência da célula ("AB12"). */
function indiceDaColuna(ref) {
  const letras = String(ref || "").match(/^[A-Z]+/)?.[0] || "A";
  let n = 0;
  for (const l of letras) n = n * 26 + (l.charCodeAt(0) - 64);
  return n - 1;
}

const letraDaColuna = (i) => {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  }
  return s;
};

/* --------------------------------------------------------------- escrita */

/**
 * Gera um .xlsx de uma aba a partir de linhas de texto. A primeira linha vira
 * cabeçalho em negrito — quem abre entende na hora o que preencher.
 */
export function gerarXlsx(linhas, { aba = "Planilha1", larguras = [] } = {}) {
  const celulas = linhas.map((linha, y) => {
    const cs = linha.map((valor, x) => {
      if (valor === "" || valor === null || valor === undefined) return "";
      const estilo = y === 0 ? ' s="1"' : "";
      return `<c r="${letraDaColuna(x)}${y + 1}" t="inlineStr"${estilo}><is><t xml:space="preserve">${escaparXml(valor)}</t></is></c>`;
    }).join("");
    return `<row r="${y + 1}">${cs}</row>`;
  }).join("");

  const cols = larguras.length
    ? `<cols>${larguras.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
    : "";

  const arquivos = {
    "[Content_Types].xml":
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
      `</Types>`,
    "_rels/.rels":
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
      `</Relationships>`,
    "xl/workbook.xml":
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
      `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<sheets><sheet name="${escaparXml(aba)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels":
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
      `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      `</Relationships>`,
    "xl/styles.xml":
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>` +
      `<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
      `<fills count="1"><fill><patternFill patternType="none"/></fill></fills>` +
      `<borders count="1"><border/></borders>` +
      `<cellStyleXfs count="1"><xf/></cellStyleXfs>` +
      `<cellXfs count="2"><xf xfId="0"/><xf fontId="1" applyFont="1" xfId="0"/></cellXfs>` +
      // sem o estilo "Normal" o Excel e o openpyxl reclamam de planilha sem estilo padrão
      `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
      `</styleSheet>`,
    "xl/worksheets/sheet1.xml":
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `${cols}<sheetData>${celulas}</sheetData></worksheet>`,
  };

  return zipar(arquivos);
}

/* --------------------------------------------------------------- leitura */

/**
 * Lê a primeira aba de um .xlsx e devolve linhas de texto. Célula vazia vira
 * string vazia, e a linha mantém a posição das colunas — senão um campo em
 * branco no meio empurraria os outros para o lado errado.
 */
export function lerXlsx(buffer) {
  const arquivos = desziparz(Buffer.from(buffer));

  const nomeAba = Object.keys(arquivos)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort()[0];
  if (!nomeAba) throw new Error("Não achei nenhuma aba dentro do arquivo.");

  const compartilhadas = arquivos["xl/sharedStrings.xml"]
    ? [...arquivos["xl/sharedStrings.xml"].toString("utf8").matchAll(/<si>([\s\S]*?)<\/si>/g)]
        .map(([, si]) => [...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => desescaparXml(m[1])).join(""))
    : [];

  const xml = arquivos[nomeAba].toString("utf8");
  const linhas = [];

  for (const [, corpo] of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const linha = [];
    for (const [, atributos, dentro] of corpo.matchAll(/<c([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = atributos.match(/r="([A-Z]+\d+)"/)?.[1];
      const tipo = atributos.match(/t="([^"]+)"/)?.[1];
      const bruto = dentro || "";

      let valor = "";
      if (tipo === "s") {
        const i = Number(bruto.match(/<v>([\s\S]*?)<\/v>/)?.[1]);
        valor = compartilhadas[i] ?? "";
      } else if (tipo === "inlineStr") {
        valor = [...bruto.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => desescaparXml(m[1])).join("");
      } else {
        valor = desescaparXml(bruto.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "");
      }

      const coluna = ref ? indiceDaColuna(ref) : linha.length;
      while (linha.length < coluna) linha.push("");
      linha[coluna] = String(valor).trim();
    }
    linhas.push(linha);
  }

  // linhas totalmente vazias no fim são lixo de planilha, não dado
  while (linhas.length && linhas[linhas.length - 1].every((c) => !c)) linhas.pop();
  return linhas;
}
