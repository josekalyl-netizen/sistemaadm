/**
 * MÓDULO 4 — COMUNICAÇÃO
 *
 * Mensagens prontas para a ADM copiar e mandar para o corretor. São 15 por
 * etapa, escritas para soarem humanas: cumprimentos diferentes, ordens de
 * frase diferentes, nenhuma fórmula repetida.
 *
 * O sistema escolhe uma sozinho e evita repetir para o MESMO corretor: guarda
 * em `mensagens_uso` o que já mandou e sorteia entre as que faltam.
 *
 * Marcadores disponíveis em qualquer mensagem:
 *   {corretor} {empresa} {operadora} {proposta} {pendencia}
 *
 * Na etapa Pendente, {pendencia} é o espaço que a ADM preenche antes de
 * copiar — é ela quem descreve o que está faltando.
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
    "Olá, {corretor}! 😊 Recebemos a proposta da {empresa}, pela {operadora}. Já colocamos na fila e seguimos com o processo. Qualquer novidade eu te aviso!",
    "{corretor}, tudo bem? Passando para confirmar que a proposta da {empresa} ({operadora}) chegou aqui certinho. Vou acompanhar e te retorno.",
    "Oi, {corretor}! Proposta da {empresa} recebida, pela {operadora}. Já está com a gente — te mantenho informado. 😊",
    "Bom dia, {corretor}! A proposta da {empresa} pela {operadora} entrou no nosso controle hoje. Assim que tiver andamento, eu aviso.",
    "{corretor}, recebemos aqui a proposta da {empresa} ({operadora}). Está tudo certo com a documentação. Seguimos!",
    "Olá, {corretor}! 😊 Confirmando o recebimento da proposta da {empresa}, pela {operadora}. Já iniciei o acompanhamento.",
    "Oi, {corretor}, tudo certo? A proposta da {empresa} pela {operadora} já está registrada. Vou acompanhar de perto.",
    "{corretor}, boa notícia: a proposta da {empresa} ({operadora}) chegou completa. Já demos entrada no processo.",
    "Olá, {corretor}! Recebi a proposta da {empresa}, {operadora}. Está no nosso radar — qualquer coisa, é só chamar.",
    "{corretor}, tudo bem? Só passando para dizer que a proposta da {empresa} pela {operadora} está conosco e já em andamento.",
    "Oi, {corretor}! 😊 Proposta da {empresa} ({operadora}) recebida. Vou te atualizando a cada passo.",
    "{corretor}, a proposta da {empresa} pela {operadora} entrou aqui. Já está sendo cuidada. Conte comigo!",
    "Olá, {corretor}! Confirmo a chegada da proposta da {empresa}, {operadora}. Seguimos com o processo por aqui.",
    "Oi, {corretor}, tudo bem? Recebemos a proposta da {empresa} ({operadora}) e já iniciamos. Te aviso das novidades.",
    "{corretor}! 😊 A proposta da {empresa} pela {operadora} está registrada no nosso sistema. Vamos acompanhar juntos.",
  ],

  em_analise: [
    "Olá, {corretor}! 😊 A proposta da {empresa}, pela {operadora}, está em análise. Assim que sair um retorno eu te aviso na hora.",
    "{corretor}, tudo bem? A {operadora} está analisando a proposta da {empresa}. Estou acompanhando diariamente.",
    "Oi, {corretor}! Passando um retorno: a proposta da {empresa} segue em análise na {operadora}. Já já temos novidade.",
    "{corretor}, a proposta da {empresa} ({operadora}) entrou em análise. Fico de olho e te retorno assim que houver posição.",
    "Olá, {corretor}! A análise da proposta da {empresa} pela {operadora} está em andamento. Te mantenho informado. 😊",
    "Oi, {corretor}, tudo certo? A {operadora} está com a proposta da {empresa} em análise no momento.",
    "{corretor}! Atualização: a proposta da {empresa} está sendo analisada pela {operadora}. Seguimos no acompanhamento.",
    "Olá, {corretor}! 😊 Só para você ficar por dentro: proposta da {empresa} ({operadora}) em análise, tudo caminhando.",
    "{corretor}, tudo bem? Proposta da {empresa} em análise na {operadora}. Qualquer retorno chega primeiro aqui e eu te repasso.",
    "Oi, {corretor}! A {operadora} recebeu e está analisando a proposta da {empresa}. Acompanho de perto.",
    "{corretor}, a análise da {empresa} pela {operadora} está em curso. Assim que tiver definição, aviso na mesma hora.",
    "Olá, {corretor}! Proposta da {empresa} ({operadora}) em análise. Estamos no aguardo do parecer.",
    "Oi, {corretor}, tudo bem? Seguimos aguardando a análise da {operadora} sobre a proposta da {empresa}.",
    "{corretor}! 😊 Novidade em breve: a proposta da {empresa} está em análise na {operadora}.",
    "Olá, {corretor}! A proposta da {empresa} pela {operadora} continua em análise. Te aviso assim que mudar de etapa.",
  ],

  cotacao: [
    "Olá, {corretor}! 😊 Estamos montando a cotação da {empresa} pela {operadora}. Em breve te envio os valores.",
    "{corretor}, tudo bem? A cotação da {empresa} ({operadora}) está sendo preparada. Já te retorno com os números.",
    "Oi, {corretor}! Já estou providenciando a cotação da {empresa} na {operadora}. Não demora.",
    "{corretor}, a cotação da {empresa} pela {operadora} está em andamento aqui. Qualquer detalhe que precisar ajustar, me fala.",
    "Olá, {corretor}! 😊 Trabalhando na cotação da {empresa} ({operadora}). Te mando assim que ficar pronta.",
    "Oi, {corretor}, tudo certo? Estou finalizando a cotação da {empresa} pela {operadora}.",
    "{corretor}! Cotação da {empresa} ({operadora}) em processo. Se tiver alguma condição especial, me avise.",
    "Olá, {corretor}! Estamos cotando a {empresa} na {operadora}. Em pouco tempo te retorno com os valores.",
    "{corretor}, tudo bem? A cotação da {empresa} pela {operadora} está sendo elaborada agora.",
    "Oi, {corretor}! 😊 Já iniciei a cotação da {empresa} ({operadora}). Te aviso quando estiver fechada.",
    "{corretor}, seguimos com a cotação da {empresa} na {operadora}. Qualquer dúvida, estou por aqui.",
    "Olá, {corretor}! A cotação da {empresa} pela {operadora} está quase pronta. Já te envio.",
    "Oi, {corretor}, tudo bem? Estou levantando os valores da {empresa} junto à {operadora}.",
    "{corretor}! 😊 Cotação da {empresa} ({operadora}) em preparação. Me diga se precisa de alguma simulação a mais.",
    "Olá, {corretor}! Estamos cuidando da cotação da {empresa} pela {operadora}. Retorno em breve.",
  ],

  enviada: [
    "Olá, {corretor}! 😊 A proposta da {empresa}, pela {operadora}, já foi enviada. Ficamos no aguardo do retorno do cliente.",
    "{corretor}, tudo bem? Proposta da {empresa} ({operadora}) enviada. Qualquer retorno do cliente, é só me avisar.",
    "Oi, {corretor}! Enviamos a proposta da {empresa} pela {operadora}. Aguardo o aceite para dar sequência.",
    "{corretor}, a proposta da {empresa} ({operadora}) está com o cliente. Assim que ele retornar, seguimos.",
    "Olá, {corretor}! 😊 Proposta da {empresa} enviada pela {operadora}. Fico no aguardo da assinatura.",
    "Oi, {corretor}, tudo certo? A proposta da {empresa} já seguiu para o cliente. {operadora} confirmada.",
    "{corretor}! A proposta da {empresa} pela {operadora} foi encaminhada. Precisa que eu reforce com o cliente?",
    "Olá, {corretor}! Enviada a proposta da {empresa} ({operadora}). Aguardando o retorno para prosseguir.",
    "{corretor}, tudo bem? Proposta da {empresa} na {operadora} enviada e aguardando aceite.",
    "Oi, {corretor}! 😊 Já mandamos a proposta da {empresa} pela {operadora}. Me avisa quando o cliente retornar.",
    "{corretor}, a proposta da {empresa} ({operadora}) está enviada. Qualquer ajuste que o cliente pedir, me chama.",
    "Olá, {corretor}! Proposta da {empresa} pela {operadora} encaminhada com sucesso. No aguardo.",
    "Oi, {corretor}, tudo bem? Proposta da {empresa} enviada ao cliente pela {operadora}. Seguimos aguardando.",
    "{corretor}! 😊 Enviamos a proposta da {empresa} ({operadora}). Assim que houver assinatura, damos andamento.",
    "Olá, {corretor}! A proposta da {empresa} pela {operadora} já está com o cliente para análise.",
  ],

  pendente: [
    "Olá, {corretor}! 😊 A proposta da {empresa}, pela {operadora}, está com uma pendência:\n\nPendência: {pendencia}\n\nAssim que puder nos enviar, damos sequência. Fico à disposição!",
    "{corretor}, tudo bem? Surgiu uma pendência na proposta da {empresa} ({operadora}):\n\nPendência: {pendencia}\n\nMe manda quando conseguir que eu já sigo com o processo. Qualquer dúvida, estou à disposição!",
    "Oi, {corretor}! Preciso da sua ajuda na proposta da {empresa}, {operadora}:\n\nPendência: {pendencia}\n\nCom isso em mãos eu destravo na hora. À disposição!",
    "{corretor}, a proposta da {empresa} ({operadora}) parou por conta de uma pendência:\n\nPendência: {pendencia}\n\nAssim que resolver, me avisa que retomo. Fico à disposição!",
    "Olá, {corretor}! 😊 Para seguir com a proposta da {empresa} pela {operadora}, falta:\n\nPendência: {pendencia}\n\nQualquer coisa que precisar, é só chamar. À disposição!",
    "Oi, {corretor}, tudo certo? A {operadora} gerou uma pendência na proposta da {empresa}:\n\nPendência: {pendencia}\n\nMe envia assim que possível que eu já regularizo. À disposição!",
    "{corretor}! A proposta da {empresa} ({operadora}) está aguardando um item:\n\nPendência: {pendencia}\n\nCom isso resolvido seguimos normalmente. Estou à disposição!",
    "Olá, {corretor}! Passando para pedir um retorno sobre a proposta da {empresa}, {operadora}:\n\nPendência: {pendencia}\n\nFico no aguardo e à disposição para ajudar!",
    "{corretor}, tudo bem? Identificamos uma pendência na proposta da {empresa} ({operadora}):\n\nPendência: {pendencia}\n\nMe retorna quando puder que damos continuidade. À disposição!",
    "Oi, {corretor}! 😊 A proposta da {empresa} pela {operadora} precisa de um complemento:\n\nPendência: {pendencia}\n\nAssim que chegar aqui eu sigo na mesma hora. À disposição!",
    "{corretor}, para não travar a proposta da {empresa} ({operadora}), preciso de:\n\nPendência: {pendencia}\n\nQualquer dificuldade, me fala que a gente resolve junto. À disposição!",
    "Olá, {corretor}! A {operadora} solicitou um item na proposta da {empresa}:\n\nPendência: {pendencia}\n\nFico no aguardo. À disposição para o que precisar!",
    "Oi, {corretor}, tudo bem? Segue a pendência da proposta da {empresa} ({operadora}):\n\nPendência: {pendencia}\n\nCom isso em mãos destravo o processo. À disposição!",
    "{corretor}! 😊 A proposta da {empresa} pela {operadora} está pendente de:\n\nPendência: {pendencia}\n\nMe avisa quando conseguir. Fico à disposição!",
    "Olá, {corretor}! Precisamos de um retorno para seguir com a {empresa} ({operadora}):\n\nPendência: {pendencia}\n\nQualquer dúvida sobre o que é necessário, é só me chamar. À disposição!",
  ],

  em_implantacao: [
    "Olá, {corretor}! 😊 A proposta da {empresa}, pela {operadora}, entrou em implantação. Já já sai o contrato!",
    "{corretor}, tudo bem? Boa notícia: a proposta da {empresa} ({operadora}) está em fase de implantação.",
    "Oi, {corretor}! A {empresa} passou para implantação na {operadora}. Estamos na reta final.",
    "{corretor}, a proposta da {empresa} pela {operadora} está sendo implantada. Te aviso assim que concluir.",
    "Olá, {corretor}! 😊 Implantação da {empresa} ({operadora}) em andamento. Falta pouco!",
    "Oi, {corretor}, tudo certo? A proposta da {empresa} entrou em implantação na {operadora}.",
    "{corretor}! Atualização positiva: a {empresa} está em implantação pela {operadora}.",
    "Olá, {corretor}! A proposta da {empresa} ({operadora}) avançou para implantação. Acompanho até o final.",
    "{corretor}, tudo bem? Estamos implantando a proposta da {empresa} na {operadora}. Em breve confirmo a conclusão.",
    "Oi, {corretor}! 😊 A {empresa} já está em implantação pela {operadora}. Reta final!",
    "{corretor}, a implantação da {empresa} ({operadora}) começou. Te retorno quando estiver tudo concluído.",
    "Olá, {corretor}! Proposta da {empresa} pela {operadora} em implantação. Seguimos acompanhando de perto.",
    "Oi, {corretor}, tudo bem? A {empresa} entrou na fase de implantação na {operadora}.",
    "{corretor}! 😊 Implantação da proposta da {empresa} ({operadora}) em processo. Aviso assim que finalizar.",
    "Olá, {corretor}! A proposta da {empresa} pela {operadora} está sendo implantada agora.",
  ],

  implantada: [
    "Olá, {corretor}! 😊 A proposta da {empresa}, pela {operadora}, foi implantada com sucesso. Ficamos à disposição para auxiliar no que precisar!",
    "{corretor}, tudo bem? 😊 Passando para avisar que a proposta da {empresa}, pela {operadora}, já foi implantada. Conte conosco para o que precisar!",
    "Oi, {corretor}! Ótima notícia: a {empresa} está implantada na {operadora}. Qualquer necessidade, é só chamar!",
    "{corretor}, implantação concluída! A proposta da {empresa} ({operadora}) está ativa. À disposição!",
    "Olá, {corretor}! 😊 Finalizamos a implantação da {empresa} pela {operadora}. Muito obrigado pela parceria!",
    "Oi, {corretor}, tudo certo? A proposta da {empresa} foi implantada na {operadora}. Estamos à disposição!",
    "{corretor}! Tudo certo com a {empresa}: implantada pela {operadora}. Qualquer dúvida, conte comigo.",
    "Olá, {corretor}! A implantação da {empresa} ({operadora}) foi concluída com sucesso. Obrigado pela confiança!",
    "{corretor}, tudo bem? 😊 A {empresa} já está implantada na {operadora}. À disposição para o que precisar!",
    "Oi, {corretor}! Concluímos a implantação da proposta da {empresa} pela {operadora}. Ótima parceria!",
    "{corretor}, a proposta da {empresa} ({operadora}) foi implantada. Fico à disposição para os próximos!",
    "Olá, {corretor}! 😊 Implantação da {empresa} finalizada na {operadora}. Sucesso e obrigado!",
    "Oi, {corretor}, tudo bem? A {empresa} está implantada pela {operadora}. Qualquer suporte, é só falar.",
    "{corretor}! 😊 A proposta da {empresa} ({operadora}) foi implantada com sucesso. Seguimos juntos!",
    "Olá, {corretor}! Confirmo a implantação da {empresa} pela {operadora}. Estamos à disposição!",
  ],

  cancelada: [
    "Olá, {corretor}! Infelizmente a proposta da {empresa}, pela {operadora}, não seguiu adiante. Se quiser, posso levantar outra opção para o cliente.",
    "{corretor}, tudo bem? A proposta da {empresa} ({operadora}) acabou sendo encerrada. Me avisa se quiser tentar por outra operadora.",
    "Oi, {corretor}! A proposta da {empresa} na {operadora} não foi adiante desta vez. Fico à disposição para uma nova tentativa.",
    "{corretor}, a proposta da {empresa} ({operadora}) foi cancelada. Se fizer sentido, montamos uma alternativa.",
    "Olá, {corretor}! Não conseguimos seguir com a {empresa} pela {operadora}. Estou à disposição para buscarmos outro caminho.",
    "Oi, {corretor}, tudo certo? A proposta da {empresa} foi encerrada na {operadora}. Qualquer coisa, conte comigo.",
    "{corretor}! A proposta da {empresa} ({operadora}) não avançou. Se quiser, refaço a cotação em outra operadora.",
    "Olá, {corretor}! Encerramos a proposta da {empresa} pela {operadora}. Sigo à disposição para os próximos casos.",
    "{corretor}, tudo bem? Infelizmente a {empresa} não seguiu na {operadora}. Posso apresentar outra opção?",
    "Oi, {corretor}! A proposta da {empresa} ({operadora}) foi cancelada. Estou aqui para o que precisar.",
    "{corretor}, a {empresa} não teve continuidade pela {operadora}. Me chama se quiser tentar de novo.",
    "Olá, {corretor}! A proposta da {empresa} na {operadora} foi encerrada. À disposição para uma nova proposta.",
    "Oi, {corretor}, tudo bem? Não deu certo com a {empresa} na {operadora} desta vez. Vamos para a próxima!",
    "{corretor}! A proposta da {empresa} ({operadora}) acabou não prosseguindo. Conte comigo para outras.",
    "Olá, {corretor}! Encerrada a proposta da {empresa} pela {operadora}. Fico à disposição para ajudar no que vier.",
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

    const inéditos = modelos.map((_, i) => i).filter((i) => !usados.includes(i));
    const candidatos = inéditos.length
      ? inéditos
      : modelos.map((_, i) => i).filter((i) => i !== usados[0]);   // não repete a última
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
