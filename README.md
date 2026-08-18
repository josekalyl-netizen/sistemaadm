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
npm run zerar                           # mostra o que existe, sem apagar
npm run zerar -- --agora                # deixa o sistema em branco
```

### Trocar a senha da Área Master

Em **Master › Sistema**, informando a senha atual. Ela fica só na máquina, em
`dados/senha-master.txt` (fora do Git, permissão 0600) — nunca no repositório.
Ao trocar, todas as sessões abertas caem.

Se o sistema estiver subindo com a variável `SENHA_MASTER`, ela tem prioridade
sobre o arquivo e a troca pela tela fica bloqueada, com o aviso na própria seção.

### Deixar o sistema em branco

Pela tela: **Master › Sistema**. A seção mostra quanto existe hoje em cada
tabela e, para apagar, exige que se digite `ZERAR` na confirmação.

Pelo terminal: `npm run zerar` mostra o que existe sem apagar nada, e
`npm run zerar -- --agora` apaga **todos** os registros — propostas, histórico,
verificações, corretores e usuários — e mantém a estrutura intacta. Não tem como
desfazer: para guardar o que existe, copie `dados/sistema.db` antes.

Depois de zerar, a importação automática das planilhas fica desligada, senão a
próxima subida confundiria o banco vazio com uma primeira execução e traria tudo
de volta. Para religar: `npm run zerar -- --religar-importacao`.

---

## Os cinco módulos

### 1 · Propostas

Cadastro, busca, filtros e etapas. Os campos são os da planilha:

| Campo | Vem de |
|---|---|
| Empresa · CNPJ/CPF · Proposta · Operadora | colunas da planilha |
| Corretor | escolhido da carteira cadastrada pelo Master (Master → Corretores) |
| **Responsável ADM** | quem acompanha aqui dentro (lista de usuários) |
| Valor · Emissão · Validade · Cadastrado · Observações | colunas da planilha |
| Etapa | SITUAÇÃO, traduzida (ver tabela adiante) |
| Supervisor | preenchido sozinho a partir do corretor escolhido |

**Corretor e Responsável ADM são coisas diferentes** e vivem em campos
separados. Empresa, CNPJ/CPF, corretor, operadora, responsável ADM, valor e
emissão são obrigatórios — sem eles o cadastro não é liberado.

No cadastro existe a marca **Emitida pelo corretor**. É origem, não etapa: fica
na proposta para sempre, aparece como selo na lista e na ficha, e não está entre
os campos editáveis — deixá-la editável transformaria um fato em opinião.

O supervisor de cada corretor é cadastrado só pelo Master, por um CSV
`corretor,supervisor` (tela Master → Corretores). Ao escolher o corretor no
cadastro, o supervisor já vem junto — sem precisar perguntar de novo.

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

Mensagens prontas para a ADM copiar e mandar para o corretor, em **dois canais**:
**WhatsApp** (o texto do dia a dia, direto, com emoji) e **E-mail** (a mesma
mensagem em registro formal, com assunto e assinatura da equipe — o texto que o
corretor pode encaminhar para a operadora). A ADM escolhe na hora de mandar; no
e-mail, o assunto é copiado junto com o corpo.

Cada canal tem o próprio rodízio: mandar um e-mail não gasta a variação do
WhatsApp. O número de variações muda por etapa — Em análise tem 10; Pendente e Cancelada, 3; Em
implantação, 2; as demais têm a mensagem-padrão da etapa. O sistema escolhe uma
sozinho e **não repete a mesma para o mesmo corretor** enquanto houver outra
disponível.

Na etapa Pendente existe um campo onde a ADM escreve a pendência; ela entra na
mensagem:

```
Olá, Guilherme. Tudo bem?
A proposta do contrato ABC Ltda, na Amil, retornou com uma pendência.
Pendência: cópia do contrato social assinado
Vamos acompanhar a regularização para que o processo possa seguir normalmente.
Se precisar de qualquer suporte, estamos à disposição! 🤝
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

Propostas (com o painel do dia e o cenário do mês no topo) · Pendentes ·
Alertas · Implantadas · Master.

Dentro da Área Master: Visão geral, Acompanhamento, Relatórios, Usuários e
Corretores.

No topo, dois controles mandam no sistema inteiro:

- **Usuário** — escolher uma ADM filtra **todas** as telas para a carteira dela.
  `Todos` mostra a operação inteira; `Sem responsável` isola o que ninguém está
  acompanhando.
- **Busca** — acha a proposta em qualquer etapa, por empresa, CNPJ, número da
  proposta, corretor, operadora ou responsável. Só aparece em Propostas e
  Implantadas, que é onde há propostas para achar. Atalho: tecla `/`.

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
servidor/mensagens.js           as mensagens de cada etapa (WhatsApp e e-mail)
servidor/zerar.js               deixa o sistema em branco, mantendo a estrutura
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
