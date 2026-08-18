/**
 * MÓDULO 4 — COMUNICAÇÃO
 *
 * Mensagens prontas para a ADM copiar e mandar para o corretor. O número de
 * variações muda por etapa (algumas têm só uma mensagem-padrão; "Em análise"
 * tem 10; "Pendente" e "Cancelada" têm 3; "Em implantação" tem 2) — é o que
 * faz sentido pra frequência de cada uma: etapas mais demoradas, com mais
 * contato repetido, têm mais variações para não soar robótico.
 *
 * O sistema escolhe uma sozinho e evita repetir para o MESMO corretor: guarda
 * em `mensagens_uso` o que já mandou e sorteia entre as que faltam.
 *
 * Marcadores disponíveis em qualquer mensagem:
 *   {corretor} {empresa} {operadora} {proposta} {pendencia}
 *
 * Na etapa Pendente, {pendencia} é o espaço que a ADM preenche antes de
 * copiar — é ela quem descreve o que a operadora retornou.
 */

import { texto } from "./dominio.js";

/** Primeiro nome, com a inicial maiúscula: "GUILHERME AUGUSTO" -> "Guilherme". */
export function primeiroNome(nomeCompleto) {
  const bruto = texto(nomeCompleto).replace(/\(.*?\)/g, " ").trim();
  const primeiro = bruto.split(/[\s/,-]+/).filter(Boolean)[0] || "";
  if (!primeiro) return "";
  return primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase();
}

/**
 * "ABC COMERCIO LTDA" -> "ABC Comercio Ltda" (fica menos gritado na mensagem).
 * Nomes de MEI vêm com o CNPJ colado na frente ("64174156 ELIZABETE DA SILVA")
 * — o número sai, porque numa mensagem para o corretor ele só atrapalha.
 */
export function nomeApresentavel(nome) {
  return texto(nome)
    .replace(/^\d[\d.\/-]{6,}\s+/, "")
    .toLowerCase()
    .replace(/\b([a-zà-ú])([a-zà-ú]*)/g, (_, a, resto) => a.toUpperCase() + resto)
    .replace(/\b(Ltda|Me|Epp|S\/a|Sa|Eireli)\b/gi, (m) => m.toUpperCase());
}

