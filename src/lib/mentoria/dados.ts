// Camada de LEITURA da mentoria — fala com o Supabase e devolve os tipos de
// `tipos.ts` já prontos para tela (sem tela nenhuma aqui, ver B2.2). Módulo
// SERVER-ONLY (usa `criarSupabaseServer`, que usa `next/headers`).
//
// As três regras que este arquivo existe para não quebrar:
//
// 1) NUNCA INVENTAR. Sem Supabase configurado, devolve `conectado: false` e
//    listas vazias — nunca dado de demonstração, nunca zero disfarçado de
//    dado real. Este repositório já teve o incidente de mostrar faturamento
//    fictício como se fosse real por omissão de configuração (comentário
//    longo em `src/lib/data/index.ts`); a mesma lição vale aqui.
//
// 2) Erro de leitura não derruba a tela. `error` do supabase-js e exceção
//    do cliente viram `conectado: false` com um `motivo` curto e humano —
//    sem nome de tabela, coluna, id de usuário ou trecho de SQL, porque quem
//    lê a tela não é quem depura. O detalhe técnico vai só para
//    `console.warn` (mesmo padrão de `src/middleware.test.ts`, MÉDIO 2).
//
// 3) `agoraIso` é sempre parâmetro — nunca `new Date()` aqui dentro. Mesma
//    regra de `progresso.ts`: quem sabe que horas são é quem chama.
//
// Escala pequena DE PROPÓSITO (docs/DESENHO-MENTOROS.md, decisão 2: 4 a 5
// mentorados, dezenas no máximo): cada função busca tudo em poucas
// consultas simples (join do PostgREST onde ajuda), sem paginação, sem
// cache, sem índice novo. Não é esquecimento — para dezenas de linhas isso
// seria complexidade sem retorno.
//
// O progresso NUNCA vem pronto do banco (nem da view `matricula_progresso`):
// é recalculado aqui a partir das sessões cruas, com `progressoDe` de
// `progresso.ts`. Se um dia a view divergir deste cálculo, é a view que está
// errada — esta camada não confia nela.

import { criarSupabaseServer } from "../supabase/server";
import { supabaseConfigurado } from "../data";
import { lerAtendimento, type AtendimentoLido } from "./dados-atendimento";
import {
  diasEmSilencio,
  progressoDe,
  proximaSessao,
  ultimaSessaoRealizada,
  type ProgressoMatricula,
} from "./progresso";
import {
  formatoProgramaDe,
  statusMatriculaDe,
  statusMentoradoDe,
  statusSessaoDe,
  type ConteudoLiberado,
  type Marco,
  type Matricula,
  type Mentorado,
  type Programa,
  type ScoreEvolucao,
  type Sessao,
  type TarefaMentoria,
} from "./tipos";
import { linkGravacaoValido } from "./validacao";

/* eslint-disable @typescript-eslint/no-explicit-any -- linha crua do
   Postgres via PostgREST: mesmo padrão de `Row` em src/lib/data/supabase-db.ts.
   Cada campo é revalidado/normalizado nas funções `linhaPara*` abaixo, nunca
   passado adiante com `as Tipo`. */
type Row = Record<string, any>;

// ============================================================
// Contrato
// ============================================================

export interface LinhaCarteira {
  mentorado: Mentorado;
  matricula: Matricula;
  programa: Programa | null;
  progresso: ProgressoMatricula;
  proxima: Sessao | null;
  ultimaRealizada: Sessao | null;
  /** `null` quando não há sessão realizada e `matricula.inicio` (ou `agoraIso`) é inválido — ver `diasEmSilencio` em `progresso.ts`. */
  silencio: { dias: number; nunca: boolean } | null;
}

export interface Carteira {
  /** `false` = sem Supabase configurado, ou a leitura falhou. */
  conectado: boolean;
  /** "" quando conectado; texto curto e humano quando não. */
  motivo: string;
  linhas: LinhaCarteira[];
}

