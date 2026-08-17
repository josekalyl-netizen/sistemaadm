# Sistema Administrativo Inteligente — Grupo W3G

Substitui a planilha de controle das propostas por uma tela só, pesquisável e
filtrável, onde a organização acontece sozinha.

> **A regra do sistema:** o operador altera o status → o sistema organiza.
>
> Cada proposta é **uma única linha** no banco, com **um** `status_atual`.
> É esse campo que decide em qual área ela aparece. Não existe cópia de
> proposta entre etapas, nem registro para "mover".

---

## Rodar

Coloque as planilhas dos supervisores na pasta `planilhas/` e rode:

```bash
npm start
```

É só isso. Na primeira execução o sistema acha as planilhas, converte, importa
e abre o navegador sozinho. Nas próximas, ele só sobe.

Precisa de **Node 22.5 ou mais novo** (usa o SQLite embutido do próprio Node) e
de **Python 3** (só para ler os arquivos `.xlsx` na importação). Não há
dependência de Node para instalar.

Se as planilhas estiverem em outro lugar:

```bash
PLANILHAS=/caminho/da/pasta npm start
```

O sistema também procura sozinho em `Downloads`, `Área de Trabalho` e
`Documentos`. Sem planilha nenhuma ele sobe vazio, e dá para cadastrar as
propostas na mão.

### Comandos avulsos

```bash
npm run importar:simular     # relatório de validação, sem gravar nada
npm run importar             # importa (não duplica o que já existe)
npm run importar:recomecar   # apaga tudo e importa do zero
```

---

## O que o sistema guarda

Exatamente o que existe na planilha, mais o supervisor e a pendência:

| Campo | Vem de |
|---|---|
| Estipulante | NOME DA ESTIPULANTE |
| CNPJ / CPF | CNPJ/CPF |
| Proposta | PROPOSTA |
| Operadora | OPERADORA |
| Etapa | SITUAÇÃO (traduzida — ver tabela abaixo) |
| Validade | VALIDADE |
| Corretor | CORRETOR |
| Valor | VALOR |
| Responsável | RESPONSÁVEL |
| Emissão | EMISSÃO |
| Cadastrado | CADASTRADO |
| Observações | OBSERVAÇÕES |
| Supervisor | nome do arquivo da planilha |
| Pendência | preenchida no sistema quando a proposta fica pendente |

Nada além disso. Se a planilha não tem, o sistema não pede.

---

## As 8 etapas

A proposta caminha nesta sequência. Cada etapa tem a sua cor (tom fraco) e é
essa cor que tinge o card na lista.

| # | Etapa | Cor |
|---|---|---|
| 1 | Nova | cinza |
| 2 | Em análise | vermelho suave |
| 3 | Cotação | azul suave |
| 4 | Proposta enviada | roxo suave |
| 5 | Pendente | amarelo |
| 6 | Em implantação | âmbar suave |
| 7 | Implantada | verde |
| 8 | Cancelada | vermelho |

Trocar a etapa na ficha faz a proposta sair de uma área e aparecer na outra
imediatamente — as contagens de todas as áreas se atualizam junto.

---

## A tela

Tudo em uma página só:

- **Resumo** — total de propostas, valor implantado e valor parado em pendência.
- **Áreas por etapa** — as 8 etapas com a contagem de cada uma. Clicar entra na
  área; clicar de novo sai. As contagens respeitam a busca e os filtros ativos.
- **Busca global** — acha a proposta em **qualquer** etapa, por estipulante,
  CNPJ/CPF, número da proposta, corretor, operadora ou responsável.
  Atalho: tecla `/`.
- **Filtros combináveis** — supervisor, operadora, corretor, responsável,
  cadastrado e período de emissão. Todos somam (E lógico) e aparecem como
  fichas removíveis uma a uma.
- **Ficha da proposta** — abre em gaveta lateral com todos os campos editáveis,
  a pendência e o histórico.
- **Visão por supervisor** — o seletor no cabeçalho filtra a tela inteira para
  a carteira de um supervisor.

O estado da tela vai para o endereço (`?status=pendente&operadora=ALICE`), então
dá para salvar nos favoritos ou mandar o link para um colega.

---

## Supervisores

Cada planilha é de um supervisor, e o sistema se identifica sozinho: o
supervisor sai do nome do arquivo.

