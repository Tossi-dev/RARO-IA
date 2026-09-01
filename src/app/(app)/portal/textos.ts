// Formatação de texto do PORTAL DO MENTORADO (B3.2) — módulo PURO, sem "use
// client", sem React, sem `new Date()` livre. Mesmo padrão de
// `src/app/(app)/mentoria/textos.ts`: quem monta a árvore de componentes em
// `page.tsx` chama estas funções, nunca formata data ou monta rótulo na
// marra dentro do JSX.
//
// Regras de estilo da casa que valem para todo texto que sai daqui:
//   - zero emoji (ver o teste "zero emoji e zero nome de papel" em textos.test.ts)
//   - os únicos glifos usados no portal inteiro são ▲ ▼ ▬ (variação de
//     score — ver `variacaoScore`, reaproveitada de `mentoria/textos.ts`)
//   - nenhum nome de papel ("mentorado", "dono"...) aparece em texto de
//     tela: quem lê o portal é o CLIENTE do Jefson, não alguém que precisa
//     saber como o sistema classifica pessoas por dentro
//   - nenhum número é inventado: cada função recebe o dado pronto de
//     `src/lib/mentoria/portal.ts` e só formata

import type { Matricula, Programa } from "@/lib/mentoria/tipos";

/** Fuso fixo: mesmo motivo documentado em `mentoria/textos.ts` (FUSO_BRASIL)
 *  e em `src/lib/agenda.ts` — "12/08 às 23:00" não pode virar "13/08 às
 *  02:00" só porque o servidor roda em UTC. Não é reexportado de
 *  `mentoria/textos.ts` porque lá a constante não é exportada (mesmo motivo
 *  de `avisar` em `dados.ts`/`portal.ts`: manter o módulo de origem com a
 *  superfície exportada que a tarefa que o criou autorizou). */
const FUSO_BRASIL = "America/Sao_Paulo";

// ============================================================
// saudacao — só o primeiro nome.
// ============================================================

/**
 * O primeiro nome de `nome`, para a saudação no topo do portal
 * ("Olá, Ana"). Nunca o nome completo — um sobrenome na saudação soa
 * formal, não acolhedor, e não é assim que o Jefson chamaria o próprio
 * cliente.
 *
 * `""` para entrada vazia, só espaço, ou não-string (`null`/`undefined` de
 * um chamador descuidado) — nunca lança. A TELA decide o que fazer com uma
 * saudação sem nome (texto genérico), não esta função.
 */
export function saudacao(nome: string): string {
  if (typeof nome !== "string") return "";
  const primeiro = nome.trim().split(/\s+/).filter(Boolean)[0];
  return primeiro ?? "";
}

// ============================================================
// Calendário civil no fuso do Brasil — base de `diasAte` e `tomDoPrazo`.
// ============================================================

interface DiaCivil {
  ano: number;
  mes: number;
  dia: number;
}

/**
 * Extrai o dia civil (ano/mês/dia) de um TIMESTAMP completo, NO FUSO DO
 * BRASIL — usado por `diasAte`, cujas duas entradas (`quando` de uma sessão,
 * `agora`) são sempre `timestamptz`. `null` para entrada vazia/inválida,
 * nunca lança (mesma disciplina de `dataHoraBr` em `mentoria/textos.ts`).
 */
function diaCivilDoTimestamp(iso: string): DiaCivil | null {
  if (typeof iso !== "string" || iso.trim() === "") return null;
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return null;

  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO_BRASIL,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(data);
  const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value;
  const dia = Number(parte("day"));
  const mes = Number(parte("month"));
  const ano = Number(parte("year"));
  if (!dia || !mes || !ano) return null;
  return { ano, mes, dia };
}

