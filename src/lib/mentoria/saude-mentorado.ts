// Score de saúde do MENTORADO (0–100), explicável fator a fator.
//
// Módulo PURO: nada de Next, nada de banco, nada de `new Date()`/`Date.now()`
// aqui dentro — `agoraIso` é sempre parâmetro, pelo mesmo motivo detalhado no
// topo de `progresso.ts` (um score que muda sozinho com o relógio da máquina
// não é auditável, e o teste escrito hoje quebraria sozinho daqui a um ano).
//
// ============================================================
// ESTA É A ÚNICA CONTA DE SAÚDE DO MENTORADO NO SISTEMA.
// ============================================================
//
// O CRM (ficha e carteira), o portal, o alerta de risco e o snapshot semanal
// de `score_evolucao` chamam TODOS esta função. Não é preciosismo de
// arquitetura: duas contas para o mesmo número é exatamente como se inventa
// número sem ninguém notar — a ficha diria 72, o alerta dispararia com 48, e
// as duas telas estariam "certas" segundo o próprio código. Se um fator novo
// entrar, ou um peso mudar, tem que ser aqui, uma vez, para todo mundo.
//
// ============================================================
// REGRA DE BASE (a mesma de `src/lib/health.ts`)
// ============================================================
//
// Fator só pontua quando o dado que ele mede EXISTE. Mentorado que entrou
// ontem não tem presença 0% — ele não tem presença nenhuma para medir, e dar
// nota zero por isso seria inventar um veredito que o dado não sustenta (e,
// pior, chamar de "crítico" quem só é novo). Fator sem base fica de fora da
// soma E do denominador, e o score é renormalizado sobre o que sobrou. Sem
// NENHUM fator com base, `score` é `null` e `semBase` é `true` — nunca zero.
//
// Os cinco fatores saem de FATO JÁ REGISTRADO (sessão, tarefa, matrícula,
// linha de `score_evolucao`). Nenhum vem de IA: a análise de sessão por IA
// (bloco 11 do plano) é opinião gerada, e opinião gerada não pode entrar,
// sem aviso, num número que a tela apresenta como medição.

import { diasEmSilencio, progressoDe } from "./progresso";
import type { Matricula, Programa, ScoreEvolucao, Sessao, TarefaMentoria } from "./tipos";

// ============================================================
// Contrato
// ============================================================

/**
 * Chave estável de cada fator. Existe além de `nome` porque tela e teste
 * precisam apontar para um fator sem depender do TEXTO em português —
 * reescrever um rótulo para caber melhor no card não pode quebrar quem lê o
 * fator.
 */
export type ChaveFatorSaude = "presenca" | "tarefas" | "silencio" | "ritmo" | "tendencia";

export type NivelSaudeMentorado = "critico" | "atencao" | "saudavel" | "excelente";

export interface FatorSaudeMentorado {
  chave: ChaveFatorSaude;
  nome: string;
  temBase: boolean;
  /** `null` = sem base: não pontua e não empresta pontos ao denominador. */
  pontos: number | null;
  max: number;
  /** Uma frase para a tela — com base, diz a conta; sem base, diz por que não há conta. */
  detalhe: string;
}

export interface SaudeMentorado {
  // `number | null` em vez de número sempre presente: força cada tela a
  // decidir o que dizer quando não há base, em vez de deixar a ausência de
  // dado virar nota baixa.
  score: number | null;
  /** Nenhum fator com base — não existe score. */
  semBase: boolean;
  /** Parte dos fatores ficou de fora do cálculo. */
  parcial: boolean;
  /** Soma dos pesos considerados (o denominador do score). */
  maxComBase: number;
  nivel: NivelSaudeMentorado | null;
  fatores: FatorSaudeMentorado[];
}

/**
 * Tudo que a conta precisa, já lido do banco por quem chama.
 *
 * `matriculas` é LISTA, e não uma matrícula só, de propósito: uma pessoa com
 * pacote concluído + renovação tem duas (o caso normal de continuidade). Se o
 * parâmetro fosse `matricula`, cada chamador escolheria a sua — e quatro
 * chamadores escolhendo diferente é o mesmo problema de "duas contas para o
 * mesmo número" entrando pela porta dos fundos. A escolha mora aqui, uma vez
 * (ver `matriculaDeReferencia`). O formato `{ matricula, programa }` é o
 * mesmo que `Portal.matriculas` e a ficha do CRM já montam.
 *
 * `sessoes` e `tarefas` são as do MENTORADO (todas as matrículas dele), como
 * `Portal.sessoes`/`Portal.tarefas` já entregam. `scores` é a série de
 * `score_evolucao` dele, em qualquer ordem — esta função ordena o que precisa.
 */
