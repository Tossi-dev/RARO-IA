// O sinal de vida do agente local — guardado na MEMÓRIA do processo, de propósito.
//
// POR QUE ISTO NÃO VIRA ABA NEM TABELA
// ------------------------------------
// O pulso responde uma única pergunta: "o WhatsApp do dono está ligado AGORA?".
// A resposta só vale por alguns minutos. O agente bate aqui de tempos em tempos
// enquanto o notebook está aberto; persistir cada batida escreveria centenas de
// linhas por dia numa planilha para representar um estado que nunca precisa ser
// lido depois de amanhã.
//
// O PREÇO, ASSUMIDO: servidor reiniciado esquece o pulso e a tela passa a dizer
// "sem sinal" até o agente bater de novo. Isso é uma resposta honesta — sem o
// pulso, o sistema realmente não sabe se o WhatsApp está de pé. O erro grave
// seria o contrário: uma tela afirmando "conectado" apoiada num registro velho
// de banco, com o notebook fechado desde ontem.

import type { PulsoAgente } from "./contrato";

/** Depois de tantos minutos sem bater, o pulso deixa de valer como "ligado agora". */
export const PULSO_VALIDO_MINUTOS = 5;

/**
 * O QR vence MUITO mais rápido que o pulso, e por outro motivo: o WhatsApp
 * troca o código a cada vinte e poucos segundos. Mostrar um QR vencido é pior
 * que não mostrar nenhum — a pessoa aponta o celular, nada acontece, e a
 * conclusão dela é que o sistema não funciona.
 */
export const QR_VALIDO_SEGUNDOS = 45;

let ultimo: PulsoAgente | null = null;

export function registrarPulso(p: PulsoAgente): void {
  ultimo = p;
}

/** O último pulso recebido, ou `null` quando o agente nunca falou com este processo. */
export function lerPulso(): PulsoAgente | null {
  return ultimo;
}

export interface EstadoDoAgente {
  /** O WhatsApp está de pé neste instante? Só é verdadeiro com pulso recente E sessão aberta. */
  ligado: boolean;
  /** O QR de agora, se houver um válido. Nunca um vencido. */
  qr: string | null;
  /** Minutos desde a última batida; `null` quando nunca houve nenhuma. */
  minutosDesdeUltimoPulso: number | null;
  precisaQr: boolean;
  visto: string;
  versao: string;
}

/**
 * O estado que a tela mostra.
 *
 * A validade por tempo é o que impede a mentira mais provável deste desenho: o
 * notebook fecha no meio da noite e o último pulso fica dizendo `sessaoAberta:
 * true` para sempre. Sem o corte, a tela afirmaria "conectado" enquanto nenhuma
 * mensagem sai há horas.
 */
export function estadoDoAgente(agora: Date): EstadoDoAgente {
  if (!ultimo) {
    return {
      ligado: false,
      qr: null,
      minutosDesdeUltimoPulso: null,
      precisaQr: false,
      visto: "",
      versao: "",
    };
  }

  const t = Date.parse(ultimo.visto);
  const minutos = Number.isFinite(t)
    ? Math.max(0, Math.floor((agora.getTime() - t) / 60000))
    : null;
  const recente = minutos !== null && minutos <= PULSO_VALIDO_MINUTOS;

  // O QR tem relógio próprio, e mais curto: ele é medido em SEGUNDOS desde a
  // batida, não em minutos. Um pulso de dois minutos atrás ainda vale para
  // dizer "o agente está vivo", e já não vale nada para desenhar um QR que o
  // WhatsApp trocou quatro vezes nesse meio tempo.
  const segundos = Number.isFinite(t) ? (agora.getTime() - t) / 1000 : Number.POSITIVE_INFINITY;
  const qr =
    ultimo.qr && ultimo.qr.trim() !== "" && segundos <= QR_VALIDO_SEGUNDOS ? ultimo.qr : null;

  return {
    ligado: recente && ultimo.sessaoAberta,
    qr,
    minutosDesdeUltimoPulso: minutos,
    precisaQr: ultimo.precisaQr,
    visto: ultimo.visto,
    versao: ultimo.versao,
  };
}

/** Só para teste: zera o estado entre casos, que de outro modo vazaria entre eles. */
export function esquecerPulso(): void {
  ultimo = null;
}