export const MENSAGENS = {
  nova: [
    "Olá, {corretor}! Tudo bem? 😊\nA proposta do contrato {empresa}, na {operadora}, foi emitida com sucesso!\nAgora vamos acompanhar o andamento por aqui. Qualquer dúvida ou necessidade durante o processo, estamos à disposição para te ajudar. Conte conosco! 🤝",
  ],

  em_analise: [
    "Olá, {corretor}! 😊\nA proposta do contrato {empresa}, na {operadora}, está em análise pela operadora.\nVamos continuar acompanhando o processo e, assim que tivermos uma atualização, te avisamos. Estamos à disposição para o que precisar! 🤝",
    "Olá, {corretor}!\nPassando para te atualizar sobre o contrato {empresa}, da {operadora}. A proposta está em análise pela operadora e seguimos acompanhando o processo.\nAssim que houver qualquer novidade, te informaremos. Estamos à disposição para ajudar! 😊",
    "Olá, {corretor}! Tudo bem?\nA proposta do {empresa}, na {operadora}, segue em análise.\nEstamos acompanhando de perto para garantir que o processo avance corretamente. Qualquer necessidade, estamos à disposição! 🤝",
    "Olá, {corretor}! 😊\nTemos uma atualização do contrato {empresa}: a proposta está em análise na {operadora}.\nSeguimos acompanhando e te manteremos informado sobre os próximos passos. Estamos à disposição!",
    "Olá, {corretor}!\nA proposta do contrato {empresa}, junto à {operadora}, está passando pela etapa de análise.\nPor enquanto, seguimos aguardando o retorno da operadora e acompanhando tudo por aqui. Estamos à disposição para qualquer suporte! 🤝",
    "Olá, {corretor}!\nO contrato {empresa}, da {operadora}, está atualmente em análise.\nVamos continuar monitorando o processo e, assim que tivermos um retorno, te avisamos. Conte conosco, estamos à disposição!",
    "Olá, {corretor}! 😊\nSó passando para informar que a proposta do {empresa} está em análise pela {operadora}.\nEstamos acompanhando o andamento e qualquer novidade será comunicada. Se precisar de algo, estamos à disposição!",
    "Olá, {corretor}!\nA proposta do {empresa}, na {operadora}, segue em análise neste momento.\nEstamos acompanhando o processo para você e aguardando a evolução da operadora. Estamos à disposição para qualquer suporte! 🤝",
    "Olá, {corretor}! Tudo certo?\nO contrato {empresa}, da {operadora}, está em análise pela operadora.\nSeguimos acompanhando o processo e te atualizaremos assim que houver qualquer movimentação. Estamos à disposição!",
    "Olá, {corretor}! 😊\nPassando para avisar que a proposta do contrato {empresa}, na {operadora}, está em análise.\nAgora é acompanhar a evolução da operadora. Assim que tivermos uma nova posição, te avisaremos. Estamos à disposição para o que precisar! 🤝",
  ],

  cotacao: [
    "Olá, {corretor}! 😊\nA cotação do contrato {empresa}, na {operadora}, está em andamento.\nAssim que tivermos a atualização, seguimos com você. Se precisar de qualquer suporte nesse processo, estamos à disposição! 🤝",
  ],

  enviada: [
    "Olá, {corretor}!\nA proposta do contrato {empresa}, na {operadora}, foi enviada para a operadora com sucesso.\nAgora vamos acompanhar o retorno e te manter informado sobre os próximos passos. Estamos à disposição para qualquer suporte! 😊",
  ],

  pendente: [
    "Olá, {corretor}. Tudo bem?\nA proposta do contrato {empresa}, na {operadora}, retornou com uma pendência.\nPendência: {pendencia}\nVamos acompanhar a regularização para que o processo possa seguir normalmente. Se precisar de qualquer suporte, estamos à disposição! 🤝",
    "Olá, {corretor}!\nTivemos um retorno da {operadora} referente ao contrato {empresa} e precisamos ajustar uma pendência antes de dar continuidade.\nPendência: {pendencia}\nVamos acompanhar esse ajuste junto com você. Qualquer dúvida ou necessidade, estamos à disposição para ajudar! 😊",
    "Olá, {corretor}! 😊\nA proposta do {empresa}, na {operadora}, voltou com uma pendência para regularização.\nPendência: {pendencia}\nAssim que essa questão for resolvida, poderemos dar sequência ao processo. Estamos à disposição para te auxiliar no que for necessário! 🤝",
  ],

  em_implantacao: [
    "Olá, {corretor}! 😊\nBoa notícia! A proposta do contrato {empresa}, na {operadora}, foi aceita e agora está em processo de implantação.\nVamos continuar acompanhando essa etapa até a conclusão. Estamos à disposição para o que precisar! 🤝",
    "Olá, {corretor}!\nTemos uma ótima atualização sobre o contrato {empresa}: a {operadora} aceitou a proposta e o contrato já está em processo de implantação.\nSeguimos acompanhando até a finalização. Qualquer necessidade, estamos à disposição!",
  ],

  implantada: [
    "Olá, {corretor}! 😊\nO contrato {empresa}, na {operadora}, foi implantado com sucesso!\nAgora aguardamos a disponibilização do boleto e, assim que estiver disponível, enviaremos para você.\nEstamos à disposição para qualquer suporte! 🤝",
  ],

  cancelada: [
    "Olá, {corretor}. Tudo bem?\nTivemos um retorno sobre o contrato {empresa}, da {operadora}, e infelizmente a proposta foi cancelada.\nSabemos que não é o resultado que esperávamos, mas podemos avaliar uma segunda alternativa para esse caso e buscar outra possibilidade para o cliente.\nSe quiser, estamos à disposição para analisar o cenário e te ajudar a encontrar uma nova opção. 🤝",
    "Olá, {corretor}!\nPassando para te atualizar sobre o contrato {empresa}, da {operadora}. Infelizmente, a proposta foi cancelada.\nMas não vamos parar por aqui. Podemos analisar o motivo do cancelamento e verificar uma nova alternativa de operadora ou produto para tentar dar continuidade ao caso.\nEstamos à disposição para te ajudar a encontrar a melhor solução! 😊",
    "Olá, {corretor}. Tudo bem?\nInfelizmente, tivemos o cancelamento da proposta do contrato {empresa}, na {operadora}.\nEntendemos que esse não era o resultado esperado, mas podemos avaliar o caso com você e buscar uma segunda opção para o cliente, tentando aproveitar o máximo possível do que já foi feito.\nSe precisar, estamos à disposição para analisar o caso e encontrar uma nova alternativa junto com você. 🤝",
  ],
};

