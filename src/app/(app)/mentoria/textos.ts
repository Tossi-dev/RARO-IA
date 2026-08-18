// Formatação de texto da tela de mentoria (carteira + ficha) — módulo PURO,
// sem "use client", sem React, sem `new Date()` livre. É a parte TESTÁVEL
// das duas telas em `page.tsx`: quem monta a árvore de componentes chama
// estas funções, nunca formata data ou monta rótulo na marra dentro do JSX.
//
// Regras de estilo da casa que valem para todo texto que sai daqui:
//   - zero emoji (ver o teste "zero emoji em todo o módulo" em textos.test.ts)
//   - os únicos glifos usados são ▲ ▼ ▬ (variação de score)
//   - nenhum número é inventado: cada função recebe o dado pronto de
//     `src/lib/mentoria/dados.ts`/`progresso.ts` e só formata — quando o
//     dado é `null`, a resposta é texto vazio ou uma frase honesta ("sem
//     sessão marcada"), nunca um placeholder que pareça dado real.

import type { LinhaCarteira } from "@/lib/mentoria/dados";
import { linkGravacaoValido } from "@/lib/mentoria/validacao";
import type { ScoreEvolucao } from "@/lib/mentoria/tipos";

/** Fuso fixo: a mentoria é um produto brasileiro, e "12/08 às 23:00" não
 *  pode virar "13/08 às 02:00" só porque o servidor da Vercel roda em UTC
 *  (mesmo motivo documentado em `src/lib/agenda.ts` sobre `hojeISO`). Sem
 *  fixar o fuso aqui, o MESMO horário apareceria diferente dependendo de
 *  onde o processo Next roda — o tipo de bug que só aparece em produção. */
const FUSO_BRASIL = "America/Sao_Paulo";

/**
 * ISO datetime -> "12/08/2026 às 14:30", sempre no fuso de São Paulo.
 * Entrada vazia, `null`/`undefined` (o `as any` de um chamador descuidado
 * não é hipótese rara — `dados.ts` já lida com o mesmo tipo de entrada
 * hostil) ou string que não é data: devolve "" e NUNCA lança. Uma exceção
 * aqui derrubaria a tela inteira por causa de UM campo de data mal formado.
 */
export function dataHoraBr(iso: string): string {
  if (typeof iso !== "string" || iso.trim() === "") return "";

  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "";

  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO_BRASIL,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23", // "h23" em vez de hour12:false: evita o "24:00" de meia-noite que hour12:false produz em alguns motores ICU
  }).formatToParts(data);

  const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  const dia = parte("day");
  const mes = parte("month");
  const ano = parte("year");
  const hora = parte("hour");
  const minuto = parte("minute");
  if (!dia || !mes || !ano || !hora || !minuto) return "";

  return `${dia}/${mes}/${ano} às ${hora}:${minuto}`;
}

/**
 * ALTO 1 — `sessao.linkGravacao` vira, sem mais nenhum filtro, um `<a href>`
 * clicável na ficha do mentorado. `linkGravacaoValido` (validacao.ts) só
 * roda na ESCRITA (dentro de `BaixaSchema`) — não existe CHECK equivalente
 * no Postgres, então uma linha inserida pelo Supabase Studio, por um script,
 * ou gravada ANTES de essa validação existir, chega intacta na LEITURA. O
 * React 18 renderiza `href="javascript:fetch(...)"` sem reclamar (só avisa
 * em dev) — o clique roda no navegador de quem está vendo a ficha.
 *
 * `hrefSeguro` é o mesmo portão, do lado de dentro: reaproveita
 * `linkGravacaoValido` (a MESMA regra, não uma cópia divergente) mas troca o
 * booleano por um valor pronto para `href` — "" quando o valor não é um
 * `http://`/`https://` absoluto, o valor original (só aparado nas pontas)
 * quando é. Devolver "" em vez de lançar/esconder o card inteiro é o que
 * deixa a tela decidir entre desenhar o link e avisar "endereço inválido"
 * sem nunca imprimir o valor cru num atributo.
 *
 * "" também é a resposta para vazio/`null`/`undefined`: aqui não há
 * distinção entre "não tem link" e "tem um link ruim" — quem decide isso é
 * quem chama, olhando se `sessao.linkGravacao` (a string original) é vazia
 * ou não antes de perguntar por `hrefSeguro`.
 */