/**
 * O mesmo dia civil, mas lido de uma coluna `date` do Postgres (sem hora,
 * sem fuso — ex.: `tarefa_mentoria.prazo`), pela MESMA razão de `dataBr` em
 * `mentoria/textos.ts` (MÉDIO 2 lá): passar "2026-08-20" por `new Date(...)`
 * embutiria meia-noite UTC, que em São Paulo (UTC-3) já é o dia anterior —
 * um prazo apareceria um dia mais cedo do que foi combinado. Lê os três
 * números na marra, nunca cria um `Date`.
 */
const REGEX_DATA_CIVIL = /^(\d{4})-(\d{2})-(\d{2})$/;

function diaCivilDaData(iso: string): DiaCivil | null {
  if (typeof iso !== "string") return null;
  const m = REGEX_DATA_CIVIL.exec(iso.trim());
  if (!m) return null;
  const [, anoTxt, mesTxt, diaTxt] = m;
  const ano = Number(anoTxt);
  const mes = Number(mesTxt);
  const dia = Number(diaTxt);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return { ano, mes, dia };
}

/** Dias corridos de `a` até `b` (positivo quando `b` é depois de `a`), como
 *  contagem de DIAS CIVIS — não de horas/24h. `Date.UTC` aqui não representa
 *  hora nenhuma de verdade: é só um jeito estável de subtrair dois
 *  calendários sem herdar bug de horário de verão. */
function diasEntre(a: DiaCivil, b: DiaCivil): number {
  const msA = Date.UTC(a.ano, a.mes - 1, a.dia);
  const msB = Date.UTC(b.ano, b.mes - 1, b.dia);
  return Math.round((msB - msA) / 86_400_000);
}

// ============================================================
// diasAte
// ============================================================

/**
 * "hoje" / "amanhã" / "em N dias" para uma data-hora futura (`quandoIso`),
 * contando a partir de `agoraIso` — pensado para "a próxima sessão é em
 * quantos dias" no destaque do portal. `""` para entrada inválida OU para
 * uma data no PASSADO: `proximaSessao` (progresso.ts) já garante que a
 * sessão em destaque nunca é passada, então um `quandoIso` anterior a
 * `agoraIso` aqui é sinal de uso indevido da função — a resposta honesta é
 * "não sei dizer", não um "em -3 dias" sem sentido para quem lê a tela.
 */
export function diasAte(quandoIso: string, agoraIso: string): string {
  const quando = diaCivilDoTimestamp(quandoIso);
  const agora = diaCivilDoTimestamp(agoraIso);
  if (!quando || !agora) return "";

  const diff = diasEntre(agora, quando);
  if (diff < 0) return "";
  if (diff === 0) return "hoje";
  if (diff === 1) return "amanhã";
  return `em ${diff} dias`;
}

// ============================================================
// tomDoPrazo
// ============================================================

export type TomPrazo = "vencido" | "proximo" | "neutro" | "sem prazo";

/** Dentro de quantos dias um prazo ainda não vencido já merece o tom
 *  "próximo" (dourado, na tela) — hoje e os próximos 3 dias corridos. Mesma
 *  ideia de limiar fixo e documentado de `LIMIAR_DIAS_SEM_SESSAO` em
 *  `mentoria/textos.ts`, só que para o lado contrário (prazo chegando, não
 *  silêncio se alongando). */
const LIMIAR_PRAZO_PROXIMO_DIAS = 3;