export interface EntradaSaudeMentorado {
  matriculas: ReadonlyArray<{ matricula: Matricula; programa: Programa | null }>;
  sessoes: readonly Sessao[];
  tarefas: readonly TarefaMentoria[];
  scores: readonly ScoreEvolucao[];
}

// ============================================================
// Pesos — somam exatamente 100 com os cinco fatores em pé
// ============================================================
//
// A ordem dos pesos é a ordem da conversa que o mentor tem com o mentorado:
// primeiro "você está aparecendo?" (presença), depois "você está fazendo o
// combinado?" (tarefas), depois "há quanto tempo sumiu?" (silêncio), depois
// "estamos no ritmo que vendemos?" (ritmo) e por último "para onde a coisa
// está indo?" (tendência). Presença pesa mais que tendência porque falta é
// fato consumado; tendência é leitura de três ou quatro pontos, mais sujeita
// a ruído.

const PESO_PRESENCA = 30;
const PESO_TAREFAS = 25;
const PESO_SILENCIO = 20;
const PESO_RITMO = 15;
const PESO_TENDENCIA = 10;

/** Até este número de dias sem sessão, o fator silêncio vale cheio. */
const DIAS_SILENCIO_NOTA_CHEIA = 10;
/** A partir daqui, o fator silêncio zera. */
const DIAS_SILENCIO_NOTA_ZERO = 45;

/** Subida de pontos de score na janela que já vale nota cheia na tendência. */
const TENDENCIA_SUBIDA_CHEIA = 10;
/** Queda de pontos de score na janela que já zera a tendência. */
const TENDENCIA_QUEDA_ZERO = -10;
/** Quantas linhas de `score_evolucao` a tendência olha (as mais recentes). */
const TENDENCIA_SEMANAS = 4;
/**
 * Idade máxima de uma linha de `score_evolucao` para ela ainda descrever o
 * AGORA. O dobro da janela de quatro leituras, de propósito: o snapshot
 * semanal pode falhar uma ou duas semanas sem que a tendência do mentorado
 * deixe de ser real, mas uma série que parou há dois meses não fala mais do
 * presente — parou de ser medição e virou lembrança.
 */
const TENDENCIA_IDADE_MAXIMA_DIAS = 56;

const MS_POR_DIA = 1000 * 60 * 60 * 24;

// ============================================================
// Utilitários locais
// ============================================================

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const r1 = (v: number) => +v.toFixed(1);

/**
 * `Date.parse` que devolve `null` em vez de `NaN` — mesma cautela de
 * `quandoValido` em `progresso.ts`: um `NaN` vazando para uma comparação não
 * lança, só devolve `false` silenciosamente, e é assim que um score errado
 * apareceria em produção sem ninguém notar. Aqui, data ruim vira ausência de
 * dado (o fator perde base), nunca um número inventado.
 */
