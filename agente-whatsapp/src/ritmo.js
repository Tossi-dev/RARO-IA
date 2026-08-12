// O freio de mao do envio.
//
// POR QUE UM PROGRAMA QUE PODE ENVIAR RAPIDO E PROIBIDO DE ENVIAR RAPIDO
// ----------------------------------------------------------------------
// Este agente usa um cliente NAO OFICIAL do WhatsApp. O numero do dono e o
// numero pessoal dele, o mesmo que ele usa para tudo. O comportamento que faz o
// WhatsApp banir um numero nao e "usar biblioteca": e disparo em rajada, varias
// mensagens em segundos, para gente que nao respondeu. A propria documentacao
// do OpenWA avisa disso e recomenda intervalo entre envios.
//
// Entao o limite existe para proteger o ATIVO do cliente, nao para agradar
// especificacao. Se um dia alguem achar o agente lento, o caminho e conversar
// sobre a API oficial da Meta — nunca afrouxar estes numeros no susto.
//
// Os dois limites sao complementares e os dois valem ao mesmo tempo:
//   · o intervalo evita a rajada curta (dez mensagens em dez segundos);
//   · o teto por hora evita a rajada longa (uma a cada vinte segundos durante
//     a tarde inteira, que soma 180 mensagens e parece robo — porque e).

/** Espaço mínimo entre duas mensagens: uma a cada 20 segundos. */
export const INTERVALO_MINIMO_MS = 20_000;

/** Teto por hora corrida: 30 mensagens. Vale junto com o intervalo acima. */
export const MAXIMO_POR_HORA = 30;

/** A janela do teto: uma hora deslizante, não "de hora em hora". */
export const JANELA_HORA_MS = 60 * 60 * 1000;

/**
 * Guarda o histórico de envios e responde uma pergunta só: posso mandar agora?
 *
 * O relógio entra por parâmetro (e não por `Date.now()` interno) para o teste
 * conseguir viajar no tempo. Um limitador que só dá para testar esperando uma
 * hora de verdade é um limitador que ninguém testa.
 */
export class LimitadorDeRitmo {
  constructor(opcoes = {}) {
    this.intervaloMs = opcoes.intervaloMs ?? INTERVALO_MINIMO_MS;
    this.maximoPorHora = opcoes.maximoPorHora ?? MAXIMO_POR_HORA;
    this.janelaMs = opcoes.janelaMs ?? JANELA_HORA_MS;
    /** Instantes dos envios recentes, do mais antigo para o mais novo. */
    this.envios = [];
  }

  /**
   * Reidrata o histórico depois de um reinício.
   *
   * Sem isto, fechar e abrir o notebook zeraria o teto por hora — e o jeito
   * mais fácil de furar o limite seria justamente reiniciar o programa, que é
   * o que acontece toda vez que a tampa fecha.
   */
  restaurar(instantes, agora = Date.now()) {
    this.envios = (Array.isArray(instantes) ? instantes : [])
      .map((t) => (typeof t === "number" ? t : Date.parse(t)))
      .filter((t) => Number.isFinite(t) && t <= agora)
      .sort((a, b) => a - b);
    this.limpar(agora);
  }

  /** O histórico que vale a pena persistir: só o que ainda pesa na janela. */
  paraGuardar(agora = Date.now()) {
    this.limpar(agora);
    return [...this.envios];
  }

  limpar(agora) {
    const corte = agora - this.janelaMs;
    this.envios = this.envios.filter((t) => t > corte);
  }

  /**
   * Quantos milissegundos faltam para poder enviar. Zero significa "agora".
   *
   * Devolver a espera (em vez de só `true`/`false`) deixa quem chama dormir
   * exatamente o necessário, em vez de acordar de segundo em segundo para
   * perguntar de novo — no notebook do dono isso é bateria.
   */
  esperaMs(agora = Date.now()) {
    this.limpar(agora);

    const ultimo = this.envios[this.envios.length - 1];
    const porIntervalo = ultimo === undefined ? 0 : ultimo + this.intervaloMs - agora;

    // Quando a janela está cheia, o próximo envio só libera quando a mensagem
    // mais antiga sair dela — não quando o intervalo curto vencer.
    const porHora =
      this.envios.length >= this.maximoPorHora ? this.envios[0] + this.janelaMs - agora : 0;

    return Math.max(0, porIntervalo, porHora);
  }

  podeEnviar(agora = Date.now()) {
    return this.esperaMs(agora) === 0;
  }

  /**
   * Marca que uma mensagem saiu. Chamado DEPOIS do envio, e mesmo quando o
   * envio falha: uma tentativa recusada pelo WhatsApp também consumiu o
   * comportamento que o limite quer conter.
   */
  registrar(agora = Date.now()) {
    this.envios.push(agora);
    this.limpar(agora);
  }
}
