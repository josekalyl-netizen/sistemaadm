#!/usr/bin/env python3
"""
Converte as planilhas .xlsx dos supervisores em um JSON bruto (dados/planilhas.json)
que o importador do sistema (servidor/importar.js) consome.

Este script NÃO decide nada sobre o domínio: ele só lê as abas, normaliza os
cabeçalhos (que variam entre arquivos) e marca quais abas são compartilhadas
entre supervisores — o resto (status, dedupe, validação) é feito no importador.

Uso:
    python3 scripts/planilha_para_json.py ARQUIVO.xlsx [ARQUIVO.xlsx ...]

O supervisor sai do nome do arquivo: "LARISSA_2026.xlsx" -> "LARISSA".
Um prefixo de upload ("f91ed767-LARISSA_2026.xlsx") é descartado.
"""

import hashlib
import json
import os
import re
import sys
import unicodedata
from datetime import date, datetime

# Abas que não são meses de trabalho (rascunhos deixados na planilha).
ABAS_IGNORADAS = {"planilha1", "planilha2", "planilha3"}

MESES = {
    "janeiro": 1, "fevereiro": 2, "marco": 3, "abril": 4, "maio": 5, "junho": 6,
    "julho": 7, "agosto": 8, "setembro": 9, "outubro": 10, "novembro": 11,
    "dezembro": 12,
}

# Cabeçalhos variam entre os arquivos ("CNPJ" x "CNPJ/CPF", com/sem VALIDADE e
# EMISSÃO). Mapeia cada variação para um nome de campo estável.
COLUNAS = {
    "nome da estipulante": "estipulante",
    "cnpj": "documento",
    "cnpj/cpf": "documento",
    "proposta": "proposta",
    "operadora": "operadora",
    "situacao": "situacao",
    "validade": "validade",
    "corretor": "corretor",
    "valor": "valor",
    "responsavel": "responsavel",
    "emissao": "emissao",
    "cadastrado": "cadastrado",
    "observacoes": "observacoes",
}


def sem_acento(texto):
    return "".join(
        c for c in unicodedata.normalize("NFD", texto)
        if unicodedata.category(c) != "Mn"
    )


def chave(texto):
    """Normaliza um cabeçalho: sem acento, minúsculo, sem espaços duplicados."""
    return re.sub(r"\s+", " ", sem_acento(str(texto or "")).strip().lower())


def supervisor_do_arquivo(caminho):
    """
    Tira o nome do supervisor do nome do arquivo. Aceita as variações que
    aparecem na prática:

        LARISSA_2026.xlsx            -> LARISSA
        LUCAS ABC 2026.xlsx          -> LUCAS ABC
        Cópia de LUCAS SP 2026.xlsx  -> LUCAS SP
        KATHY 2026 (1).xlsx          -> KATHY
    """
    nome = os.path.basename(caminho)
    nome = re.sub(r"\.xlsx$", "", nome, flags=re.I)
    nome = re.sub(r"^[0-9a-f]{6,}-", "", nome)              # prefixo de upload
    nome = re.sub(r"\s*\(\d+\)\s*$", "", nome)              # "(1)" de cópia do Windows
    nome = re.sub(r"^c[oó]pia\s+(de\s+)?", "", nome, flags=re.I)
    nome = re.sub(r"[\s_-]*20\d\d\s*$", "", nome)           # ano, com espaço ou _
    return nome.replace("_", " ").strip().upper() or "SEM SUPERVISOR"


def mes_da_aba(titulo):
    """'MAIO ' -> 5 · 'MES 06' -> 6 · 'MARÇO' -> 3. Devolve None se não for mês."""
    t = chave(titulo)
    if t in MESES:
        return MESES[t]
    m = re.match(r"^mes\s*0?(\d{1,2})$", t)
    if m and 1 <= int(m.group(1)) <= 12:
        return int(m.group(1))
    return None


def celula(valor):
    """Converte a célula para texto/número JSON-serializável, sem perder datas."""
    if valor is None:
        return ""
    if isinstance(valor, (datetime, date)):
        return valor.strftime("%Y-%m-%d")
    if isinstance(valor, float) and valor.is_integer():
        return str(int(valor))
    if isinstance(valor, (int, float)):
        return str(valor)
    return re.sub(r"\s+", " ", str(valor)).strip()


def ler_arquivo(caminho):
    import openpyxl

    supervisor = supervisor_do_arquivo(caminho)
    wb = openpyxl.load_workbook(caminho, read_only=True, data_only=True)
    abas = []

    for ws in wb.worksheets:
        if chave(ws.title) in ABAS_IGNORADAS:
            continue

        linhas = list(ws.iter_rows(values_only=True))
        if len(linhas) < 2:
            continue

        cabecalho = [chave(c) for c in linhas[0]]
        if "nome da estipulante" not in cabecalho:
            print(f"  ! aba ignorada (sem cabeçalho conhecido): {ws.title}", file=sys.stderr)
            continue

        # posição de cada campo conhecido dentro da linha
        posicoes = {}
        for i, titulo in enumerate(cabecalho):
            campo = COLUNAS.get(titulo)
            if campo and campo not in posicoes:
                posicoes[campo] = i

        registros = []
        for linha in linhas[1:]:
            reg = {
                campo: celula(linha[i]) if i < len(linha) else ""
                for campo, i in posicoes.items()
            }
            # linha vazia / linha de total
            if not reg.get("estipulante"):
                continue
            registros.append(reg)

        if not registros:
            continue

        # Hash do conteúdo: abas idênticas em arquivos diferentes são cópias da
        # mesma planilha-modelo, e não trabalho de dois supervisores.
        conteudo = json.dumps(registros, ensure_ascii=False, sort_keys=True)
        abas.append({
            "aba": ws.title.strip(),
            "mes": mes_da_aba(ws.title),
            "hash": hashlib.sha1(conteudo.encode("utf-8")).hexdigest()[:12],
            "registros": registros,
        })

    wb.close()
    return {"arquivo": os.path.basename(caminho), "supervisor": supervisor, "abas": abas}


def main():
    caminhos = sys.argv[1:]
    if not caminhos:
        print(__doc__, file=sys.stderr)
        return 1

    arquivos = []
    for caminho in caminhos:
        print(f"lendo {caminho}", file=sys.stderr)
        arquivos.append(ler_arquivo(caminho))

    # Uma aba cujo hash aparece em mais de um arquivo é compartilhada: o
    # importador vai trazê-la uma única vez, sem atribuir a um supervisor.
    donos = {}
    for arq in arquivos:
        for aba in arq["abas"]:
            donos.setdefault(aba["hash"], set()).add(arq["supervisor"])
    for arq in arquivos:
        for aba in arq["abas"]:
            aba["compartilhada"] = len(donos[aba["hash"]]) > 1

    saida = {
        "gerado_em": datetime.now().isoformat(timespec="seconds"),
        "arquivos": arquivos,
    }

    destino = os.path.join(os.path.dirname(__file__), "..", "dados", "planilhas.json")
    destino = os.path.normpath(destino)
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    with open(destino, "w", encoding="utf-8") as f:
        json.dump(saida, f, ensure_ascii=False, indent=1)

    total = sum(len(a["registros"]) for arq in arquivos for a in arq["abas"])
    partilhadas = sum(1 for arq in arquivos for a in arq["abas"] if a["compartilhada"])
    print(
        f"\n{destino}\n"
        f"  {len(arquivos)} arquivos · {total} linhas · {partilhadas} abas compartilhadas",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