```
LARISSA 2026.xlsx            ->  LARISSA
LUCAS ABC 2026.xlsx          ->  LUCAS ABC
Cópia de LUCAS SP 2026.xlsx  ->  LUCAS SP
```

No cadastro de uma proposta nova, **escolher o supervisor é obrigatório** — é o
que faz a proposta aparecer na visão daquele supervisor. Dá para cadastrar um
supervisor novo sem sair do formulário, e trocar o supervisor de uma proposta
pela ficha (a troca fica registrada no histórico).

---

## Histórico

É automático. O operador nunca escreve uma linha de histórico à mão. O sistema
registra sozinho o cadastro, toda troca de etapa (com o motivo quando houver),
toda atualização de pendência, toda edição de campo (o que era e o que passou a
ser) e a importação da planilha, com arquivo e aba de origem.

---

## Importação da planilha

O importador valida antes de gravar e mostra um relatório com as linhas lidas,
importadas, duplicadas e com aviso; quantas propostas ficaram com cada
supervisor e em cada etapa; e os avisos agrupados (CNPJ com dígito errado, sem
número de proposta, sem valor, situação não reconhecida…).

**Nada é descartado por causa de aviso** — a linha entra e o aviso fica no
relatório, porque a planilha real tem muito documento digitado errado e perder
o registro seria pior do que importá-lo com defeito.

Duas coisas o importador resolve sozinho:

- **Duplicidade** — a chave natural é `número da proposta + documento` (ou
  `documento + empresa` quando a proposta é `0000-0`). Registro repetido é
  contado e ignorado.
- **Abas compartilhadas** — abas com conteúdo idêntico em arquivos de
  supervisores diferentes são cópias da mesma planilha-modelo. Entram uma única
  vez; o que sobrar sem dono vai para o supervisor `NÃO ATRIBUÍDO`, para o
  administrativo redistribuir.

### Tradução das situações

A `SITUAÇÃO` escrita na planilha vira etapa do sistema. A situação original
nunca é perdida: fica gravada e aparece no rodapé da ficha.

| Situação na planilha | Etapa |
|---|---|
| AGUARDANDO ANÁLISE | Em análise |
| AGUARDANDO ASSINATURA | Proposta enviada |
| PENDENTE · DEVOLVIDA · AGUARDANDO RETORNO | Pendente |
| AGUARDANDO PAGAMENTO · AGUARDANDO VIGÊNCIA | Em implantação |
| IMPLANTADA · IMPLANTADO · CONTRATO | Implantada |
| CANCELADA · DECLINADA · EXPIRADA · DESISTÊNCIA | Cancelada |

O mapa completo fica em `servidor/dominio.js` (`MAPA_SITUACAO_PLANILHA`) — é um
objeto só, fácil de ajustar se a operação mudar de vocabulário.

---

## Estrutura

```
scripts/planilha_para_json.py   lê os .xlsx e gera dados/planilhas.json
servidor/dominio.js             etapas, mapeamento, validações
servidor/banco.js               esquema SQLite (propostas, histórico)
servidor/importar.js            importação com validação e deduplicação
servidor/preparar.js            preparação automática na 1ª execução
servidor/api.js                 consultas e regras de escrita
servidor/servidor.js            HTTP: serve a interface e a API
web/                            a interface (HTML + CSS + JS, sem build)
```

Sem framework, sem build, sem dependência externa: `npm start` e pronto.

### API

| Método | Rota | O que faz |
|---|---|---|
| GET | `/api/config` | etapas, supervisores e listas de filtro |
| GET | `/api/painel` | números do resumo |
| GET | `/api/propostas` | lista com busca, filtros e paginação |
| GET | `/api/propostas/:id` | ficha completa (com histórico) |
| POST | `/api/propostas` | cadastra |
| PATCH | `/api/propostas/:id` | edita campos |
| PATCH | `/api/propostas/:id/status` | troca a etapa |
| POST | `/api/supervisores` | cria supervisor |

---

## Dados de cliente

As planilhas (`*.xlsx`), o `dados/planilhas.json` e o banco (`dados/sistema.db`)
**não são versionados** — estão no `.gitignore`. São dados de clientes reais e
ficam apenas na máquina de quem roda o sistema.