export function hrefSeguro(valor: string | null | undefined): string {
  if (typeof valor !== "string") return "";
  const v = valor.trim();
  if (v === "") return "";
  return linkGravacaoValido(v) ? v : "";
}

/**
 * MÉDIO 2 — `tarefa_mentoria.prazo`, `marco.conquistado_em` e
 * `score_evolucao.semana` são colunas `date` do Postgres: um calendário,
 * sem hora nem fuso embutido. `dataHoraBr` (acima) passa por `new Date(iso)`
 * — e `new Date("2026-01-01")` é interpretado como MEIA-NOITE UTC. Convertido
 * para America/Sao_Paulo (UTC-3), isso volta 3 horas e cai em 31/12/2025:
 * um prazo `2026-08-20` apareceria como "19/08/2026 às 21:00" — o dia
 * ERRADO, não só a hora.
 *
 * `dataBr` nunca cria um `Date`: lê os três números de `AAAA-MM-DD` na marra
 * (regex) e formata — sem ISSO não existe conversão de fuso NENHUMA para dar
 * errado. Qualquer coisa que não bata no formato exato (vazio, `null`,
 * `undefined`, texto solto, um datetime completo por engano) devolve "" e
 * nunca lança, mesma disciplina de `dataHoraBr`.
 */
const REGEX_DATA_CIVIL = /^(\d{4})-(\d{2})-(\d{2})$/;

export function dataBr(iso: string | null | undefined): string {
  if (typeof iso !== "string") return "";
  const m = REGEX_DATA_CIVIL.exec(iso.trim());
  if (!m) return "";

  const [, anoTxt, mesTxt, diaTxt] = m;
  const mes = Number(mesTxt);
  const dia = Number(diaTxt);
  // Faixa básica de calendário (não valida 30 de fevereiro à parte — o
  // banco já garante `date` válido; isto é só para não desenhar "40/13" de
  // um dado de teste/JSON mal formado que só coincide com o formato).
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return "";

  return `${diaTxt}/${mesTxt}/${anoTxt}`;
}

/**
 * Texto da "próxima sessão" da carteira/ficha. `agoraIso` faz parte da
 * assinatura pelo mesmo motivo de `agoraIso` em `progresso.ts` e `dados.ts`:
 * é o parâmetro que existe para que "agora" nunca precise nascer de
 * `new Date()` dentro deste módulo puro — mesmo que, hoje, a formatação em
 * si não dependa de quão perto "agora" está da sessão (isso já foi decidido
 * em `proximaSessao`, que só devolve sessão FUTURA — ver `progresso.ts`,
 * regra 6). Quem quiser evoluir para "amanhã às 14:00" no lugar da data
 * cheia tem o parâmetro pronto, sem mudar quem chama.
 */
export function rotuloProximaSessao(quandoIso: string | null, agoraIso: string): string {
  void agoraIso;
  if (quandoIso === null) return "sem sessão marcada";

  const formatado = dataHoraBr(quandoIso);
  // Data que não formata (vazia/inválida) é tratada como se não houvesse
  // sessão marcada — melhor a mensagem honesta do que uma data quebrada na tela.
  return formatado === "" ? "sem sessão marcada" : formatado;
}

/** Dias corridos desde a última sessão realizada, acima dos quais vale
 *  chamar atenção do mentor (14 dias — pouco mais de duas semanas sem
 *  contato, o limite documentado no pedido da tela B2.3). */
const LIMIAR_DIAS_SEM_SESSAO = 14;

/**
 * "há N dias sem sessão", só quando `dias` já passou do limiar. `null`
 * (sem nenhuma sessão realizada ainda) e qualquer valor até o limiar
 * devolvem "" de propósito: não alarma cedo demais — duas semanas de
 * silêncio entre sessões de mentoria é rotina, não risco.
 */
export function rotuloTempoSemSessao(dias: number | null): string {
  if (dias === null) return "";
  if (dias <= LIMIAR_DIAS_SEM_SESSAO) return "";
  return `há ${dias} dias sem sessão`;
}

