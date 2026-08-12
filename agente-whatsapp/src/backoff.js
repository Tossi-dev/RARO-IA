// Quanto esperar antes de tentar de novo.
//
// POR QUE NAO E SO "TENTA DE NOVO EM 30 SEGUNDOS"
// -----------------------------------------------
// A falha tipica aqui e o dono fechar a tampa do notebook, entrar no aviao ou
// pegar um wi-fi de hotel. Isso dura minutos ou horas, nao segundos. Repetir a
// cada 30 segundos durante quatro horas sao 480 tentativas que so gastam
// bateria e enchem o log — e, se o servidor estiver com problema, sao 480
// requisicoes ajudando a manter o problema de pe.
//
// Por outro lado o teto e obrigatorio: sem ele, a espera dobra ate virar horas,
// e a internet volta as 9h enquanto o agente so acorda as 14h. O teto garante
// que, com a rede de volta, o pior atraso e de alguns minutos.

/** Primeira espera. Curta porque a maioria das falhas é o wi-fi piscando. */
export const BACKOFF_BASE_MS = 5_000;

/** Teto da espera: 5 minutos. Acima disso o agente parece morto. */
export const BACKOFF_TETO_MS = 5 * 60 * 1000;

/**
 * Quanto do atraso é sorteado. Existe porque, quando a internet do prédio cai
 * e volta, tudo que ficou esperando tenta no mesmo milissegundo — e aqui há
 * quatro laços (mensagens, fila, resultados, pulso) que sincronizariam sozinhos
 * e bateriam juntos no servidor.
 */
export const BACKOFF_TREMOR = 0.2;

/**
 * A espera da enésima falha consecutiva (1 é a primeira).
 *
 * O sorteio entra por parâmetro para o teste conseguir prever o resultado —
 * função que chama `Math.random()` por dentro só dá para testar por faixa, e
 * faixa é o tipo de teste que passa com o cálculo errado.
 */
export function atrasoDoBackoff(tentativa, opcoes = {}) {
  const base = opcoes.baseMs ?? BACKOFF_BASE_MS;
  const teto = opcoes.tetoMs ?? BACKOFF_TETO_MS;
  const tremor = opcoes.tremor ?? BACKOFF_TREMOR;
  const sorteio = opcoes.sorteio ?? Math.random;

  const n = Math.max(1, Math.floor(Number(tentativa) || 1));
  // Expoente limitado antes da potência: 2^1000 é Infinity, e Infinity * 0.2
  // vira NaN, que como atraso significa "tenta imediatamente para sempre".
  const expoente = Math.min(n - 1, 30);
  const cru = Math.min(base * 2 ** expoente, teto);

  // O tremor só encurta, nunca alonga: assim o teto continua sendo teto de
  // verdade e ninguém precisa raciocinar sobre "teto mais 20%".
  return Math.round(cru * (1 - tremor * sorteio()));
}

/**
 * Contador de falhas consecutivas de um mesmo laço.
 *
 * Cada laço tem o seu: a fila de envio falhar não é motivo para o pulso parar
 * de bater — e é justamente durante a falha que a tela do dono mais precisa
 * saber o que está acontecendo.
 */
export class Recuo {
  constructor(opcoes = {}) {
    this.opcoes = opcoes;
    this.tentativas = 0;
  }

  /** Deu certo: a próxima falha volta a esperar pouco. */
  zerar() {
    this.tentativas = 0;
  }

  /** Deu errado: devolve quanto esperar antes da próxima tentativa. */
  falhou() {
    this.tentativas += 1;
    return atrasoDoBackoff(this.tentativas, this.opcoes);
  }

  get emFalha() {
    return this.tentativas > 0;
  }
}
