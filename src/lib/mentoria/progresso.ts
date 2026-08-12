// Cálculo puro do progresso de uma matrícula ("sessão 8 de 12") e das
// perguntas de agenda que dependem de "agora" (próxima sessão, última
// sessão dada, dias de silêncio). Módulo PURO: nada de Next, nada de banco.
//
// `agoraIso` É SEMPRE PARÂMETRO, NUNCA `new Date()`/`Date.now()` AQUI DENTRO.
// Se o "agora" nascesse dentro da função, o resultado mudaria a cada
// execução e o teste ficaria refém do relógio da máquina que roda o CI —
// um teste escrito hoje quebraria sozinho daqui a um ano sem ninguém ter
// tocado no código. Quem sabe que horas são é a camada que chama este
// módulo (rota, cron, teste); esta função só compara datas que recebe.
//
// A view `matricula_progresso` do 0006 já faz uma versão deste cálculo em
// SQL (contagem de sessões realizadas). Este módulo não a substitui — ele
// serve às telas que já têm a lista de sessões em memória (ex.: depois de
// buscar sessões e matrícula juntas numa única ida ao banco) e evita um
// round-trip extra só para reler o percentual.

import type { Matricula, Programa, Sessao } from "./tipos";

// Todas as funções abaixo recebem `readonly Sessao[]`, não `Sessao[]`: é o
// TypeScript reforçando em tempo de compilação a regra "nunca mutar o array
// recebido" (nada de `.sort()` direto nele) — um array congelado
// (`Object.freeze`) só tipa como `readonly Sessao[]`, e se alguma função
// tentasse ordenar in-place o `tsc` já acusaria antes do teste precisar
// rodar.

export interface ProgressoMatricula {
  realizadas: number;
  /** `null` = pacote aberto (turma/online contínua, sem número fixo negociado). */
  previstas: number | null;
  /** "sessão 8 de 12" quando há pacote; "8 sessões realizadas" quando é aberto. */
  rotulo: string;
  /** `null` quando `previstas` é `null` — nunca um número inventado. */
  percentual: number | null;
  /** `true` quando o mentor deu sessões além do pacote (cortesia) — caso real, não erro de dado. */
  excedeu: boolean;
}

/**
 * `Date.parse` de `sessao.quando` só se o resultado for um número finito.
 * `sessao.quando` é `timestamptz not null` no banco, mas nada nesta camada
 * garante isso em runtime (dado de teste, dado de migração incompleta, JSON
 * mal formado) — string vazia e string não-data devolvem `NaN`, e um `NaN`
 * vazando para uma comparação (`<`, `>`) silenciosamente derrubaria a
 * ordenação de "próxima sessão" ou "última sessão" sem lançar erro nenhum
 * (é assim que apareceria um "próxima sessão" errado em produção, sem
 * ninguém notar). Por isso a sessão com data inválida é ignorada pelos
 * cálculos de ordem, nunca deixada quebrar a comparação por dentro.
 */
function quandoValido(sessao: Sessao): number | null {
  if (!sessao.quando) return null;
  const t = Date.parse(sessao.quando);
  return Number.isFinite(t) ? t : null;
}

