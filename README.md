# Sistema Operacional de Propostas

Grupo W3G · identidade visual **Programa Atlas**.

Substitui a planilha de controle da operação por uma tela só, pesquisável e
filtrável, onde a organização acontece sozinha.

> **A regra do sistema:** o operador altera o status → o sistema organiza.
>
> Cada proposta é **uma única linha** no banco, com **um** `status_atual`.
> É esse campo que decide em qual área ela aparece. Não existe cópia de
> proposta entre etapas, nem registro para "mover".

---

## Rodar

Precisa de **Node 22.5 ou mais novo** (usa o SQLite embutido do próprio Node).
Não há dependências para instalar.

```bash
# 1. converter as planilhas dos supervisores em JSON
python3 scripts/planilha_para_json.py ~/planilhas/*.xlsx     # precisa de openpyxl

# 2. conferir antes de gravar (não grava nada)
npm run importar:simular

# 3. importar de verdade
npm run importar

# 4. subir o sistema
npm start        # http://localhost:3000
```

Para reimportar do zero: `npm run importar:recomecar` (apaga e recria).
Rodar `npm run importar` de novo **não duplica**: registros já existentes são
reconhecidos pela chave natural e ignorados.

---

## As 8 etapas

A proposta caminha nesta sequência. Cada etapa tem a sua cor (tom fraco) e é
essa cor que tinge o card na lista.

| # | Etapa | Cor | O que é |
|---|---|---|---|
| 1 | Nova | cinza | Recém cadastrada |
| 2 | Em análise | vermelho suave | Sendo trabalhada pelo operacional |
| 3 | Cotação | azul suave | Em processo de cotação |
| 4 | Proposta enviada | roxo suave | Já enviada ao cliente |
| 5 | Pendente | amarelo | Tem alguma pendência |
| 6 | Em implantação | âmbar suave | Avançou para implantação |
| 7 | Implantada | verde | Implantação concluída |
| 8 | Cancelada | vermelho | Encerrada sem implantação |

Trocar a etapa na ficha faz a proposta sair de uma área e aparecer na outra
imediatamente — as contagens de todas as áreas se atualizam junto.

---

## A tela

Tudo em uma página só:

- **Dashboard** — total, pendentes, em implantação, implantadas, total de vidas,
  com o valor somado em cada situação.
- **Áreas por etapa** — as 8 etapas com a contagem de cada uma. Clicar entra na
  área; clicar de novo sai. As contagens respeitam a busca e os filtros ativos.
- **Busca global** — acha a proposta em **qualquer** etapa, por razão social,
  nome fantasia, CNPJ/CPF, titular, número da proposta, corretor, operadora ou
  responsável. Atalho: tecla `/`.
- **Filtros combináveis** — supervisor, operadora, corretor, responsável, tipo,
  empresa, documento, titular, período, período de implantação e faixa de vidas.
  Todos somam (E lógico) e aparecem como fichas removíveis uma a uma.
- **Ficha da proposta** — abre em gaveta lateral: empresa, proposta, vidas com
  faixa etária, pendência, observação, responsável, supervisor e histórico.
- **Visão por supervisor** — o seletor no cabeçalho filtra a tela inteira para
  a carteira de um supervisor.

O estado da tela vai para o endereço (`?status=pendente&operadora=ALICE`), então
dá para salvar nos favoritos ou mandar o link para um colega.

---

## Supervisores

Cada planilha original é de um supervisor, e o sistema se identifica sozinho:
o supervisor sai do nome do arquivo (`LARISSA_2026.xlsx` → `LARISSA`).

No cadastro de uma proposta nova, **escolher o supervisor é obrigatório** — é o
que faz a proposta aparecer na visão daquele supervisor. Dá para cadastrar um
supervisor novo sem sair do formulário, e trocar o supervisor de uma proposta
pela ficha (a troca fica registrada no histórico).

---

## Histórico

É automático. O operador nunca escreve uma linha de histórico à mão. O sistema
registra sozinho:

- cadastro da proposta e por qual etapa ela começou;
- toda troca de etapa, com o motivo quando houver;
- toda atualização de pendência;
- toda edição de campo (o que era e o que passou a ser);
- inclusão e remoção de vidas;
- a importação da planilha, com arquivo e aba de origem.

---

## Importação da planilha

O importador valida antes de gravar e mostra um relatório com:

- linhas lidas, importadas, duplicadas e com aviso;
- quantas propostas ficaram com cada supervisor e em cada etapa;
- os avisos de validação agrupados (CNPJ com dígito errado, sem número de
  proposta, sem valor, situação não reconhecida…).

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

### O que a planilha não tinha

A planilha não tem colunas de **nome fantasia, titular, produto, quantidade de
vidas, dependentes nem tipo de proposta**. Os campos existem no sistema e
funcionam (inclusive a contagem por faixa etária), mas nascem vazios nos
registros importados — é a operação que passa a preenchê-los daqui pra frente.
O tipo de proposta é deduzido pelo documento (CNPJ → PME, CPF → PF) e pela
operadora (ODONTO/DENTAL → odontológico).

### Tradução das situações

A `SITUAÇÃO` escrita na planilha vira etapa do sistema. A situação original
nunca é perdida: fica gravada em `situacao_origem` e aparece no rodapé da ficha.

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
servidor/dominio.js             etapas, mapeamento, faixas etárias, validações
servidor/banco.js               esquema SQLite (propostas, vidas, histórico)
servidor/importar.js            importação com validação e deduplicação
servidor/api.js                 consultas e regras de escrita
servidor/servidor.js            HTTP: serve a interface e a API
web/                            a interface (HTML + CSS + JS, sem build)
web/css/atlas.css               identidade visual Atlas (tokens, tema claro/escuro)
```

Sem framework, sem build, sem dependência externa: `npm start` e pronto.

### API

| Método | Rota | O que faz |
|---|---|---|
| GET | `/api/config` | etapas, supervisores e listas de filtro |
| GET | `/api/painel` | números do dashboard |
| GET | `/api/propostas` | lista com busca, filtros e paginação |
| GET | `/api/propostas/:id` | ficha completa (vidas + histórico) |
| POST | `/api/propostas` | cadastra |
| PATCH | `/api/propostas/:id` | edita campos |
| PATCH | `/api/propostas/:id/status` | troca a etapa |
| POST | `/api/propostas/:id/vidas` | inclui vida |
| DELETE | `/api/propostas/:id/vidas/:vid` | remove vida |
| POST | `/api/supervisores` | cria supervisor |

---

## Dados de cliente

As planilhas (`*.xlsx`), o `dados/planilhas.json` e o banco (`dados/sistema.db`)
**não são versionados** — estão no `.gitignore`. São dados de clientes reais e
ficam apenas na máquina de quem roda o sistema.