export interface Ficha {
  conectado: boolean;
  motivo: string;
  mentorado: Mentorado | null;
  matriculas: Array<{ matricula: Matricula; programa: Programa | null; progresso: ProgressoMatricula }>;
  /** De todas as matrículas do mentorado, mais recente primeiro. */
  sessoes: Sessao[];
  tarefas: TarefaMentoria[];
  marcos: Marco[];
  /** Ordem cronológica CRESCENTE — é série temporal, gráfico ao contrário mente. */
  scores: ScoreEvolucao[];
  /**
   * O que já foi liberado para este mentorado, INCLUINDO o revogado.
   *
   * A ficha é a tela da gestão, e ela precisa da visão completa: "não é mais
   * oferecido a ele" e "nunca aconteceu" são coisas diferentes, e só a
   * primeira é verdade depois de uma revogação. Quem enxerga só o ativo é o
   * mentorado — e não por filtro de código, mas pela política de select de
   * 0018, que exige `arquivado = false` no ramo dele.
   */
  conteudos: ConteudoLiberado[];
  /**
   * Dados do atendimento que só a equipe autorizada pode ler.
   *
   * `conectado: false` aqui não derruba a ficha inteira: a tela seguinte
   * mostra que esse bloco não pôde ser carregado, sem fingir que não existe
   * histórico de atendimento.
   */
  atendimento: AtendimentoLido;
}

// ============================================================
// Textos que vão para a tela — genéricos de propósito (regra 2: nunca
// tabela, coluna, id ou SQL). O detalhe técnico de verdade só existe no
// `console.warn` de `avisar`, nunca aqui.
// ============================================================

const MOTIVO_SEM_CONEXAO =
  "Nenhuma conexão com o banco de dados configurada. Os dados da mentoria não podem ser carregados agora.";

const MOTIVO_ERRO_LEITURA = "Não foi possível carregar os dados da mentoria agora. Tente novamente em instantes.";

function atendimentoIndisponivel(conectado: boolean, encontrado: boolean): AtendimentoLido {
  return { conectado, encontrado, mapa: [], metas: [], passos: [], reflexoes: [], consentimentos: [] };
}

function carteiraDesconectada(motivo: string): Carteira {
  return { conectado: false, motivo, linhas: [] };
}

function fichaDesconectada(motivo: string): Ficha {
  return {
    conectado: false,
    motivo,
    mentorado: null,
    matriculas: [],
    sessoes: [],
    tarefas: [],
    marcos: [],
    scores: [],
    conteudos: [],
    atendimento: atendimentoIndisponivel(false, false),
  };
}

/**
 * Loga o detalhe técnico de uma falha (código/mensagem do supabase-js, ou a
 * exceção crua) — é AQUI, e só aqui, que ele pode aparecer. `motivo` (o que
 * vai para a tela) nunca herda nada deste log.
 */
function avisar(operacao: string, erro: unknown): void {
  if (erro && typeof erro === "object" && ("code" in erro || "message" in erro)) {
    const e = erro as { code?: string; message?: string };
    console.warn(`[mentoria/dados] ${operacao} falhou`, e.code, e.message);
  } else {
    console.warn(`[mentoria/dados] ${operacao} falhou`, erro);
  }
}

// ============================================================
// Mapeamento snake_case -> camelCase, uma função por entidade. Valores de
// enum SEMPRE passam pela normalizadora de `tipos.ts` — nunca `as Tipo` em
// cima do dado cru (regra 6): é assim que um enum novo do Postgres chegaria
// na tela sem ninguém notar.
// ============================================================

export function linhaParaMentorado(r: Row): Mentorado {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    alunoId: r.aluno_id ?? null,
    perfilId: r.perfil_id ?? null,
    nome: r.nome,
    telefone: r.telefone ?? "",
    email: r.email ?? "",
    origem: r.origem ?? "",
    status: statusMentoradoDe(r.status),
    criadoEm: r.criado_em,
  };
}