/**
 * Progresso de uma matrícula dentro do programa.
 *
 * REGRA 1 — de onde vem `previstas`: primeiro `matricula.sessoesPrevistas`;
 * só cai para `programa.totalSessoes` quando a matrícula não diz nada.
 * Existe porque duas pessoas no mesmo programa individual podem ter
 * negociado pacotes de tamanhos diferentes (ver comentário de
 * `Matricula.sessoesPrevistas` em `tipos.ts`).
 *
 * REGRA 2 — `realizadas` conta SÓ sessões com `status === "realizada"`.
 * Agendada ainda não aconteceu; faltou e cancelada não geraram entrega —
 * nenhuma das três é "sessão dada".
 *
 * REGRA 3 — NUNCA INVENTAR DENOMINADOR: se `previstas` é `null` (pacote
 * aberto), `percentual` é `null` e o rótulo não menciona "de X" — usar o
 * total de sessões CADASTRADAS como se fosse o pacote contratado inventaria
 * um número que ninguém negociou.
 *
 * REGRA 4 — `excedeu`: `realizadas > previstas` é um caso real (sessões de
 * cortesia). `percentual` fica limitado a 100 (não faz sentido mostrar
 * "140% concluído"), mas `excedeu` avisa a tela para mostrar o número real
 * no rótulo ("sessão 14 de 12"), não para escondê-lo.
 *
 * REGRA 5 — `percentual` é inteiro arredondado, e nunca negativo: com
 * `previstas` já saneado pela regra 5b (sempre `null` ou um inteiro > 0),
 * a divisão nunca some por zero nem produz `Infinity`/`NaN` — mas o
 * `Math.max(0, …)` fica explícito mesmo assim, porque "percentual nunca
 * negativo" é uma garantia deste contrato, não um acidente de quem hoje
 * chama esta função com `realizadas` sempre >= 0.
 *
 * REGRA 5b — `matricula.sessoes_previstas` é `int` no Postgres, SEM CHECK
 * de que seja positivo (0006). Um valor `<= 0` ali (dado ruim: digitação
 * errada, migração incompleta, script de importação) não é "um pacote de
 * zero sessões" — pacote nenhum tem zero ou menos sessões, isso é a
 * ausência de um pacote fechado disfarçada de número. Por isso `<= 0` é
 * tratado EXATAMENTE como `null` (ausência): `previstasValida` descarta o
 * valor ruim e a cascata da REGRA 1 segue adiante para `programa.totalSessoes`
 * como se `matricula.sessoesPrevistas` nunca tivesse sido informado. Se
 * nenhum dos dois lados sobrar um número > 0, o pacote é aberto — e a tela
 * diz "8 sessões realizadas" em vez de inventar um denominador (ou pior,
 * um percentual negativo/zero contraditório com sessões já dadas).
 */
function previstasValida(valor: number | null | undefined): number | null {
  return valor !== null && valor !== undefined && valor > 0 ? valor : null;
}

export function progressoDe(
  matricula: Matricula,
  programa: Programa | null,
  sessoes: readonly Sessao[],
): ProgressoMatricula {
  const realizadas = sessoes.filter((s) => s.status === "realizada").length;

  const previstas = previstasValida(matricula.sessoesPrevistas) ?? previstasValida(programa?.totalSessoes ?? null);

  const excedeu = previstas !== null && realizadas > previstas;

  const percentual =
    previstas === null ? null : Math.max(0, Math.min(100, Math.round((realizadas / previstas) * 100)));

  const rotulo = previstas === null ? `${realizadas} sessões realizadas` : `sessão ${realizadas} de ${previstas}`;

  return { realizadas, previstas, rotulo, percentual, excedeu };
}

/**
 * A sessão "agendada" mais próxima no futuro (ou agora), empate resolvido
 * pela mais antiga entre as empatadas.
 *
 * REGRA 6 — uma sessão "agendada" cujo horário já passou é o mentor tendo
 * esquecido de dar baixa (marcar como realizada/faltou) — não deixa de
 * estar tecnicamente "agendada" no banco, mas mostrá-la como "a próxima
 * sessão" empurraria uma sessão do passado para a tela de agenda futura.
 * Por isso só entram candidatas com `quando >= agora`.
 */
export function proximaSessao(sessoes: readonly Sessao[], agoraIso: string): Sessao | null {
  const agora = Date.parse(agoraIso);
  if (!Number.isFinite(agora)) return null;

  let escolhida: Sessao | null = null;
  let escolhidaQuando = Infinity;

  for (const sessao of sessoes) {
    if (sessao.status !== "agendada") continue;
    const quando = quandoValido(sessao);
    if (quando === null || quando < agora) continue;
    if (quando < escolhidaQuando) {
      escolhida = sessao;
      escolhidaQuando = quando;
    }
  }

  return escolhida;
}