/**
 * O tom de uma tarefa pelo prazo dela — "vencido"|"proximo"|"neutro"|"sem
 * prazo". `prazoIso` é a coluna `date` de `tarefa_mentoria` (sem hora, sem
 * fuso — por isso `diaCivilDaData`, nunca `new Date()` direto nela);
 * `agoraIso` é o `timestamptz` da borda da rota. `concluida` é
 * `tarefa.concluida` — o mesmo booleano que já risca o título na tela.
 *
 * - tarefa CONCLUÍDA -> sempre "neutro", seja qual for o prazo (mesmo no
 *   passado). Uma entrega já feita não está vencida — pintar de vermelho o
 *   que já foi cumprido diria ao cliente que ele ainda deve algo que já
 *   entregou. Por isso esta checagem vem ANTES de qualquer leitura de
 *   prazo, e não é bypassada por prazo ausente/mal formado.
 * - `null`/`""` -> "sem prazo": nada foi combinado, não é nem urgência nem
 *   tranquilidade, é ausência.
 * - prazo mal formado (não bate `AAAA-MM-DD`) -> "neutro": existe um prazo
 *   na linha, mas não dá para julgar a urgência dele com segurança — o
 *   defensivo aqui é NÃO alarmar (nunca "vencido" por um dado que não pôde
 *   ser lido).
 * - `agoraIso` inválido -> mesma cautela, "neutro".
 */
export function tomDoPrazo(
  prazoIso: string | null | undefined,
  agoraIso: string,
  concluida = false
): TomPrazo {
  if (concluida) return "neutro";

  if (typeof prazoIso !== "string" || prazoIso.trim() === "") return "sem prazo";

  const prazo = diaCivilDaData(prazoIso);
  const agora = diaCivilDoTimestamp(agoraIso);
  if (!prazo || !agora) return "neutro";

  const diff = diasEntre(agora, prazo);
  if (diff < 0) return "vencido";
  if (diff <= LIMIAR_PRAZO_PROXIMO_DIAS) return "proximo";
  return "neutro";
}

// ============================================================
// dataHoraPorExtenso
// ============================================================

/**
 * "quinta-feira, 20 de agosto de 2026 às 12:30" — a data da próxima sessão,
 * em destaque no portal. Fuso fixo em São Paulo, mesma cautela de
 * `dataHoraBr` em `mentoria/textos.ts`: entrada vazia, inválida, `null` ou
 * `undefined` devolve `""` e NUNCA lança.
 */
export function dataHoraPorExtenso(iso: string): string {
  if (typeof iso !== "string" || iso.trim() === "") return "";

  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "";

  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO_BRASIL,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(data);

  const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  const semana = parte("weekday");
  const dia = parte("day");
  const mes = parte("month");
  const ano = parte("year");
  const hora = parte("hour");
  const minuto = parte("minute");
  if (!semana || !dia || !mes || !ano || !hora || !minuto) return "";

  return `${semana}, ${dia} de ${mes} de ${ano} às ${hora}:${minuto}`;
}

// ============================================================
// programaAtual
// ============================================================

/**
 * O nome do programa para a saudação do topo ("Ana · Elite"). Com mais de
 * uma matrícula, prioriza a ATIVA (é o programa que a pessoa está cursando
 * agora); sem nenhuma ativa, cai na primeira da lista (a mais recente — ver
 * o comentário de `Portal.matriculas` em `portal.ts`, que não garante ordem
 * própria além da que `lerPortal` já monta). Lista vazia, ou matrícula sem
 * `programa` vinculado (defensivo — RLS/join poderia devolver `null`),
 * devolvem `""`: nunca inventa um nome de programa.
 */
export function programaAtual(
  matriculas: readonly { matricula: Matricula; programa: Programa | null }[]
): string {
  if (matriculas.length === 0) return "";
  const ativa = matriculas.find((m) => m.matricula.status === "ativa");
  const escolhida = ativa ?? matriculas[0];
  return escolhida.programa?.nome ?? "";
}