export function linhaParaPrograma(r: Row): Programa {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    nome: r.nome,
    formato: formatoProgramaDe(r.formato),
    totalSessoes: r.total_sessoes ?? null,
    preco: Number(r.preco ?? 0),
    ativo: Boolean(r.ativo),
    criadoEm: r.criado_em,
  };
}

export function linhaParaMatricula(r: Row): Matricula {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    mentoradoId: r.mentorado_id,
    programaId: r.programa_id,
    turmaId: r.turma_id ?? null,
    inicio: r.inicio,
    fimPrevisto: r.fim_previsto ?? null,
    status: statusMatriculaDe(r.status),
    sessoesPrevistas: r.sessoes_previstas ?? null,
    criadoEm: r.criado_em,
  };
}

/**
 * ALTO 1 — `linkGravacaoValido` (validacao.ts) só corria na ESCRITA (dentro
 * de `BaixaSchema`). Sem CHECK equivalente no Postgres, uma linha inserida
 * pelo Supabase Studio, por SQL direto, por script de importação, ou
 * gravada ANTES de essa validação existir, chegava intacta até o `<a href>`
 * clicável da ficha do mentorado — React 18 renderiza `href="javascript:…"`
 * sem reclamar (só avisa em dev), e o clique roda no navegador de quem está
 * vendo a ficha.
 *
 * A correção mora AQUI, na LEITURA, não na tela: validar só no componente
 * protegeria UMA tela; validar aqui — o único lugar por onde toda linha de
 * `sessao` passa antes de virar `Sessao` — protege TODO consumidor futuro
 * (a ficha de hoje, um relatório amanhã, uma API que ainda não existe), sem
 * que ninguém precise lembrar de repetir a checagem.
 */
function linkGravacaoDeLeitura(bruto: unknown): string {
  const valor = typeof bruto === "string" ? bruto.trim() : "";
  if (valor === "") return "";
  if (linkGravacaoValido(valor)) return valor;

  // Nunca o link inteiro no log — só o esquema (o pedaço que importa para
  // diagnosticar "por que isso foi descartado"), e nunca id de usuário/sessão
  // (mesma disciplina de `avisar`: detalhe técnico é só para quem depura).
  const esquema = valor.split(":")[0]?.slice(0, 20) ?? "";
  console.warn("[mentoria/dados] link_gravacao descartado na leitura — esquema não é http(s)", esquema);
  return "";
}

export function linhaParaSessao(r: Row): Sessao {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    matriculaId: r.matricula_id ?? null,
    turmaId: r.turma_id ?? null,
    numero: r.numero ?? null,
    quando: r.quando,
    duracaoMin: r.duracao_min ?? 60,
    status: statusSessaoDe(r.status),
    linkGravacao: linkGravacaoDeLeitura(r.link_gravacao),
    transcricao: r.transcricao ?? "",
    resumo: r.resumo ?? "",
    // Colunas de 0017. Os `??` existem porque uma linha pode ter sido lida de
    // um banco onde a migracao ainda nao rodou -- e nesse caso o padrao
    // seguro e o mesmo do schema: nao sincronizada, nada liberado.
    eventoGoogleId: r.evento_google_id ?? "",
    linkReuniao: linkGravacaoDeLeitura(r.link_reuniao),
    gravacaoLiberada: Boolean(r.gravacao_liberada),
    transcricaoLiberada: Boolean(r.transcricao_liberada),
    transcritaEm: r.transcrita_em ?? null,
    transcricaoOrigem: r.transcricao_origem ?? "",
    criadoEm: r.criado_em,
  };
}

/**
 * `conteudo_liberado` — material que o mentor liberou para UMA pessoa.
 *
 * `arquivado` é a revogação (0018): a linha fica, com a data e o título
 * originais, e apenas deixa de ser oferecida. `?? false` cobre a linha lida de
 * um banco onde a 0018 ainda não rodou — e cobre para o lado seguro, o de
 * continuar oferecendo o que foi prometido, em vez de revogar em silêncio o
 * material de todo mundo por causa de uma coluna ausente.
 */