/**
 * BAIXO — o alerta de silêncio da carteira (`rotuloTempoSemSessao`) só
 * disparava quando EXISTIA uma sessão realizada (`diasDesdeUltimaSessao`
 * devolve `null` sem nenhuma). Isso deixava exatamente o caso mais grave sem
 * alerta nenhum: um mentorado matriculado há meses que NUNCA teve a primeira
 * sessão aparecia, na carteira, igual a quem teve sessão ontem — é o maior
 * risco de churn do produto, e era invisível.
 *
 * `rotuloAlertaCarteira` recebe direto o resultado de `diasEmSilencio`
 * (progresso.ts) e junta as duas causas do mesmo alerta dourado:
 *  1) `nunca: false` — já teve sessão, mas a última foi há muito tempo:
 *     delega para `rotuloTempoSemSessao`, comportamento IDÊNTICO ao de
 *     antes.
 *  2) `nunca: true` — nunca teve nenhuma, e a matrícula já é mais antiga que
 *     o mesmo limiar: alerta novo, mesmo limiar, mesmo tom, mas com um texto
 *     PRÓPRIO ("ainda sem a primeira sessão") — "há N dias sem sessão"
 *     sugeriria que alguma sessão já aconteceu, o que é falso aqui.
 * `silencio === null` (sem sessão e `matricula.inicio` inválido, ou `agora`
 * inválido — ver `diasEmSilencio`) nunca alarma: sem os dois lados da conta
 * não existe intervalo para julgar.
 */
export function rotuloAlertaCarteira(silencio: { dias: number; nunca: boolean } | null): string {
  if (silencio === null) return "";
  if (!silencio.nunca) return rotuloTempoSemSessao(silencio.dias);
  if (silencio.dias <= LIMIAR_DIAS_SEM_SESSAO) return "";
  return `matriculado há ${silencio.dias} dias, ainda sem a primeira sessão`;
}

export interface VariacaoScore {
  glifo: "▲" | "▼" | "▬";
  /** Sempre positivo (ou zero) — a direção já está no glifo, o número não repete o sinal. */
  valor: number;
  texto: string;
}

/**
 * Variação do score de evolução entre o PRIMEIRO e o ÚLTIMO ponto da série
 * recebida (nesta ordem — `Ficha.scores` já chega em ordem cronológica
 * crescente, ver o comentário de `Ficha` em `dados.ts`).
 *
 * `null` com zero ou UM ponto: é o caso mais importante desta função. Uma
 * variação é, por definição, a diferença entre DOIS pontos — com um só (ou
 * nenhum), não existe "subiu" ou "caiu" a mostrar, e inventar um glifo de
 * tendência a partir de uma medição isolada seria exatamente o tipo de
 * número falso que este projeto recusa (mesma disciplina de `progressoDe`,
 * que nunca inventa denominador, e de `lerCarteira`, que nunca inventa linha
 * de demonstração). A resposta honesta para uma série de tamanho 0 ou 1 é
 * "não há o que mostrar ainda" — `null` — não um "▬ 0" fingindo estabilidade.
 */
export function variacaoScore(scores: readonly ScoreEvolucao[]): VariacaoScore | null {
  if (scores.length < 2) return null;

  const primeiro = scores[0];
  const ultimo = scores[scores.length - 1];
  const diferenca = ultimo.score - primeiro.score;

  const glifo: VariacaoScore["glifo"] = diferenca > 0 ? "▲" : diferenca < 0 ? "▼" : "▬";
  const valor = Math.abs(diferenca);

  return { glifo, valor, texto: `${glifo} ${valor}` };
}

/**
 * MÉDIO 3 — "Mentorados em programa (N)" (mentoria/page.tsx) contava
 * MATRÍCULAS: `carteira.linhas.length` é uma linha por matrícula, e uma
 * pessoa com pacote concluído + renovação (o caso normal de continuidade)
 * gera DUAS linhas para a MESMA pessoa. O rótulo diz "mentorados", não
 * "matrículas" — o número tem que responder à pergunta que o rótulo faz.
 *
 * Conta `mentorado.id` distintos via `Set` (em vez de trocar o rótulo para
 * "Matrículas em andamento"): "quantas pessoas eu atendo" é a pergunta mais
 * útil no topo da carteira — o detalhe "esta pessoa tem duas matrículas" já
 * aparece linha a linha, na própria tabela.
 */
export function contarMentoradosDistintos(linhas: readonly LinhaCarteira[]): number {
  return new Set(linhas.map((linha) => linha.mentorado.id)).size;
}