function instante(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** Concordância de plural — "1 sessões" está errado em português (ver progresso.ts). */
function plural(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

function semBase(chave: ChaveFatorSaude, nome: string, max: number, detalhe: string): FatorSaudeMentorado {
  return { chave, nome, max, temBase: false, pontos: null, detalhe };
}

function comBase(
  chave: ChaveFatorSaude,
  nome: string,
  max: number,
  fracao: number,
  detalhe: string,
): FatorSaudeMentorado {
  // `clamp` aqui é o cinto de segurança do módulo inteiro: qualquer fração
  // absurda vinda de dado ruim (divisão por número minúsculo, sessão no
  // futuro, prazo invertido) para dentro da faixa 0..max ANTES de virar
  // ponto — é o que garante "score sempre entre 0 e 100".
  return { chave, nome, max, temBase: true, pontos: r1(max * clamp(fracao, 0, 1)), detalhe };
}

// ============================================================
// Matrícula de referência
// ============================================================

/**
 * Qual matrícula responde por "o programa deste mentorado" nos fatores que
 * precisam de UMA (silêncio e ritmo).
 *
 * REGRA: entre as ATIVAS, a que começou mais recentemente. Ativa ganha de
 * qualquer outra mesmo sendo mais antiga porque é ela que descreve o que está
 * acontecendo AGORA — julgar o ritmo de alguém pela matrícula que ele
 * cancelou em março seria medir um programa que não está mais rodando. Sem
 * nenhuma ativa, vale a mais recente entre todas (o histórico é o que sobrou
 * para julgar).
 *
 * Empate de `inicio` (ou início inválido dos dois lados) é desempatado pelo
 * `id`: sem isso o resultado dependeria da ordem em que o banco devolveu as
 * linhas, e o MESMO mentorado poderia ter dois scores diferentes em duas
 * telas — o problema que este módulo inteiro existe para evitar.
 */
function matriculaDeReferencia(
  matriculas: EntradaSaudeMentorado["matriculas"],
): { matricula: Matricula; programa: Programa | null } | null {
  if (matriculas.length === 0) return null;

  const ativas = matriculas.filter((m) => m.matricula.status === "ativa");
  const candidatas = ativas.length > 0 ? ativas : matriculas;

  return candidatas.reduce((melhor, atual) => {
    const inicioMelhor = instante(melhor.matricula.inicio);
    const inicioAtual = instante(atual.matricula.inicio);

    // Início inválido perde de qualquer início válido: não dá para chamar de
    // "a mais recente" uma matrícula cuja data ninguém consegue ler.
    if (inicioAtual === null && inicioMelhor === null) {
      return atual.matricula.id > melhor.matricula.id ? atual : melhor;
    }
    if (inicioAtual === null) return melhor;
    if (inicioMelhor === null) return atual;
    if (inicioAtual === inicioMelhor) {
      return atual.matricula.id > melhor.matricula.id ? atual : melhor;
    }
    return inicioAtual > inicioMelhor ? atual : melhor;
  });
}

/**
 * Sessões de UMA matrícula: vínculo direto (atendimento 1:1) ou pela turma
 * (aula em grupo) — os dois únicos vínculos que `sessao` admite
 * (`sessao_vinculo_unico`, 0006). Mesma regra que `dados.ts` e `portal.ts`
 * aplicam ao montar as listas; repetida aqui porque este módulo é puro e não
 * pode importar camada de leitura (que é `server-only`).
 */
function sessoesDaMatricula(matricula: Matricula, sessoes: readonly Sessao[]): Sessao[] {
  return sessoes.filter(
    (s) => s.matriculaId === matricula.id || (matricula.turmaId !== null && s.turmaId === matricula.turmaId),
  );
}

// ============================================================
// Fator 1 — presença nas sessões
// ============================================================

/**
 * Realizadas ÷ sessões passadas que de fato foram julgadas pelo mentor.
 *
 * O denominador é a decisão importante aqui, e ele DEIXA DUAS COISAS DE FORA:
 *
 *  - `cancelada`: cancelamento não é falta. Quem cancelou pode ter sido o
 *    mentor, e cobrar presença de um encontro que ninguém realizou põe na
 *    conta do mentorado uma decisão que talvez nem tenha sido dele.
 *  - `agendada` com horário já passado: é o mentor que esqueceu de dar baixa.
 *    Contar como falta pune o mentorado por lapso administrativo alheio;
 *    contar como presença infla a nota. Como não dá para saber o que
 *    aconteceu, a sessão não entra na conta — e o `detalhe` avisa quantas
 *    ficaram assim, para o mentor ir dar baixa em vez de descobrir um número
 *    estranho na tela.
 *
 * Sobram `realizada` e `faltou`: exatamente as sessões em que alguém já disse
 * o que aconteceu. Sem nenhuma delas, não há presença para medir.
 */
function fatorPresenca(sessoes: readonly Sessao[], agora: number | null): FatorSaudeMentorado {
  const nome = "Presença nas sessões";
  if (agora === null) {
    return semBase("presenca", nome, PESO_PRESENCA, "sem um instante de referência válido — não dá para saber quais sessões já passaram");
  }

  let julgadas = 0;
  let presentes = 0;
  let semBaixa = 0;

  for (const sessao of sessoes) {
    const quando = instante(sessao.quando);
    if (quando === null || quando > agora) continue; // futuro e data ilegível não julgam nada
    if (sessao.status === "realizada") {
      julgadas += 1;
      presentes += 1;
    } else if (sessao.status === "faltou") {
      julgadas += 1;
    } else if (sessao.status === "agendada") {
      semBaixa += 1;
    }
  }

  const avisoBaixa =
    semBaixa > 0
      ? ` — ${plural(semBaixa, "sessão passada ainda sem baixa ficou", "sessões passadas ainda sem baixa ficaram")} de fora`
      : "";

  if (julgadas === 0) {
    return semBase(
      "presenca",
      nome,
      PESO_PRESENCA,
      `nenhuma sessão passada com presença registrada — não há presença para medir${avisoBaixa}`,
    );
  }

  const taxa = presentes / julgadas;
  return comBase(
    "presenca",
    nome,
    PESO_PRESENCA,
    taxa,
    `${presentes} de ${plural(julgadas, "sessão passada", "sessões passadas")} com presença (${Math.round(taxa * 100)}%)${avisoBaixa}`,
  );
}

// ============================================================
// Fator 2 — tarefas concluídas no prazo
// ============================================================

/**
 * Entre as tarefas que já dá para julgar, quantas foram entregues até o prazo.
 *
 * Uma tarefa entra na conta quando tem prazo LEGÍVEL e uma das duas:
 *  - foi concluída e se sabe QUANDO (`concluidaEm`, coluna do 0012); ou
 *  - não foi concluída e o prazo já venceu — isso é atraso, fato consumado.
 *
 * Fica de fora:
 *  - tarefa sem prazo: "no prazo" precisa de um prazo. Sem ele não existe
 *    atraso possível, e contar como entregue no prazo daria nota de graça.
 *  - tarefa em aberto com prazo no futuro: ainda está dentro do combinado —
 *    não dá nota nem tira nota.
 *  - tarefa concluída sem `concluidaEm` (linha antiga, anterior ao 0012):
 *    sabe-se que foi feita, não quando. Chutar "no prazo" premia sem prova;
 *    chutar "atrasada" pune sem prova. Não julgar é a única saída honesta.
 */
function fatorTarefas(tarefas: readonly TarefaMentoria[], agora: number | null): FatorSaudeMentorado {
  const nome = "Tarefas no prazo";
  if (agora === null) {
    return semBase("tarefas", nome, PESO_TAREFAS, "sem um instante de referência válido — não dá para saber quais prazos já venceram");
  }

  let julgaveis = 0;
  let noPrazo = 0;

  for (const tarefa of tarefas) {
    const prazo = instante(tarefa.prazo);
    if (prazo === null) continue;

    if (tarefa.concluida) {
      const quandoConcluiu = instante(tarefa.concluidaEm);
      if (quandoConcluiu === null) continue;
      julgaveis += 1;
      if (quandoConcluiu <= prazo) noPrazo += 1;
    } else if (prazo <= agora) {
      julgaveis += 1; // venceu e ninguém entregou
    }
  }

  if (julgaveis === 0) {
    return semBase(
      "tarefas",
      nome,
      PESO_TAREFAS,
      "nenhuma tarefa concluída ou com prazo vencido — não há entrega no prazo para medir",
    );
  }

  const taxa = noPrazo / julgaveis;
  return comBase(
    "tarefas",
    nome,
    PESO_TAREFAS,
    taxa,
    `${noPrazo} de ${plural(julgaveis, "tarefa já vencida ou concluída", "tarefas já vencidas ou concluídas")} no prazo (${Math.round(taxa * 100)}%)`,
  );
}

// ============================================================
// Fator 3 — dias em silêncio
// ============================================================

/**
 * Quantos dias desde a última sessão realizada, via `diasEmSilencio`
 * (`progresso.ts`) — a mesma função que já alimenta o alerta dourado da
 * carteira, não uma segunda contagem paralela.
 *
 * SÓ PONTUA COM `nunca: false`. Quando `diasEmSilencio` devolve `nunca:
 * true` (matriculado, nenhuma sessão realizada ainda), o intervalo medido é
 * "tempo desde a matrícula", que não é silêncio: ninguém parou de falar,
 * ainda não se começou. Virar nota baixa aqui castigaria quem se matriculou
 * anteontem. Esse caso tem alerta PRÓPRIO, e ele já existe:
 * `rotuloAlertaCarteira` ("matriculado há N dias, ainda sem a primeira
 * sessão"). O fator diz isso no `detalhe` — o dado não some da tela, só não
 * vira ponto.
 */
function fatorSilencio(
  referencia: { matricula: Matricula } | null,
  sessoes: readonly Sessao[],
  agoraIso: string,
  agora: number | null,
): FatorSaudeMentorado {
  const nome = "Dias em silêncio";

  if (agora === null) {
    return semBase("silencio", nome, PESO_SILENCIO, "sem um instante de referência válido — não há intervalo para contar");
  }
  if (referencia === null) {
    return semBase("silencio", nome, PESO_SILENCIO, "sem matrícula — não há programa em que ficar em silêncio");
  }

  const silencio = diasEmSilencio(referencia.matricula, sessoes, agoraIso);

  if (silencio === null) {
    return semBase(
      "silencio",
      nome,
      PESO_SILENCIO,
      "sem sessão realizada e sem data de início legível — não há intervalo para contar",
    );
  }

  if (silencio.nunca) {
    return semBase(
      "silencio",
      nome,
      PESO_SILENCIO,
      `ainda não houve a primeira sessão (matriculado há ${plural(silencio.dias, "dia", "dias")}) — não há silêncio para medir`,
    );
  }

  // Intervalo negativo = a última sessão "realizada" está no FUTURO (o caso
  // real é o ano digitado errado ao dar baixa). Sem esta guarda o `clamp`
  // transformaria o absurdo em nota CHEIA — nota máxima por um encontro que
  // ainda não aconteceu — e mandaria "última sessão há -121 dias" para a tela.
  // Dado impossível é ausência de dado, nunca a melhor nota possível.
  if (silencio.dias < 0) {
    return semBase(
      "silencio",
      nome,
      PESO_SILENCIO,
      "a última sessão marcada como realizada está no futuro — data provavelmente errada, não há silêncio para medir",
    );
  }

  const fracao = (DIAS_SILENCIO_NOTA_ZERO - silencio.dias) / (DIAS_SILENCIO_NOTA_ZERO - DIAS_SILENCIO_NOTA_CHEIA);
  return comBase(
    "silencio",
    nome,
    PESO_SILENCIO,
    fracao,
    `última sessão há ${plural(silencio.dias, "dia", "dias")} — nota cheia até ${DIAS_SILENCIO_NOTA_CHEIA} dias, zera em ${DIAS_SILENCIO_NOTA_ZERO}`,
  );
}

// ============================================================
// Fator 4 — aderência ao ritmo previsto
// ============================================================

/**
 * Sessões dadas ÷ sessões que já deveriam ter acontecido a esta altura do
 * programa, supondo ritmo constante entre `inicio` e `fimPrevisto`.
 *
 * Precisa das DUAS pontas do combinado: o tamanho do pacote (`previstas`, com
 * a mesma cascata matrícula -> programa de `progressoDe`, inclusive o
 * descarte de `sessoes_previstas <= 0` como ausência de pacote) e o prazo
 * (`fimPrevisto`). Falta uma delas, não existe ritmo COMBINADO — e comparar
 * o mentorado com um ritmo que ninguém negociou é inventar a régua junto com
 * a nota.
 *
 * Também não pontua enquanto `esperadas < 1`: no começo do programa a conta
 * dividiria por um número minúsculo e transformaria "ainda não era para ter
 * acontecido nada" numa nota (cheia ou zero conforme o arredondamento).
 * Antes da primeira sessão prevista não há atraso possível.
 *
 * Adiantar não vale mais que 100% (o `clamp` de `comBase`): dar sessões a
 * mais é cortesia do mentor, não saúde extra do mentorado — e deixar esse
 * fator estourar compensaria falta e silêncio com generosidade de agenda.
 */
function fatorRitmo(
  referencia: { matricula: Matricula; programa: Programa | null } | null,
  sessoes: readonly Sessao[],
  agora: number | null,
): FatorSaudeMentorado {
  const nome = "Ritmo previsto do programa";

  if (agora === null) {
    return semBase("ritmo", nome, PESO_RITMO, "sem um instante de referência válido — não dá para saber quanto do prazo já correu");
  }
  if (referencia === null) {
    return semBase("ritmo", nome, PESO_RITMO, "sem matrícula — não há ritmo combinado para comparar");
  }

  const { matricula, programa } = referencia;
  const progresso = progressoDe(matricula, programa, sessoesDaMatricula(matricula, sessoes));
  const inicio = instante(matricula.inicio);
  const fim = instante(matricula.fimPrevisto);

  if (progresso.previstas === null) {
    return semBase("ritmo", nome, PESO_RITMO, "sem pacote fechado de sessões — não há ritmo previsto para comparar");
  }
  if (inicio === null || fim === null || fim <= inicio) {
    return semBase("ritmo", nome, PESO_RITMO, "sem início e fim previstos legíveis — não há prazo para distribuir as sessões");
  }

  const decorrido = clamp((agora - inicio) / (fim - inicio), 0, 1);
  const esperadas = progresso.previstas * decorrido;

  if (esperadas < 1) {
    return semBase(
      "ritmo",
      nome,
      PESO_RITMO,
      "o programa ainda não chegou à primeira sessão prevista — cedo demais para julgar ritmo",
    );
  }

  return comBase(
    "ritmo",
    nome,
    PESO_RITMO,
    progresso.realizadas / esperadas,
    `${progresso.realizadas} de ${esperadas.toFixed(1)} sessões esperadas a esta altura (${Math.round(decorrido * 100)}% do prazo corrido)`,
  );
}

// ============================================================
// Fator 5 — tendência das últimas semanas de score_evolucao
// ============================================================

/**
 * Diferença entre a primeira e a última das ÚLTIMAS QUATRO linhas de
 * `score_evolucao` — a mesma definição de variação que `variacaoScore`
 * (`app/(app)/mentoria/textos.ts`) já mostra na tela, só que restrita à
 * janela recente e virando ponto em vez de texto.
 *
 * PRECISA DE DUAS LINHAS. Variação é, por definição, a diferença entre dois
 * pontos: com uma medição só não existe "subiu" nem "caiu", e inventar
 * tendência a partir de um ponto isolado é o tipo de número falso que este
 * projeto recusa (mesma regra de `variacaoScore`, que devolve `null` com
 * menos de dois pontos).
 *
 * Quatro semanas, e não a série inteira, porque a pergunta que este fator
 * responde é "para onde isso está indo AGORA" — uma queda de três meses atrás
 * já foi respondida (ou não) e não descreve o mês corrente. E a janela é
 * recorte de TEMPO antes de ser recorte de posição: as "quatro últimas" de
 * uma série que parou em 2019 são quatro leituras de 2019, e pontuá-las hoje
 * seria responder a pergunta de agora com o dado de sete anos atrás.
 *
 * Estável (variação zero) cai no MEIO da faixa, não no topo: manter o mesmo
 * score não é conquista nem alarme. Nota cheia exige subir 10 pontos; zero
 * exige cair 10.
 */
function fatorTendencia(scores: readonly ScoreEvolucao[], agora: number | null): FatorSaudeMentorado {
  const nome = "Tendência do score";

  if (agora === null) {
    return semBase("tendencia", nome, PESO_TENDENCIA, "sem um instante de referência válido — não dá para saber se a série é recente");
  }

  // `Number.isFinite(s.score)`: `dados.ts` monta a linha com `Number(r.score)`
  // e `Number(undefined)` é `NaN` — uma única linha assim faria a subtração
  // abaixo virar `NaN`, o `clamp` não segura `NaN`, e o score do mentorado
  // INTEIRO chegaria à tela como `NaN`. Linha ilegível é linha que não existe.
  const legiveis = scores.filter((s) => instante(s.semana) !== null && Number.isFinite(s.score));

  // Corte por TEMPO, não só por posição: `slice` das quatro últimas devolve as
  // quatro últimas mesmo que sejam de 2019. Como o snapshot semanal pode
  // simplesmente parar de rodar, série congelada é o estado normal de um
  // mentorado abandonado — e pontuar a subida dele de anos atrás é dizer, na
  // tela de hoje, que ele está melhorando AGORA.
  const limiteDeIdade = agora - TENDENCIA_IDADE_MAXIMA_DIAS * MS_POR_DIA;
  const recentes = legiveis.filter((s) => (instante(s.semana) as number) >= limiteDeIdade);

  // Ordena por semana crescente; empate desempatado por `id` para que a mesma
  // entrada, vinda em qualquer ordem do banco, dê sempre o mesmo resultado.
  const validos = recentes.sort((a, b) => {
    const diferenca = (instante(a.semana) as number) - (instante(b.semana) as number);
    return diferenca !== 0 ? diferenca : a.id.localeCompare(b.id);
  });

  const janela = validos.slice(-TENDENCIA_SEMANAS);

  if (janela.length < 2) {
    // O motivo muda o que o mentor faz: "ainda não mediram o bastante" é
    // esperar a próxima semana; "parou de medir" é ir ver por que o snapshot
    // semanal morreu. Dizer só "não há variação" esconderia a segunda.
    const serieParou = recentes.length === 0 && legiveis.length > 0;
    return semBase(
      "tendencia",
      nome,
      PESO_TENDENCIA,
      serieParou
        ? `a série de score parou há mais de ${TENDENCIA_IDADE_MAXIMA_DIAS} dias — leitura velha não diz para onde isso está indo agora`
        : `menos de duas semanas de score registradas nos últimos ${TENDENCIA_IDADE_MAXIMA_DIAS} dias — não há variação para medir`,
    );
  }

  const variacao = janela[janela.length - 1].score - janela[0].score;
  const fracao = (variacao - TENDENCIA_QUEDA_ZERO) / (TENDENCIA_SUBIDA_CHEIA - TENDENCIA_QUEDA_ZERO);
  const sinal = variacao > 0 ? "+" : "";

  return comBase(
    "tendencia",
    nome,
    PESO_TENDENCIA,
    fracao,
    `${sinal}${variacao} ponto(s) nas últimas ${plural(janela.length, "semana registrada", "semanas registradas")}`,
  );
}

// ============================================================
// A conta
// ============================================================

/**
 * Score de saúde do mentorado, de 0 a 100, ou `null` quando nenhum fator tem
 * base. `agoraIso` inválido não lança: todos os fatores perdem base e o
 * resultado é `semBase` — sem saber que horas são, não existe "presença até
 * hoje", "prazo vencido" nem "dias em silêncio", e devolver um número
 * qualquer seria pior que admitir que não há resposta.
 */
export function saudeDoMentorado(entrada: EntradaSaudeMentorado, agoraIso: string): SaudeMentorado {
  const agora = instante(agoraIso);
  const referencia = matriculaDeReferencia(entrada.matriculas);

  // Presença, tarefas e silêncio leem a vida INTEIRA do mentorado (inclusive
  // sessões de matrícula já encerrada); só o ritmo lê a matrícula de
  // referência. Não é descuido: "você apareceu?" e "há quanto tempo sumiu?"
  // são perguntas sobre a pessoa, e faltar em março continua sendo falta
  // depois de renovar. Ritmo é a única pergunta sobre o CONTRATO — "estamos no
  // combinado deste pacote?" — e comparar sessão de pacote encerrado com o
  // prazo do pacote atual creditaria duas vezes a mesma sessão.
  const fatores: FatorSaudeMentorado[] = [
    fatorPresenca(entrada.sessoes, agora),
    fatorTarefas(entrada.tarefas, agora),
    fatorSilencio(referencia, entrada.sessoes, agoraIso, agora),
    fatorRitmo(referencia, entrada.sessoes, agora),
    fatorTendencia(entrada.scores, agora),
  ];

  const comBaseAgora = fatores.filter((f) => f.temBase);
  const maxComBase = comBaseAgora.reduce((s, f) => s + f.max, 0);
  const nadaComBase = maxComBase === 0;

  // Com os cinco fatores em pé o divisor é 100 e o score é a soma direta dos
  // pontos; com fatores de fora, é a mesma nota renormalizada sobre o que
  // sobrou — nunca uma nota menor só porque faltava dado.
  const score = nadaComBase
    ? null
    : Math.round((comBaseAgora.reduce((s, f) => s + (f.pontos ?? 0), 0) / maxComBase) * 100);

  const nivel: NivelSaudeMentorado | null =
    score === null ? null : score >= 80 ? "excelente" : score >= 60 ? "saudavel" : score >= 40 ? "atencao" : "critico";

  return {
    score,
    semBase: nadaComBase,
    parcial: !nadaComBase && comBaseAgora.length < fatores.length,
    maxComBase,
    nivel,
    fatores,
  };
}

export const NIVEL_SAUDE_MENTORADO_LABEL: Record<NivelSaudeMentorado, string> = {
  critico: "Crítico",
  atencao: "Atenção",
  saudavel: "Saudável",
  excelente: "Excelente",
};