export function linhaParaConteudoLiberado(r: Row): ConteudoLiberado {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    mentoradoId: r.mentorado_id,
    titulo: r.titulo,
    url: r.url ?? "",
    liberadoEm: r.liberado_em,
    arquivado: Boolean(r.arquivado ?? false),
    criadoEm: r.criado_em,
  };
}

export function linhaParaTarefaMentoria(r: Row): TarefaMentoria {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    mentoradoId: r.mentorado_id,
    sessaoId: r.sessao_id ?? null,
    titulo: r.titulo,
    prazo: r.prazo ?? null,
    concluida: Boolean(r.concluida),
    concluidaEm: r.concluida_em ?? null,
    marcadaPor: r.marcada_por ?? "",
    criadoEm: r.criado_em,
  };
}

export function linhaParaMarco(r: Row): Marco {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    mentoradoId: r.mentorado_id,
    titulo: r.titulo,
    descricao: r.descricao ?? "",
    conquistadoEm: r.conquistado_em,
    criadoEm: r.criado_em,
  };
}

export function linhaParaScoreEvolucao(r: Row): ScoreEvolucao {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    mentoradoId: r.mentorado_id,
    semana: r.semana,
    score: Number(r.score),
    motivo: r.motivo ?? "",
    criadoEm: r.criado_em,
  };
}

export function linhaParaProgramaOuNulo(r: Row): Programa | null {
  // O join `.select("*, programa(*)")` embute o programa como objeto
  // aninhado (relação muitos-para-um, mesmo padrão de `r.alunos?.nome` em
  // supabase-db.ts) — `null`/ausente só quando a FK não resolveu.
  return r.programa ? linhaParaPrograma(r.programa as Row) : null;
}

// ============================================================
// Sessões de uma matrícula: OU vinculadas direto (`matricula_id`), OU —
// quando a matrícula é de turma (`turma_id` preenchido) — vinculadas à
// turma (aula em grupo, `sessao.turma_id`). Mesmo critério que a view
// `matricula_progresso` usa desde a correção de 0008 (comentário "o médio do
// join incompleto"); reproduzido aqui em JS porque esta camada não confia na
// view (regra 4), mas o CRITÉRIO de vínculo é o mesmo, só o cálculo que é
// refeito.
// ============================================================

function sessoesDaMatricula(matricula: Matricula, todasSessoes: readonly Sessao[]): Sessao[] {
  return todasSessoes.filter(
    (sessao) =>
      sessao.matriculaId === matricula.id ||
      (matricula.turmaId !== null && sessao.turmaId === matricula.turmaId)
  );
}

/** União das sessões de várias matrículas do mesmo mentorado, sem repetir. */
function sessoesDeTodasAsMatriculas(matriculas: readonly Matricula[], todasSessoes: readonly Sessao[]): Sessao[] {
  const vistas = new Map<string, Sessao>();
  for (const matricula of matriculas) {
    for (const sessao of sessoesDaMatricula(matricula, todasSessoes)) {
      vistas.set(sessao.id, sessao);
    }
  }
  return [...vistas.values()];
}

/**
 * `Date.parse` defensivo — mesmo motivo de `quandoValido` em `progresso.ts`:
 * uma data inválida não pode quebrar a comparação (`<`/`>`) nem lançar; ela
 * só precisa parar de competir por uma posição "correta" na ordenação.
 */
function quandoOuLimite(iso: string, limiteQuandoInvalido: number): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : limiteQuandoInvalido;
}

// ============================================================
// lerCarteira
// ============================================================

/**
 * Ordem da carteira (regra 8): quem tem `proxima` sessão mais cedo primeiro;
 * quem não tem nenhuma vai por último, em ordem alfabética pelo nome do
 * mentorado. `localeCompare` com "pt-BR" para acentuação/maiúscula
 * ordenarem do jeito que uma pessoa lendo em português espera.
 */