/**
 * A sessão "realizada" mais recente, independente da ordem de entrada da
 * lista (regra 7 — não confiar em ordem implícita, a fonte pode vir de
 * qualquer query).
 */
export function ultimaSessaoRealizada(sessoes: readonly Sessao[]): Sessao | null {
  let escolhida: Sessao | null = null;
  let escolhidaQuando = -Infinity;

  for (const sessao of sessoes) {
    if (sessao.status !== "realizada") continue;
    const quando = quandoValido(sessao);
    if (quando === null) continue;
    if (quando > escolhidaQuando) {
      escolhida = sessao;
      escolhidaQuando = quando;
    }
  }

  return escolhida;
}

/**
 * Dias corridos entre a última sessão realizada e `agoraIso`. `null` quando
 * não há nenhuma sessão realizada com data válida, ou quando `agoraIso` em
 * si é inválido — sem os dois lados, não existe intervalo para calcular.
 */
export function diasDesdeUltimaSessao(sessoes: readonly Sessao[], agoraIso: string): number | null {
  const ultima = ultimaSessaoRealizada(sessoes);
  if (!ultima) return null;

  const agora = Date.parse(agoraIso);
  if (!Number.isFinite(agora)) return null;

  const quando = quandoValido(ultima);
  if (quando === null) return null; // defensivo: ultimaSessaoRealizada já garante isso, mas não custa não confiar cegamente

  const umDiaMs = 1000 * 60 * 60 * 24;
  return Math.round((agora - quando) / umDiaMs);
}

/**
 * BAIXO — `diasDesdeUltimaSessao` devolve `null` sem NENHUMA sessão
 * realizada, e é isso que apaga o alerta de silêncio prolongado (ver
 * `rotuloTempoSemSessao` em `textos.ts`) para o caso mais grave de todos: um
 * mentorado matriculado há meses que NUNCA teve a primeira sessão aparece,
 * na carteira, IGUAL a quem teve sessão ontem — o risco de churn mais óbvio
 * do produto, invisível.
 *
 * `diasEmSilencio` cobre as duas causas do mesmo alerta com um contrato só:
 *   - já houve sessão realizada -> conta a partir dela (delega para
 *     `diasDesdeUltimaSessao`), `nunca: false` — comportamento idêntico ao
 *     que já existia;
 *   - nunca houve -> conta a partir de `matricula.inicio` (a única data que
 *     existe para julgar "há quanto tempo isso está parado" quando não há
 *     sessão nenhuma), `nunca: true` — para quem exibe o texto poder dizer
 *     "ainda não houve a primeira sessão" em vez de "há N dias sem sessão",
 *     que sugere (falsamente) que alguma sessão já aconteceu.
 *
 * `null` quando `agoraIso` é inválido (mesma cautela de
 * `diasDesdeUltimaSessao`) OU, no ramo "nunca", quando `matricula.inicio` é
 * inválido — sem uma data de início válida não existe intervalo nenhum para
 * contar, e inventar um "há 0 dias" seria pior que não alertar.
 */
export function diasEmSilencio(
  matricula: Matricula,
  sessoes: readonly Sessao[],
  agoraIso: string,
): { dias: number; nunca: boolean } | null {
  const agora = Date.parse(agoraIso);
  if (!Number.isFinite(agora)) return null;

  const ultima = ultimaSessaoRealizada(sessoes);
  if (ultima) {
    const dias = diasDesdeUltimaSessao(sessoes, agoraIso);
    if (dias === null) return null; // defensivo: `ultima` não-nulo já garante isso
    return { dias, nunca: false };
  }

  const inicio = Date.parse(matricula.inicio);
  if (!Number.isFinite(inicio)) return null;

  const umDiaMs = 1000 * 60 * 60 * 24;
  return { dias: Math.round((agora - inicio) / umDiaMs), nunca: true };
}