// ============================================================
// mensagemDeErro — MÉDIO 5 da auditoria.
// ============================================================
//
// `page.tsx` costumava imprimir `searchParams.erro` DIRETO dentro do banner
// oficial da tela — qualquer um podia mandar um link
// "/portal?erro=Sua conta foi suspensa, ligue para 0800..." e esse texto
// aparecia como se fosse um aviso do próprio produto. A correção não é
// "escapar" o texto (o problema não é HTML injection, é CONFIANÇA: nada
// que veio de uma querystring pode ser tratado como mensagem oficial). A
// correção é uma TABELA FECHADA: a Server Action manda só um código curto
// (`acoes-portal.ts`, `CODIGO_ERRO_TAREFA`), e esta função é o ÚNICO lugar
// que traduz código -> frase. Um código que não está na tabela — seja um
// typo, seja um ataque deliberado — nunca ecoa; cai numa frase genérica.
const MENSAGENS_ERRO: Record<string, string> = {
  tarefa: "Não foi possível atualizar esta tarefa agora. Tente novamente em instantes.",
  // Tarefa 36 — os dois códigos do card de avisos. O portal traduz CÓDIGO,
  // nunca frase: `?erro=` com texto livre foi o MÉDIO 5 da auditoria (a URL
  // virava um banner oficial do produto escrito por quem mandou o link).
  comentario: "Não foi possível enviar seu comentário agora. Tente novamente em instantes.",
  aviso: "Não foi possível registrar a leitura deste aviso agora. Tente novamente em instantes.",
  mensagem: "Não foi possível enviar sua mensagem agora. Tente novamente em instantes.",
  // Tarefa 39 — o roteiro de entrada. A mesma frase serve para os dois casos
  // ("não deu para salvar" e "essa etapa não é sua") de propósito: separar os
  // dois contaria a quem tentou de quem é a etapa que ele não conseguiu
  // marcar, e essa informação é do time.
  etapa: "Não foi possível marcar esta etapa agora. Tente novamente em instantes.",
};

const MENSAGEM_ERRO_GENERICA = "Não foi possível concluir a ação agora. Tente novamente em instantes.";

/**
 * Traduz o código curto de `?erro=` (nunca o texto livre da URL) na frase
 * que a tela mostra. `null` quando não há código nenhum — é a tela quem
 * decide não desenhar banner nenhum nesse caso. Código vazio é tratado
 * como ausência (mesma cautela do resto deste módulo: `""` nunca é tratado
 * como "algo para mostrar").
 */
export function mensagemDeErro(codigo: string | null | undefined): string | null {
  if (typeof codigo !== "string" || codigo.trim() === "") return null;
  return MENSAGENS_ERRO[codigo] ?? MENSAGEM_ERRO_GENERICA;
}

// ============================================================
// Linha do tempo e sessões liberadas (Tarefa 20)
// ============================================================

/**
 * O título do card da jornada.
 *
 * "Sua evolução", e não "Histórico": histórico é palavra de sistema, e esta é
 * a tela do cliente. O card ao lado, o do número, virou "Evolução do score" na
 * mesma tarefa — dois cards chamados "Evolução" na mesma página obrigariam a
 * pessoa a adivinhar qual é qual.
 */
export const TITULO_LINHA_TEMPO = "Sua evolução";

/**
 * O que a tela diz quando não há nada a contar.
 *
 * Escrita no futuro ("vão aparecer"), não no negativo ("nada encontrado"):
 * lista vazia no portal de quem acabou de entrar é o estado NORMAL, não uma
 * falha. Dizer "nenhum registro" para alguém na primeira semana de mentoria
 * soa como se algo tivesse dado errado.
 */
export const VAZIO_LINHA_TEMPO =
  "Ainda não há nada para contar por aqui. Conforme as sessões acontecerem e os marcos forem conquistados, eles aparecem nesta lista.";

/** O rótulo do bloco que abre a transcrição — verbo, para a pessoa saber que é um clique. */
export const ABRIR_TRANSCRICAO = "Ver a transcrição desta sessão";

/**
 * O rótulo do link de gravação.
 *
 * A tela só chega a desenhar isto quando a view devolveu o link preenchido —
 * ou seja, quando o mentor liberou. Não há flag para consultar aqui, e é de
 * propósito: campo vazio, seção não desenhada.
 */
export const VER_GRAVACAO = "Assistir à gravação";
