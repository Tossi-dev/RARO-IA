// O contrato entre o WhatsApp e o sistema — módulo NEUTRO.
//
// POR QUE UM CONTRATO, E NÃO CÓDIGO DE WHATSAPP ESPALHADO
// ------------------------------------------------------
// Existem dois caminhos possíveis para o WhatsApp, e o cliente já escolheu um
// deles hoje sabendo que pode trocar amanhã:
//
//   · agente local (não oficial, whatsapp-web.js/baileys rodando no Mac do
//     dono, ligado quando o notebook está aberto) — o escolhido agora;
//   · Cloud API oficial da Meta (sem servidor próprio, com custo por
//     mensagem de template).
//
// Os dois entregam a MESMA informação: uma mensagem, de quem, quando, em qual
// direção, com qual texto. Este arquivo escreve exatamente isso e mais nada.
// O CRM inteiro conversa com este contrato, nunca com o WhatsApp — é o que
// permite trocar o motor sem reescrever o CRM. Se um dia entrar Instagram
// Direct ou Telegram, entram por aqui também.
//
// A REGRA QUE VEM DO CRM DE MERCADO QUE ESTUDAMOS
// -----------------------------------------------
// Nada aqui carrega interpretação: não existe campo "intenção do cliente",
// "temperatura do lead" nem nota de confiança. Só fato observado. Quem
// interpreta é outra camada, e a interpretação fica marcada como tal — nunca
// misturada com o que de fato aconteceu.

/** De onde a mensagem veio. Guardado em cada interação para o histórico
 *  continuar legível depois de uma eventual troca de motor. */
export type CanalAtendimento = "whatsapp";

/** Quem falou. */
export type DirecaoMensagem = "recebida" | "enviada";

/**
 * Uma mensagem, como o agente local a entrega ao sistema.
 *
 * `idExterno` é o identificador que o próprio WhatsApp dá à mensagem. É ele
 * que impede a mesma mensagem de virar duas interações quando o agente
 * reconecta e re-sincroniza o que ficou para trás — cenário garantido no
 * desenho escolhido, em que o notebook fica fechado por horas.
 */
export interface MensagemRecebida {
  idExterno: string;
  canal: CanalAtendimento;
  direcao: DirecaoMensagem;
  /** Telefone da OUTRA ponta (o cliente), em qualquer escrita. */
  telefone: string;
  /** Nome que aparece na agenda do WhatsApp, quando houver. Só referência. */
  nomeExibicao: string;
  /** Texto puro. Mídia sem legenda chega vazia — ver `tipoMidia`. */
  texto: string;
  /** ISO datetime do momento em que a mensagem existiu no WhatsApp. */
  quando: string;
  /** "texto", "audio", "imagem", "documento"… vazio quando é só texto. */
  tipoMidia: string;
}

/** O lote que o agente local envia de uma vez. */
export interface LoteMensagens {
  mensagens: MensagemRecebida[];
}

/** Uma mensagem que o sistema quer que o agente local envie. */
export interface EnvioPendente {
  id: string;
  telefone: string;
  texto: string;
  /** Quem autorizou o envio, e quando — envio nunca é anônimo. */
  autorizadoPor: string;
  autorizadoEm: string;
}

/** O que o agente local responde depois de tentar enviar. */
export interface ResultadoEnvio {
  id: string;
  enviado: boolean;
  /** Preenchido só quando `enviado` é falso. */
  erro?: string;
  /** Id que o WhatsApp deu à mensagem enviada, quando deu certo. */
  idExterno?: string;
}

/**
 * Sinal de vida do agente local. O sistema usa para dizer, na tela, se o
 * WhatsApp está ligado agora — e é uma informação que o dono PRECISA ver:
 * no desenho escolhido o WhatsApp só funciona com o notebook aberto, e uma
 * tela que finge estar conectada quando não está é pior que tela nenhuma.
 */
export interface PulsoAgente {
  /** ISO datetime da última vez que o agente falou com o sistema. */
  visto: string;
  /** O agente conseguiu abrir a sessão do WhatsApp? */
  sessaoAberta: boolean;
  /** Quando a sessão caiu e precisa de QR de novo, isto vem preenchido. */
  precisaQr: boolean;
  versao: string;