function compararLinhasDaCarteira(a: LinhaCarteira, b: LinhaCarteira): number {
  const quandoA = a.proxima ? Date.parse(a.proxima.quando) : null;
  const quandoB = b.proxima ? Date.parse(b.proxima.quando) : null;

  if (quandoA !== null && quandoB !== null) return quandoA - quandoB;
  if (quandoA !== null) return -1; // a tem sessão marcada, b não: a vem primeiro
  if (quandoB !== null) return 1;
  return a.mentorado.nome.localeCompare(b.mentorado.nome, "pt-BR");
}

export async function lerCarteira(agoraIso: string): Promise<Carteira> {
  if (!supabaseConfigurado()) {
    // Regra 1: nada de Supabase configurado -> nada de dado, nem consulta
    // nenhuma é feita (a tela decide o que mostrar a partir de `conectado`).
    return carteiraDesconectada(MOTIVO_SEM_CONEXAO);
  }

  try {
    const s = criarSupabaseServer();

    // Três consultas simples, em paralelo — escala pequena de propósito
    // (ver cabeçalho do arquivo): dezenas de linhas cabem inteiras em
    // memória sem paginação.
    const [mentoradosRes, matriculasRes, sessoesRes] = await Promise.all([
      s.from("mentorado").select("*"),
      s.from("matricula").select("*, programa(*)"),
      s.from("sessao").select("*"),
    ]);

    const erro = mentoradosRes.error ?? matriculasRes.error ?? sessoesRes.error;
    if (erro) {
      avisar("lerCarteira", erro);
      return carteiraDesconectada(MOTIVO_ERRO_LEITURA);
    }

    const mentoradosPorId = new Map<string, Mentorado>(
      ((mentoradosRes.data ?? []) as Row[]).map((r) => [r.id as string, linhaParaMentorado(r)])
    );
    const todasSessoes = ((sessoesRes.data ?? []) as Row[]).map(linhaParaSessao);

    const linhas: LinhaCarteira[] = ((matriculasRes.data ?? []) as Row[])
      .map((r): LinhaCarteira | null => {
        const matricula = linhaParaMatricula(r);
        const mentorado = mentoradosPorId.get(matricula.mentoradoId);
        // Defensivo, não esperado em produção (FK garante mentorado_id
        // válido): se RLS/dado inconsistente devolver uma matrícula órfã,
        // ela é ignorada em vez de quebrar a carteira inteira.
        if (!mentorado) return null;

        const programa = linhaParaProgramaOuNulo(r);
        const sessoes = sessoesDaMatricula(matricula, todasSessoes);

        return {
          mentorado,
          matricula,
          programa,
          progresso: progressoDe(matricula, programa, sessoes),
          proxima: proximaSessao(sessoes, agoraIso),
          ultimaRealizada: ultimaSessaoRealizada(sessoes),
          silencio: diasEmSilencio(matricula, sessoes, agoraIso),
        };
      })
      .filter((linha): linha is LinhaCarteira => linha !== null)
      .sort(compararLinhasDaCarteira);

    return { conectado: true, motivo: "", linhas };
  } catch (excecao) {
    avisar("lerCarteira", excecao);
    return carteiraDesconectada(MOTIVO_ERRO_LEITURA);
  }
}

// ============================================================
// lerFicha
// ============================================================