/**
 * Texto do título "Mentorados em programa (…)" — a versão HONESTA de
 * `contarMentoradosDistintos` para tela. Quando `linhas.length` (matrículas)
 * é igual ao número de pessoas distintas, um número só ("3 mentorados")
 * responde a pergunta sem ambiguidade. Quando NÃO é igual — a pessoa tem
 * mais de uma matrícula — mostrar só um dos dois números seria mentir por
 * omissão (ou "1" escondendo que há 2 matrículas para acompanhar, ou "2"
 * fingindo que são 2 pessoas): os dois aparecem, cada um rotulado ("1
 * mentorado · 2 matrículas"), nunca um número que não corresponda a
 * contagem nenhuma. Lista vazia devolve "" — quem chama decide como tratar
 * o estado "nenhum mentorado ainda" (ver `Vazio` em page.tsx).
 */
export function rotuloContagemMentorados(linhas: readonly LinhaCarteira[]): string {
  const mentorados = contarMentoradosDistintos(linhas);
  if (mentorados === 0) return "";

  const matriculas = linhas.length;
  const rotuloMentorados = `${mentorados} ${mentorados === 1 ? "mentorado" : "mentorados"}`;
  if (matriculas === mentorados) return rotuloMentorados;

  const rotuloMatriculas = `${matriculas} ${matriculas === 1 ? "matrícula" : "matrículas"}`;
  return `${rotuloMentorados} · ${rotuloMatriculas}`;
}

// ============================================================
// Sessão: estado da agenda e avisos de liberação (Tarefa 18)
// ============================================================

export interface EstadoDaAgenda {
  /** O que a tela escreve na pílula. */
  rotulo: string;
  /**
   * `true` quando o botão da ficha deve oferecer o `.ics` em vez da
   * sincronização — ou seja, quando não há conta do Google ligada. A tela usa
   * isto para TROCAR o texto do botão, nunca para esconder o botão: função que
   * some é função que o dono conclui que não existe (ver o critério da Tarefa
   * 18, e o mesmo raciocínio do caminho degradado em `acoes-calendario.ts`).
   */
  degradado: boolean;
}

/**
 * O estado da sessão perante a agenda do Google, em três palavras honestas.
 *
 * A ordem das perguntas importa. "Não conectada" vem ANTES de "não
 * sincronizada" porque, sem conta ligada, dizer "não sincronizada" jogaria a
 * culpa na sessão quando o que falta é a conexão — e mandaria o dono clicar
 * num botão que não tem como funcionar.
 *
 * `eventoGoogleId` vazio é o que significa "nunca foi para a agenda": é o
 * mesmo campo que `sincronizarSessaoNaAgenda` usa para decidir entre criar e
 * atualizar, então a tela e a ação leem o mesmo fato, e não duas versões dele.
 */
export function estadoDaAgendaDaSessao(
  sessao: { eventoGoogleId: string },
  agendaConectada: boolean,
): EstadoDaAgenda {
  if (!agendaConectada) return { rotulo: "agenda não conectada", degradado: true };
  if (sessao.eventoGoogleId.trim() !== "") return { rotulo: "na agenda", degradado: false };
  return { rotulo: "não sincronizada", degradado: false };
}

/**
 * O aviso que acompanha cada interruptor de liberação.
 *
 * Escrito no presente e na voz de quem vai ser afetado ("o mentorado passa a
 * ver"), não em jargão de sistema ("flag habilitada"): quem clica precisa
 * entender a consequência antes, não descobrir depois.
 */
export const AVISO_LIBERAR_GRAVACAO =
  "Ligando isto, o mentorado passa a ver o link da gravação no portal dele.";

export const AVISO_LIBERAR_TRANSCRICAO =
  "Ligando isto, o mentorado passa a ler a transcrição inteira desta sessão no portal dele.";

/**
 * O aviso EXTRA de sessão de turma, e a razão de ele existir separado.
 *
 * Numa sessão individual, liberar a transcrição devolve ao mentorado a própria
 * conversa. Numa sessão de turma, a mesma transcrição contém a fala de TODOS
 * os participantes — e liberar entrega essa fala a cada um deles. É a mesma
 * lição que fez `eventoDaSessao` não convidar ninguém em sessão de turma: o
 * que é coletivo carrega gente que não foi consultada.
 */
export const AVISO_LIBERAR_EM_TURMA =
  "Esta é uma sessão de turma: liberar a transcrição entrega a fala de todos os participantes para cada um deles.";