/** Preenche os marcadores da mensagem com os dados da proposta. */
export function preencher(modelo, proposta, pendencia = "") {
  const dados = {
    corretor: primeiroNome(proposta.corretor) || "tudo bem",
    empresa: nomeApresentavel(proposta.razao_social),
    operadora: nomeApresentavel(proposta.operadora) || "operadora",
    proposta: texto(proposta.numero_proposta) || "—",
    pendencia: texto(pendencia)
      || texto(proposta.pendencia_detalhe)
      || texto(proposta.pendencia_tipo)
      || "(descreva a pendência aqui)",
  };
  return modelo.replace(/\{(\w+)\}/g, (inteiro, chave) =>
    (chave in dados ? dados[chave] : inteiro));
}

/**
 * Escolhe uma mensagem para a proposta, evitando as que esse corretor já
 * recebeu nessa etapa. Quando todas as 15 já rodaram, recomeça — mas nunca
 * repete a última usada em seguida.
 */
export function escolherMensagem(db, proposta, { pendencia = "", indice = null } = {}) {
  const etapaCodigo = proposta.status_atual;
  const modelos = MENSAGENS[etapaCodigo] || [];
  if (!modelos.length) return null;

  const corretor = texto(proposta.corretor).toUpperCase() || "(sem corretor)";

  let escolhido;
  if (Number.isInteger(indice) && indice >= 0 && indice < modelos.length) {
    escolhido = indice;                       // a ADM pediu outra mensagem
  } else {
    const usados = db.prepare(
      "SELECT indice FROM mensagens_uso WHERE corretor = ? AND etapa = ? ORDER BY id DESC",
    ).all(corretor, etapaCodigo).map((r) => r.indice);

    const todos = modelos.map((_, i) => i);
    let candidatos = todos.filter((i) => !usados.includes(i));

    // Todas já rodaram com esse corretor: recomeça o ciclo, evitando emendar a
    // mesma mensagem duas vezes seguidas.
    if (!candidatos.length) candidatos = todos.filter((i) => i !== usados[0]);

    // Etapa que tem UMA mensagem só (Nova, Cotação, Proposta enviada,
    // Implantada): o filtro acima esvazia a lista e não sobra o que sortear.
    // Aqui repetir é o comportamento certo — é a mensagem-padrão da etapa.
    if (!candidatos.length) candidatos = todos;

    escolhido = candidatos[Math.floor(Math.random() * candidatos.length)];
  }

  return {
    etapa: etapaCodigo,
    indice: escolhido,
    total: modelos.length,
    corretor_nome: primeiroNome(proposta.corretor),
    pede_pendencia: etapaCodigo === "pendente",
    texto: preencher(modelos[escolhido], proposta, pendencia),
  };
}

/** Registra que a mensagem foi usada — é o que impede a repetição. */
export function registrarUso(db, proposta, indice) {
  db.prepare(
    "INSERT INTO mensagens_uso (corretor, etapa, indice, proposta_id) VALUES (?, ?, ?, ?)",
  ).run(
    texto(proposta.corretor).toUpperCase() || "(sem corretor)",
    proposta.status_atual,
    Number(indice),
    proposta.id,
  );
}
