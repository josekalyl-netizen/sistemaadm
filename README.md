# Sistema Administrativo Inteligente — Grupo W3G

Acompanhamento diário de propostas. Substitui a planilha por uma ferramenta que
responde três perguntas: **o cadastro está certo**, **a proposta foi olhada hoje**
e **como está o trabalho de cada ADM**.

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

Na primeira execução o sistema acha as planilhas, converte, importa e abre o
navegador sozinho. Nas próximas, ele só sobe.

Precisa de **Node 22.5 ou mais novo** (usa o SQLite embutido do próprio Node) e
de **Python 3** (só para ler os `.xlsx`). Nenhuma dependência de Node.

```bash
PLANILHAS=/caminho/da/pasta npm start   # planilhas em outro lugar
npm run importar:simular                # relatório de validação, sem gravar
npm run importar:recomecar              # apaga tudo e importa do zero
```

---

## Os cinco módulos

### 1 · Propostas

Cadastro, busca, filtros e etapas. Os campos são os da planilha:

| Campo | Vem de |
|---|---|
| Empresa · CNPJ/CPF · Proposta · Operadora | colunas da planilha |
| Corretor | quem trouxe o negócio (texto livre) |
| **Responsável ADM** | quem acompanha aqui dentro (lista de usuários) |
| Valor · Emissão · Validade · Cadastrado · Observações | colunas da planilha |
| Etapa | SITUAÇÃO, traduzida (ver tabela adiante) |
| Supervisor | nome do arquivo da planilha |

**Corretor e Responsável ADM são coisas diferentes** e vivem em campos
separados. A proposta pode ser cadastrada sem ADM — nesse caso cai na fila
*sem responsável*, que aparece em Alertas para o Master distribuir.

### 2 · Acompanhamento

Cada proposta tem um botão **Verificar**. Um clique registra dia, hora, ADM e
etapa, atualiza a última verificação e tira a proposta do atraso.

O botão exige que haja um usuário escolhido no topo: sem saber **quem**
verificou, o registro não serviria de auditoria.

### 3 · Alertas

O nível é calculado na hora, a partir dos dias sem verificação:

| Nível | Quando | Onde aparece |
|---|---|---|
| 🟢 Acompanhando | verificada hoje | — |
| 🟡 Pendente | não verificada hoje | Pendentes |
| 🔴 Atrasada | 2 a 4 dias | Alertas |
| 🔴 Crítica | 5 dias ou mais | Alertas |

"Não acompanhou hoje" e "está atrasada" são coisas diferentes de propósito: a
primeira é a pendência normal do dia, a segunda é problema.

Etapas encerradas (Implantada, Cancelada) saem da fila — não têm prazo.

### 4 · Comunicação

São **15 mensagens prontas por etapa** (120 no total), escritas para soarem
humanas. O sistema escolhe uma sozinho e **não repete a mesma para o mesmo
corretor** enquanto houver outra disponível.

Na etapa Pendente existe um campo onde a ADM escreve a pendência; ela entra na
mensagem, que termina se colocando à disposição:

```
Oi, Guilherme, tudo bem? Surgiu uma pendência na proposta da ABC Ltda (Amil):

Pendência: cópia do contrato social assinado

Me manda quando conseguir que eu já sigo com o processo.
Qualquer dúvida, estou à disposição!
```

### 5 · Master

Área protegida por senha, com a produtividade de cada ADM: para acompanhar,
acompanhadas, pendentes, atrasadas, críticas e a **taxa de acompanhamento**.
Clicar numa ADM abre o histórico diário dela. Relatórios de hoje, semana e mês,
com o consolidado, o desempenho individual e o dia a dia.

**A senha não fica no código nem no repositório.** É lida de `SENHA_MASTER`
(variável de ambiente) ou de `dados/senha-master.txt`, que está no `.gitignore`.
Se não existir nenhuma das duas, o sistema cria uma senha aleatória na primeira
execução e a imprime uma única vez no terminal.

```bash
SENHA_MASTER='suasenha' npm start
```

---

## As telas

Dashboard · Propostas · Pendentes · Alertas · Implantadas · Acompanhamento ·
Relatórios · Usuários · Master

No topo, dois controles mandam no sistema inteiro:

- **Usuário** — escolher uma ADM filtra **todas** as telas para a carteira dela.
  `Todos` mostra a operação inteira; `Sem responsável` isola o que ninguém está
  acompanhando.
- **Busca** — acha a proposta em qualquer etapa, por empresa, CNPJ, número da
  proposta, corretor, operadora ou responsável. Atalho: tecla `/`.

O estado da tela vai para o endereço, então dá para salvar nos favoritos ou
mandar o link para um colega.

---

## As 8 etapas

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

Cada etapa tem `prazo` (de quantos em quantos dias precisa ser verificada) em
`servidor/dominio.js`. Mudar o fluxo é mexer nessa lista, não no sistema.

---

## Histórico

É automático. Ninguém escreve histórico à mão. O sistema registra o cadastro,
cada verificação, cada troca de etapa (com o motivo), cada atualização de
pendência, cada edição de campo (o que era → o que passou a ser), a troca de
responsável e a importação da planilha.