// `agoraIso` faz parte do contrato (consistência com `lerCarteira`, e
// espaço para a tela de ficha um dia precisar de "próxima sessão"/"dias sem
// sessão" também) mas `Ficha`, hoje, não tem nenhum campo que dependa de
// "agora" — só `sessoes` (ordem por data, não por relação com agora) e
// `scores` (ordem cronológica). Por isso o parâmetro existe e não é lido:
// não é esquecimento, é o mesmo motivo de `agoraIso` nunca poder nascer de
// `new Date()` aqui dentro — quem decide "agora" é sempre quem chama.
export async function lerFicha(mentoradoId: string, agoraIso: string): Promise<Ficha> {
  void agoraIso;
  if (!supabaseConfigurado()) {
    return fichaDesconectada(MOTIVO_SEM_CONEXAO);
  }

  try {
    const s = criarSupabaseServer();

    const { data: mentoradoRow, error: erroMentorado } = await s
      .from("mentorado")
      .select("*")
      .eq("id", mentoradoId)
      .maybeSingle();

    if (erroMentorado) {
      avisar("lerFicha/mentorado", erroMentorado);
      return fichaDesconectada(MOTIVO_ERRO_LEITURA);
    }

    if (!mentoradoRow) {
      // Regra 7: CONECTOU e não achou. Diferente de "não consegui
      // conectar" — por isso `conectado: true` aqui, não `false`.
      return {
        conectado: true,
        motivo: "",
        mentorado: null,
        matriculas: [],
        sessoes: [],
        tarefas: [],
        marcos: [],
        scores: [],
        conteudos: [],
        atendimento: atendimentoIndisponivel(true, false),
      };
    }

    const mentorado = linhaParaMentorado(mentoradoRow as Row);

    const [matriculasRes, sessoesRes, tarefasRes, marcosRes, scoresRes, conteudosRes, atendimento] = await Promise.all([
      s.from("matricula").select("*, programa(*)").eq("mentorado_id", mentoradoId),
      // Todas as sessões, não só `eq("matricula_id", ...)`: sessão de turma
      // não carrega mentorado_id nem matricula_id (ver `sessoesDaMatricula`
      // acima) — filtrar em memória é o que cobre os dois vínculos com uma
      // única consulta simples, coerente com a escala pequena do domínio.
      s.from("sessao").select("*"),
      s.from("tarefa_mentoria").select("*").eq("mentorado_id", mentoradoId),
      s.from("marco").select("*").eq("mentorado_id", mentoradoId),
      s.from("score_evolucao").select("*").eq("mentorado_id", mentoradoId),
      // A ficha da GESTÃO lê o conteúdo liberado inteiro, revogado incluído:
      // "não é mais oferecido a ele" e "nunca aconteceu" são coisas
      // diferentes. Quem vê só o ativo é o mentorado, e não por filtro aqui —
      // pela política de select de 0018.
      s.from("conteudo_liberado").select("*").eq("mentorado_id", mentoradoId),
      lerAtendimento(mentoradoId),
    ]);

    const erro =
      matriculasRes.error ??
      sessoesRes.error ??
      tarefasRes.error ??
      marcosRes.error ??
      scoresRes.error ??
      conteudosRes.error;
    if (erro) {
      avisar("lerFicha", erro);
      return fichaDesconectada(MOTIVO_ERRO_LEITURA);
    }

    const matriculas = ((matriculasRes.data ?? []) as Row[]).map(linhaParaMatricula);
    const todasSessoes = ((sessoesRes.data ?? []) as Row[]).map(linhaParaSessao);

    const matriculasComProgresso = ((matriculasRes.data ?? []) as Row[]).map((r) => {
      const matricula = linhaParaMatricula(r);
      const programa = linhaParaProgramaOuNulo(r);
      return {
        matricula,
        programa,
        progresso: progressoDe(matricula, programa, sessoesDaMatricula(matricula, todasSessoes)),
      };
    });

    // Sessões de TODAS as matrículas do mentorado, mais recente primeiro
    // (regra 8). Data inválida vai para o fim (`-Infinity`), nunca quebra a
    // ordenação — mesma cautela de `quandoValido` em progresso.ts.
    const sessoes = sessoesDeTodasAsMatriculas(matriculas, todasSessoes).sort(
      (a, b) => quandoOuLimite(b.quando, -Infinity) - quandoOuLimite(a.quando, -Infinity)
    );

    const tarefas = ((tarefasRes.data ?? []) as Row[]).map(linhaParaTarefaMentoria);
    const marcos = ((marcosRes.data ?? []) as Row[]).map(linhaParaMarco);

    // Scores em ordem CRESCENTE (regra 8: é série temporal, gráfico ao
    // contrário mente). Data inválida vai para o início do array (menos
    // relevante que qualquer semana válida), pelo mesmo motivo defensivo.
    const scores = ((scoresRes.data ?? []) as Row[])
      .map(linhaParaScoreEvolucao)
      .sort((a, b) => quandoOuLimite(a.semana, -Infinity) - quandoOuLimite(b.semana, -Infinity));

    // Mais recente primeiro: a lista da ficha é operacional, e o que foi
    // liberado agora é o que a pessoa acabou de combinar com o mentorado.
    const conteudos = ((conteudosRes.data ?? []) as Row[])
      .map(linhaParaConteudoLiberado)
      .sort((a, b) => quandoOuLimite(b.liberadoEm, -Infinity) - quandoOuLimite(a.liberadoEm, -Infinity));

    return {
      conectado: true,
      motivo: "",
      mentorado,
      matriculas: matriculasComProgresso,
      sessoes,
      tarefas,
      marcos,
      scores,
      conteudos,
      atendimento,
    };
  } catch (excecao) {
    avisar("lerFicha", excecao);
    return fichaDesconectada(MOTIVO_ERRO_LEITURA);
  }
}