  /**
   * O conteúdo do QR Code que o WhatsApp está pedindo agora, quando há um.
   *
   * POR QUE O QR SOBE ATÉ O SERVIDOR
   * --------------------------------
   * Sem isto, conectar o WhatsApp exigia abrir um terminal no Mac do dono e
   * ler o QR ali. Isso funciona para quem programa e trava todo mundo mais.
   * Subindo a string, a tela do CRM desenha o QR e a pessoa aponta o celular
   * para a própria tela onde ela já está trabalhando.
   *
   * O QUE ISSO EXIGE, E ESTÁ RESOLVIDO
   * ----------------------------------
   * Quem lê este QR ganha a sessão de WhatsApp do dono. Por isso ele só
   * trafega para dentro do sistema (que já exige senha para abrir), NUNCA é
   * gravado em planilha nem em banco, e vence sozinho em segundos — ver
   * `QR_VALIDO_SEGUNDOS` em ./pulso.ts. QR vencido desenhado na tela é pior
   * que QR nenhum: a pessoa aponta o celular, não funciona, e conclui que o
   * sistema está quebrado.
   *
   * O WhatsApp troca o QR a cada 20 segundos mais ou menos, então o agente
   * bate ponto muito mais rápido enquanto está esperando leitura.
   */
  qr?: string;
}

/**
 * Limpa e valida uma mensagem vinda de fora. Devolve `null` para o que não
 * pode virar interação — e cada motivo tem uma razão de negócio:
 *
 *   · sem id externo  -> não dá para impedir duplicata na re-sincronização;
 *   · sem telefone    -> mensagem de grupo ou de origem irreconhecível, que
 *                        não pertence à ficha de nenhum cliente;
 *   · sem data válida -> interação sem quando não entra em linha do tempo.
 *
 * Mensagem vazia de texto NÃO é descartada: áudio e imagem são interação
 * legítima, e o histórico precisa registrar que houve contato.
 */
export function normalizarMensagem(bruta: unknown): MensagemRecebida | null {
  if (!bruta || typeof bruta !== "object") return null;
  const m = bruta as Record<string, unknown>;

  const idExterno = texto(m.idExterno).trim();
  if (idExterno === "") return null;

  const telefone = texto(m.telefone).trim();
  if (telefone === "") return null;

  const quando = texto(m.quando).trim();
  if (!dataValida(quando)) return null;

  const direcao: DirecaoMensagem = m.direcao === "enviada" ? "enviada" : "recebida";

  return {
    idExterno,
    canal: "whatsapp",
    direcao,
    telefone,
    nomeExibicao: texto(m.nomeExibicao).trim().slice(0, 120),
    // Teto de tamanho: mensagem de WhatsApp cabe em 4096 caracteres, e célula
    // de planilha estoura muito antes disso. Cortar é melhor que a gravação
    // falhar e a interação inteira se perder.
    texto: texto(m.texto).slice(0, 4000),
    quando,
    tipoMidia: texto(m.tipoMidia).trim().slice(0, 24),
  };
}

function texto(v: unknown): string {
  return typeof v === "string" ? v : v === undefined || v === null ? "" : String(v);
}

function dataValida(iso: string): boolean {
  if (iso === "") return false;
  const t = Date.parse(iso);
  return Number.isFinite(t);
}

/** Normaliza um lote inteiro, descartando em silêncio o que não presta e
 *  dizendo quantas foram descartadas — número que a tela mostra, porque
 *  descarte invisível vira "sumiu mensagem" sem explicação. */
export function normalizarLote(bruto: unknown): {
  mensagens: MensagemRecebida[];
  descartadas: number;
} {
  const lista = Array.isArray((bruto as { mensagens?: unknown })?.mensagens)
    ? ((bruto as { mensagens: unknown[] }).mensagens as unknown[])
    : [];
  const mensagens: MensagemRecebida[] = [];
  let descartadas = 0;
  for (const item of lista) {
    const m = normalizarMensagem(item);
    if (m) mensagens.push(m);
    else descartadas++;
  }
  return { mensagens, descartadas };
}