---

## Importação

O importador valida antes de gravar e mostra um relatório: linhas lidas,
importadas, duplicadas, com aviso e sem ADM responsável; quantas ficaram com
cada supervisor e em cada etapa; e os avisos agrupados.

**Nada é descartado por causa de aviso** — a planilha real tem muito documento
digitado errado, e perder o registro seria pior do que importá-lo com defeito.

Duas coisas o importador resolve sozinho:

- **Duplicidade** — chave natural `número da proposta + documento` (ou
  `documento + empresa` quando a proposta é `0000-0`).
- **Abas compartilhadas** — abas idênticas em arquivos de supervisores
  diferentes são cópias da mesma planilha-modelo: entram uma vez só.

Três decisões da importação que valem saber:

1. **A coluna RESPONSÁVEL vira a ADM.** Cada nome diferente vira um usuário, e a
   proposta já nasce vinculada. Nomes que não são ADM de verdade (`CORRETOR`,
   `GIULIA/ANA`) também viram usuários — o Master desativa na tela Usuários.
2. **A data de cadastro é a emissão**, não o dia da importação. Senão o
   histórico começaria com "2.139 propostas novas hoje".
3. **A importação é o marco zero do acompanhamento.** Cada proposta aberta
   recebe uma verificação inicial com a observação *"marco inicial — importação
   da planilha"*. Sem isso, o primeiro dia apareceria com a carteira inteira não
   acompanhada — uma acusação falsa contra a equipe por um dia em que o sistema
   nem existia. A partir do dia seguinte, a contagem é real.

### Tradução das situações

| Situação na planilha | Etapa |
|---|---|
| AGUARDANDO ANÁLISE | Em análise |
| AGUARDANDO ASSINATURA | Proposta enviada |
| PENDENTE · DEVOLVIDA · AGUARDANDO RETORNO | Pendente |
| AGUARDANDO PAGAMENTO · AGUARDANDO VIGÊNCIA | Em implantação |
| IMPLANTADA · IMPLANTADO · CONTRATO | Implantada |
| CANCELADA · DECLINADA · EXPIRADA · DESISTÊNCIA | Cancelada |

A situação original nunca é perdida: fica gravada e aparece no rodapé da ficha.
O mapa completo está em `MAPA_SITUACAO_PLANILHA` (`servidor/dominio.js`).

---

## Como os números do passado são calculados

O dia de hoje é sempre calculado ao vivo. Quando vira a meia-noite, os números
daquele dia são **congelados** em `dia_resumo` — senão o passado mudaria
sozinho: uma proposta implantada amanhã sumiria da carteira de ontem e a taxa
que o Master viu não bateria mais.

No fechamento, "para acompanhar" conta as propostas que **já existiam e ainda
estavam abertas** naquele dia. Nos relatórios de período os números somam os
dias: uma proposta que ficou cinco dias na fila conta cinco vezes. É carga de
trabalho, não quantidade de propostas distintas.

---

## Estrutura

```
scripts/planilha_para_json.py   lê os .xlsx e gera dados/planilhas.json
servidor/dominio.js             etapas, níveis, mapeamento, validações
servidor/banco.js               esquema SQLite
servidor/importar.js            importação com validação e deduplicação
servidor/acompanhamento.js      verificações, níveis, fechamento e relatórios
servidor/mensagens.js           as 15 mensagens por etapa
servidor/autenticacao.js        senha e sessão da Área Master
servidor/api.js                 consultas e regras de escrita
servidor/servidor.js            HTTP: serve a interface e a API
web/                            a interface (HTML + CSS + JS, sem build)
```

Sem framework, sem build, sem dependência: `npm start` e pronto.

### API

| Método | Rota | O que faz |
|---|---|---|
| GET | `/api/config` | etapas, níveis, usuários e listas de filtro |
| GET | `/api/painel` | números do dia (respeita `usuario_id`) |
| GET | `/api/propostas` | lista com busca, filtros, nível e paginação |
| GET | `/api/propostas/:id` | ficha completa (histórico + verificações) |
| POST | `/api/propostas` | cadastra |
| PATCH | `/api/propostas/:id` | edita campos |
| PATCH | `/api/propostas/:id/status` | troca a etapa |
| POST | `/api/propostas/:id/verificar` | registra a verificação |
| GET | `/api/propostas/:id/mensagem` | mensagem pronta para o corretor |
| POST | `/api/propostas/atribuir` | atribui ADM em lote |
| GET · POST | `/api/usuarios` | lista · cadastra (cadastro exige Master) |
| POST | `/api/master/entrar` | abre a sessão do Master |
| GET | `/api/master/produtividade` | quadro por ADM |
| GET | `/api/master/historico` | histórico diário |
| GET | `/api/master/relatorio` | relatório de hoje / semana / mês |

---

## Dados de cliente

As planilhas (`*.xlsx`), o `dados/planilhas.json`, o banco (`dados/sistema.db`)
e a senha (`dados/senha-master.txt`) **não são versionados** — estão no
`.gitignore`. São dados de clientes reais e ficam só na máquina.