/**
 * O id do mentorado vinculado a um aluno do CRM — ou `null`.
 *
 * É a PONTE entre `/crm/[id]` e `/mentoria/[id]`, e ela é um link, não um
 * `JOIN`: `alunos` (funil de vendas) e `mentorado` (pós-venda) continuam
 * sendo duas tabelas, pela decisão de modelagem registrada no cabeçalho de
 * `mentorado` em 0006. Quem faz a ponte é a coluna `mentorado.aluno_id`.
 *
 * Devolve só o ID, e não a linha inteira, porque é só isso que o atalho
 * precisa: a ficha de CRM não desenha nada do mentorado, ela oferece o
 * caminho até a outra ficha — e o que a pessoa pode ver LÁ é decidido lá,
 * pela RLS de quem abrir.
 *
 * FAIL-CLOSED EM TODOS OS CAMINHOS. Sem Supabase, id vazio, erro de leitura,
 * exceção do cliente, nenhuma linha, ou linha sem id utilizável: `null`, e a
 * ficha de CRM não desenha o link. Um atalho que falta é um incômodo que a
 * pessoa vê; um `/mentoria/undefined` é uma tela de erro, e um id lido
 * errado seria o histórico de outra pessoa. Nenhuma dessas trocas vale o
 * atalho.
 *
 * `maybeSingle()` de propósito: dois mentorados apontando para o mesmo aluno
 * é dado inconsistente, e nesse caso o supabase-js devolve ERRO em vez de
 * escolher um — o que também derruba no `null`. Escolher "o primeiro"
 * mandaria a pessoa para uma das duas fichas sem dizer que havia outra.
 */
export async function lerMentoradoDoAluno(alunoId: string): Promise<string | null> {
  if (!supabaseConfigurado()) return null;

  // `aluno_id = ''` não é pergunta que se faça ao banco: nenhuma linha tem
  // essa chave, e a consulta só existiria para voltar vazia.
  const id = typeof alunoId === "string" ? alunoId.trim() : "";
  if (id === "") return null;

  try {
    const s = criarSupabaseServer();
    const { data, error } = await s.from("mentorado").select("id").eq("aluno_id", id).maybeSingle();

    if (error) {
      avisar("lerMentoradoDoAluno", error);
      return null;
    }

    // Conectou e não achou: aluno que ainda não virou mentorado é o caso
    // NORMAL (lead em prospecção), não uma falha — por isso não passa por
    // `avisar`, que encheria o log de ruído a cada ficha de lead aberta.
    const bruto = (data as Row | null)?.id;
    return typeof bruto === "string" && bruto.trim() !== "" ? bruto.trim() : null;
  } catch (excecao) {
    avisar("lerMentoradoDoAluno", excecao);
    return null;
  }
}
