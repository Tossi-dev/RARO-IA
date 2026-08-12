// Do formato da biblioteca para o contrato do CRM.
//
// POR QUE A TRADUCAO MORA SOZINHA, LONGE DA BIBLIOTECA
// ----------------------------------------------------
// whatsapp-web.js e um cliente NAO OFICIAL: ele acompanha o WhatsApp Web, que
// muda sem aviso. Quando mudar, o estrago tem que caber num arquivo so. Este e
// o arquivo. Tudo aqui e funcao pura sobre objeto simples — da para testar o
// comportamento inteiro sem abrir navegador nenhum, que e justamente o que a
// gente nao consegue fazer com a biblioteca de verdade.
//
// A LEITURA E DEFENSIVA DE PROPOSITO
// ----------------------------------
// Cada campo e lido com `?.` e com alternativa. Nao e paranoia decorativa: a
// mesma versao da biblioteca entrega mensagem de aparelho velho, de canal, de
// contato apagado, de status — e um `TypeError` aqui derruba o listener e o
// dono perde as mensagens seguintes sem perceber. Mensagem que nao da para
// entender vira `null` e e contada; nunca excecao.

import { telefoneDoJid } from "./telefone.js";

/** Teto do contrato — cortar é melhor que a gravação inteira falhar. */
const LIMITE_TEXTO = 4000;

/**
 * O `type` da biblioteca traduzido para o vocabulário do contrato.
 *
 * "chat" vira string vazia porque o contrato pede vazio quando é só texto.
 * "ptt" é o áudio gravado na hora (push to talk) e vira "audio" junto com o
 * áudio anexado: para o histórico do dono os dois são a mesma coisa.
 */
const TIPOS = {
  chat: "",
  text: "",
  image: "imagem",
  video: "video",
  audio: "audio",
  ptt: "audio",
  document: "documento",
  sticker: "figurinha",
  location: "localizacao",
  vcard: "contato",
  multi_vcard: "contato",
};

function comoTexto(v) {
  return typeof v === "string" ? v : v === undefined || v === null ? "" : String(v);
}

/**
 * O id que o WhatsApp deu à mensagem.
 *
 * É o campo que impede a mesma mensagem de virar duas interações quando o
 * agente reconecta e varre o histórico de novo — cenário garantido aqui, já que
 * o notebook fica fechado por horas. Sem id, a mensagem não pode subir: o
 * servidor não teria como deduplicar e o histórico encheria de repetição.
 */
function idDaMensagem(msg) {
  const id = msg?.id;
  if (typeof id === "string") return id.trim();
  const serial = comoTexto(id?._serialized).trim();
  if (serial !== "") return serial;
  // Algumas versões expõem só as partes; remontar é melhor que descartar.
  const partes = [id?.remote, id?.fromMe, id?.id].map(comoTexto).filter((p) => p !== "");
  return partes.length === 3 ? partes.join("_") : "";
}

/**
 * O identificador da OUTRA ponta da conversa.
 *
 * Quando a mensagem é do dono, a outra ponta é o destino (`to`); quando é do
 * cliente, é a origem (`from`). Trocar os dois arquivaria a conversa na ficha
 * do próprio dono — erro que só aparece semanas depois, com o histórico já
 * embaralhado.
 */
function jidDaOutraPonta(msg) {
  const ehMinha = msg?.fromMe === true;
  const candidatos = ehMinha
    ? [msg?.to, msg?.chatId, msg?.id?.remote]
    : [msg?.from, msg?.chatId, msg?.id?.remote];
  for (const c of candidatos) {
    const s = comoTexto(c).trim();
    if (s !== "") return s;
  }
  return "";
}

/**
 * O `timestamp` da biblioteca vem em SEGUNDOS desde 1970 (não milissegundos).
 * Multiplicar errado joga toda a conversa para 1970 e some da linha do tempo,
 * então a conversão é explícita e o valor implausível é recusado.
 */
function quandoISO(msg) {
  const bruto = Number(msg?.timestamp);
  if (!Number.isFinite(bruto) || bruto <= 0) return "";
  // Corte de sanidade: antes de 2009 não existia WhatsApp, e data no futuro
  // distante é relógio quebrado. Nos dois casos é melhor descartar a mensagem
  // do que apodrecer a linha do tempo do cliente.
  const ms = bruto * 1000;
  const ano = new Date(ms).getUTCFullYear();
  if (!Number.isFinite(ano) || ano < 2009 || ano > 2100) return "";
  return new Date(ms).toISOString();
}

/**
 * Converte uma mensagem da biblioteca em `MensagemRecebida` do contrato, ou
 * devolve `null` quando ela não pode virar histórico de ninguém.
 *
 * `nomeExibicao` chega de fora porque na biblioteca o nome do contato é uma
 * chamada assíncrona (`getContact()`), e função pura não espera rede. Quem
 * chama resolve o nome antes; sem nome, o contrato aceita vazio.
 */
export function mensagemParaContrato(msg, opcoes = {}) {
  if (!msg || typeof msg !== "object") return null;

  // Status ("recado" de 24h) não é conversa com ninguém: entra no histórico
  // como interação falsa e polui a temperatura do lead.
  if (msg.isStatus === true) return null;

  const idExterno = idDaMensagem(msg);
  if (idExterno === "") return null;

  // Grupo é descartado na ORIGEM, aqui, e não no servidor: mandar para depois
  // jogar fora gasta rede do dono e enche o log de descarte todo dia.
  // O telefone resolvido por FORA tem precedência sobre o endereço da
  // mensagem. Isto existe por causa do `@lid`: o WhatsApp passou a endereçar
  // conversas por um identificador interno que NÃO é telefone
  // ("209876543210987@lid"), e nesse formato não há como dizer de quem é a
  // mensagem — ela era descartada como "não pertence a um cliente". Quem
  // consegue traduzir isso é a biblioteca, com uma ida ao navegador
  // (`chat.getContact()`), e ida ao navegador é assíncrona: por isso o valor
  // chega pronto por parâmetro, do mesmo jeito que o nome de exibição.
  const telefone =
    comoTexto(opcoes.telefone ?? msg._telefoneContraparte).trim() !== ""
      ? telefoneDoJid(comoTexto(opcoes.telefone ?? msg._telefoneContraparte).trim())
      : telefoneDoJid(jidDaOutraPonta(msg));
  if (telefone === "") return null;

  const quando = quandoISO(msg);
  if (quando === "") return null;

  const tipoBruto = comoTexto(msg.type).trim();
  const tipoMidia = tipoBruto in TIPOS ? TIPOS[tipoBruto] : tipoBruto.slice(0, 24);

  return {
    idExterno,
    canal: "whatsapp",
    direcao: msg.fromMe === true ? "enviada" : "recebida",
    telefone,
    nomeExibicao: comoTexto(opcoes.nomeExibicao ?? msg._nomeExibicao ?? msg.notifyName)
      .trim()
      .slice(0, 120),
    // Mídia sem legenda chega com texto vazio, e isso é correto: o contrato
    // guarda o contato que houve, e `tipoMidia` conta o que foi.
    texto: comoTexto(msg.body).slice(0, LIMITE_TEXTO),
    quando,
    tipoMidia,
  };
}

/**
 * Converte uma leva inteira, dizendo quantas caíram fora.
 *
 * O número de descartadas vai para o log porque descarte invisível vira
 * "sumiu mensagem" sem explicação — e é a primeira coisa que o dono pergunta.
 */
export function loteParaContrato(mensagens, resolverNome = () => "") {
  const saida = [];
  let descartadas = 0;
  for (const bruta of Array.isArray(mensagens) ? mensagens : []) {
    const convertida = mensagemParaContrato(bruta, { nomeExibicao: resolverNome(bruta) });
    if (convertida) saida.push(convertida);
    else descartadas++;
  }
  return { mensagens: saida, descartadas };
}
