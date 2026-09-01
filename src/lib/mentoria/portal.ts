// Camada de LEITURA do PORTAL DO MENTORADO — a tela que o mentorado (o
// cliente do Jefson) abre para ver a própria jornada: matrículas, sessões,
// tarefas, marcos, evolução de score, conteúdo liberado. Sem tela nenhuma
// aqui (ver B3.1); mesmo padrão de `dados.ts` (server-only, usa
// `criarSupabaseServer`).
//
// ============================================================
// A GARANTIA DESTE ARQUIVO NÃO É O CÓDIGO ABAIXO. É O BANCO.
// ============================================================
//
// "O mentorado vê só o que é dele" NÃO é uma regra que esta função
// implementa filtrando direito — é uma regra que o Postgres implementa via
// Row Level Security, e que esta função só tem o privilégio de LER o
// resultado de. As políticas vivem em `supabase/migrations/0007_mentoros_rls.sql`
// (a função `mentorado_atual()`, que devolve o id da ficha ligada ao
// usuário logado via `perfil_id = auth.uid()`, e as políticas do "grupo 3 —
// portal do mentorado" que a usam) e em `0008_mentoros_rls_correcoes.sql`
// (a correção que também escopa tudo por `workspace_id`).
//
// Na prática: se um bug ou um refactor apagasse AMANHÃ todo `.eq(...)`
// deste arquivo — cada filtro de conveniência abaixo —, uma consulta como
// `s.from("matricula").select("*")` continuaria devolvendo, para um usuário
// com `papel_atual() = 'mentorado'`, SÓ as matrículas cujo `mentorado_id`
// bate com `mentorado_atual()`. Não porque o JavaScript pediu isso: porque
// a política de RLS reavalia essa condição a CADA query, no banco, fora do
// alcance de qualquer bug de aplicação. A tela não filtra, o banco filtra —
// é por isso que dá para confiar num portal onde o mentorado nunca deveria
// ver a ficha, a sessão ou o score de outro mentorado, mesmo que amanhã
// alguém escreva uma rota nova, um relatório novo, ou apague uma linha
// deste arquivo sem entender por que ela estava aqui.
//
// O que os `.eq("mentorado_id", meuId)` abaixo SÃO: otimização. Evitam
// puxar do banco a ficha/matrícula/sessão de todo mundo do workspace só
// para jogar fora depois em memória — como `lerFicha`, em `dados.ts`, já
// faz para uma ficha vista pelo time interno. O que eles NÃO SÃO: a razão
// de o dado de outro mentorado nunca aparecer aqui. Essa razão é só a RLS.
//
// ============================================================
// "Quem sou eu": nunca um id vindo de fora.
// ============================================================
//
// `lerPortal` tem UM parâmetro (`agoraIso`) — de propósito, não por
// simplicidade. Um segundo parâmetro `mentoradoId` seria o buraco clássico
// de segurança de aplicação: bastaria a tela (ou um chamador futuro
// descuidado) ler esse id de `params`/query string/cookie não assinado e
// repassar para cá, e qualquer um trocando o número na URL veria o portal
// alheio. Em vez disso, `lerPortal` pergunta ao PRÓPRIO BANCO "quem está
// logado, e qual é a ficha de mentorado ligada a essa pessoa" via
// `s.rpc("mentorado_atual")` — a MESMA função SQL (`security definer`, lê
// `perfil_id = auth.uid()`) que toda política de RLS do grupo 3 já usa.
// Não é uma reimplementação em JS de "quem sou eu": é a pergunta sendo
// feita ao único lugar que sabe responder com segurança — a sessão
// autenticada dentro do próprio Postgres.
//
// As mesmas três regras de `dados.ts` valem aqui:
//
// 1) NUNCA INVENTAR. Sem Supabase configurado -> `conectado: false`, tudo
//    vazio, ZERO consultas — nunca dado de demonstração.
// 2) Erro de leitura -> `conectado: false` com `motivo` curto e humano, sem
//    nome de tabela/coluna/id/SQL; detalhe técnico só em `console.warn`.
// 3) `agoraIso` é sempre parâmetro — nunca `new Date()` aqui dentro.
//
// E uma quarta, específica do portal:
//
// 4) `ehMentorado: false` NÃO é erro nem falha de conexão — é o caso de
//    quem está logado (um gestor curioso abrindo /portal, ou um mentorado
//    cujo `perfil_id` ainda não foi vinculado) mas não tem ficha de
//    mentorado. `conectado: true`, listas vazias, e ZERO consultas às
//    tabelas dependentes: pedir sessão/tarefa/marco de um mentorado que não
//    existe seria trabalho à toa e ruído de log — só o `rpc` de identidade
//    é chamado nesse caminho.

import { criarSupabaseServer } from "../supabase/server";
import { supabaseConfigurado } from "../data";
import { progressoDe, proximaSessao, type ProgressoMatricula } from "./progresso";
import {
  linhaParaMarco,
  linhaParaMatricula,
  linhaParaConteudoLiberado,
  linhaParaMentorado,
  linhaParaProgramaOuNulo,
  linhaParaScoreEvolucao,
  linhaParaSessao,
  linhaParaTarefaMentoria,
} from "./dados";
import { historicoDe, projetarParaPortal, type FatoHistorico } from "./historico";
import type {
  ConteudoLiberado,
  Marco,
  Matricula,
  Mentorado,
  Programa,
  ScoreEvolucao,
  Sessao,
  TarefaMentoria,
} from "./tipos";

/* eslint-disable @typescript-eslint/no-explicit-any -- linha crua do
   Postgres via PostgREST, mesmo padrão de `Row` em `dados.ts`. Cada campo é
   revalidado/normalizado pelos mapeadores `linhaPara*` (importados de
   `dados.ts`, ou definidos aqui para `conteudo_liberado`), nunca passado
   adiante com `as Tipo`. */
type Row = Record<string, any>;

export type DirecaoMensagemDoPortal = "gestao_para_mentorado" | "mentorado_para_gestao";

/** Projeção mínima da conversa: sem autor, workspace ou metadados internos. */
export interface MensagemDoPortal {
  id: string;
  direcao: DirecaoMensagemDoPortal;
  texto: string;
  criadoEm: string;
}

/** A função SQL já omite valor_total; esta interface não tem como expô-lo. */
export interface ContratoDoPortal {
  id: string;
  assinadoEm: string | null;
  vigenciaInicio: string | null;
  vigenciaFim: string | null;
  status: "pendente" | "assinado" | "encerrado" | "cancelado";
}

// ============================================================
// Contrato
// ============================================================

export interface Portal {
  /** `false` = sem Supabase configurado, ou a leitura falhou. */
  conectado: boolean;
  /** "" quando conectado; texto curto e humano quando não. */
  motivo: string;
  /** `false` = conectou, mas quem está logado não tem ficha de mentorado (ver regra 4 acima). Diferente de `conectado: false`. */
  ehMentorado: boolean;
  mentorado: Mentorado | null;
  matriculas: Array<{ matricula: Matricula; programa: Programa | null; progresso: ProgressoMatricula }>;
  /** A sessão "agendada" mais próxima no futuro, entre TODAS as matrículas do mentorado. `null` sem nenhuma. */
  proxima: Sessao | null;
  /** De todas as matrículas do mentorado, mais recente primeiro. */
  sessoes: Sessao[];
  /** Não concluídas primeiro (por prazo crescente, nulo por último); concluídas depois. */
  tarefas: TarefaMentoria[];
  /** Mais recente primeiro. */
  marcos: Marco[];
  /** Ordem cronológica CRESCENTE — é série temporal, gráfico ao contrário mente. */
  scores: ScoreEvolucao[];
  conteudos: ConteudoLiberado[];
  mensagens: MensagemDoPortal[];
  contratos: ContratoDoPortal[];

  /**
   * A jornada do mentorado em ordem, já PASSADA PELO PORTÃO PÚBLICO.
   *
   * Montada aqui a partir do que o portal já leu (marcos, sessões, tarefas,
   * conteúdos liberados) e projetada por `projetarParaPortal` — o mesmo
   * portão que a ficha interna não usa. A projeção não é decoração: ela
   * derruba todo fato de tipo interno e higieniza o texto dos que sobram.
   *
   * Passar pelo portão mesmo montando a lista aqui dentro é redundante DE
   * PROPÓSITO. Hoje o portal só alimenta a montagem com entidades públicas;
   * no dia em que alguém acrescentar uma entrada nova sem pensar nisso, o
   * portão é o que impede a novidade de aparecer na tela de um cliente. Um
   * cinto que só serve quando você lembra dele não é cinto.
   */
  linhaTempo: FatoHistorico[];
}

// ============================================================
// Textos que vão para a tela — genéricos de propósito (regra 2: nunca
// tabela, coluna, id ou SQL). O detalhe técnico de verdade só existe no
// `console.warn` de `avisar`, nunca aqui.
// ============================================================

const MOTIVO_SEM_CONEXAO =
  "Nenhuma conexão com o banco de dados configurada. O portal não pode ser carregado agora.";

const MOTIVO_ERRO_LEITURA = "Não foi possível carregar o portal agora. Tente novamente em instantes.";

function portalDesconectado(motivo: string): Portal {
  return {
    conectado: false,
    motivo,
    ehMentorado: false,
    mentorado: null,
    matriculas: [],
    proxima: null,
    sessoes: [],
    tarefas: [],
    marcos: [],
    scores: [],
    conteudos: [],
    mensagens: [],
    contratos: [],
    linhaTempo: [],
  };
}

/**
 * Conectou, mas quem está logado não tem portal (regra 4). Distinto de
 * `portalDesconectado`: `conectado: true` aqui, sempre.
 */
function portalSemMentorado(): Portal {
  return {
    conectado: true,
    motivo: "",
    ehMentorado: false,
    mentorado: null,
    matriculas: [],
    proxima: null,
    sessoes: [],
    tarefas: [],
    marcos: [],
    scores: [],
    conteudos: [],
    mensagens: [],
    contratos: [],
    linhaTempo: [],
  };
}

/**
 * Loga o detalhe técnico de uma falha — é AQUI, e só aqui, que ele pode
 * aparecer. `motivo` (o que vai para a tela) nunca herda nada deste log.
 * Mesmo padrão de `avisar` em `dados.ts` (não reexportado de lá: seria
 * alterar `dados.ts` além de só exportar mapeadores, o que o escopo desta
 * tarefa não pede).
 */
function avisar(operacao: string, erro: unknown): void {
  if (erro && typeof erro === "object" && ("code" in erro || "message" in erro)) {
    const e = erro as { code?: string; message?: string };
    console.warn(`[mentoria/portal] ${operacao} falhou`, e.code, e.message);
  } else {
    console.warn(`[mentoria/portal] ${operacao} falhou`, erro);
  }
}

// O mapeador de `conteudo_liberado` MUDOU DE CASA na Tarefa 21: nasceu aqui
// porque só o portal lia essa tabela, e agora a ficha da gestão também lê.
// Dois mapeadores da mesma tabela em arquivos diferentes divergem no primeiro
// conserto feito só de um lado — foi assim que o `.ics` ganhou dobra de linha
// só na leitura. Ele agora mora com os outros `linhaPara*`, em `dados.ts`.

// ============================================================
// Sessões de uma matrícula / de todas as matrículas do mentorado — mesma
// lógica de `sessoesDaMatricula`/`sessoesDeTodasAsMatriculas` em `dados.ts`
// (não reexportada de lá pelo mesmo motivo de `avisar`: não é um mapeador
// `linhaPara*`, e a tarefa só autoriza exportar esses). Mesmo critério de
// vínculo: sessão pertence à matrícula direto (atendimento 1:1) OU à turma
// da matrícula (aula em grupo).
// ============================================================

function sessoesDaMatricula(matricula: Matricula, todasSessoes: readonly Sessao[]): Sessao[] {
  return todasSessoes.filter(
    (sessao) =>
      sessao.matriculaId === matricula.id ||
      (matricula.turmaId !== null && sessao.turmaId === matricula.turmaId)
  );
}

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
 * `Date.parse` defensivo — mesmo motivo de `quandoOuLimite` em `dados.ts`:
 * uma data inválida não pode quebrar a comparação nem lançar, só parar de
 * competir por uma posição "correta" na ordenação.
 */
function quandoOuLimite(iso: string, limiteQuandoInvalido: number): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : limiteQuandoInvalido;
}

function textoSeguro(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

function textoSeguroOuNulo(valor: unknown): string | null {
  const normalizado = textoSeguro(valor);
  return normalizado === "" ? null : normalizado;
}

function mensagemDoPortal(linha: Row): MensagemDoPortal | null {
  const direcao = textoSeguro(linha.direcao);
  if (direcao !== "gestao_para_mentorado" && direcao !== "mentorado_para_gestao") return null;

  const id = textoSeguro(linha.id);
  const conteudo = textoSeguro(linha.texto);
  const criadoEm = textoSeguro(linha.criado_em);
  if (id === "" || conteudo === "" || criadoEm === "") return null;
  return { id, direcao, texto: conteudo, criadoEm };
}

function contratoDoPortal(linha: Row): ContratoDoPortal | null {
  const status = textoSeguro(linha.status);
  if (status !== "pendente" && status !== "assinado" && status !== "encerrado" && status !== "cancelado") return null;

  const id = textoSeguro(linha.id);
  if (id === "") return null;
  return {
    id,
    assinadoEm: textoSeguroOuNulo(linha.assinado_em),
    vigenciaInicio: textoSeguroOuNulo(linha.vigencia_inicio),
    vigenciaFim: textoSeguroOuNulo(linha.vigencia_fim),
    status,
  };
}

/**
 * Ordem das tarefas (regra 7 do enunciado): não concluídas primeiro; dentro
 * de cada grupo (concluída/não concluída), por prazo crescente, com prazo
 * nulo (ou inválido) por último dentro do grupo — uma tarefa sem prazo não
 * é "mais urgente que todas", é o oposto: ninguém prometeu uma data para
 * ela ainda.
 */
function compararTarefas(a: TarefaMentoria, b: TarefaMentoria): number {
  if (a.concluida !== b.concluida) return a.concluida ? 1 : -1;

  const prazoA = a.prazo ? Date.parse(a.prazo) : NaN;
  const prazoB = b.prazo ? Date.parse(b.prazo) : NaN;
  const validoA = Number.isFinite(prazoA);
  const validoB = Number.isFinite(prazoB);

  if (validoA && validoB) return prazoA - prazoB;
  if (validoA) return -1; // a tem prazo, b não: a vem primeiro
  if (validoB) return 1;
  return 0;
}

// ============================================================
// lerPortal
// ============================================================

export async function lerPortal(agoraIso: string): Promise<Portal> {
  if (!supabaseConfigurado()) {
    // Regra 1: nada de Supabase configurado -> nada de dado, nem consulta
    // nenhuma é feita (nem o rpc de identidade).
    return portalDesconectado(MOTIVO_SEM_CONEXAO);
  }

  try {
    const s = criarSupabaseServer();

    // "Quem sou eu": ver o bloco grande no topo do arquivo. `meuId` é só
    // conveniência a partir daqui — quem garante que as consultas abaixo
    // não vazam dado de outro mentorado é a RLS, não este valor.
    const { data: meuId, error: erroRpc } = await s.rpc("mentorado_atual");

    if (erroRpc) {
      avisar("lerPortal/mentorado_atual", erroRpc);
      return portalDesconectado(MOTIVO_ERRO_LEITURA);
    }

    if (!meuId) {
      // Regra 4: CONECTOU, mas quem está logado não tem portal. Nenhuma
      // consulta a mais — nem `mentorado`, nem nenhuma tabela dependente.
      return portalSemMentorado();
    }

    // As nove leituras abaixo, em paralelo — escala pequena de propósito
    // (mesmo comentário de `dados.ts`: dezenas de linhas, não milhares).
    // Cada `.eq(..., meuId)` é o filtro de CONVENIÊNCIA descrito no topo do
    // arquivo: evita puxar dado de outros mentorados para jogar fora depois
    // em memória. Quem de fato impede vazamento é a política de RLS de
    // cada tabela (grupo 3 do 0007/0008), reavaliada pelo Postgres nesta
    // mesma consulta, com ou sem este `.eq`.
    const [mentoradoRes, matriculasRes, sessoesRes, tarefasRes, marcosRes, scoresRes, conteudosRes, mensagensRes, contratosRes] =
      await Promise.all([
        s.from("mentorado").select("*").eq("id", meuId).maybeSingle(),
        s.from("matricula").select("*, programa(*)").eq("mentorado_id", meuId),
        // Todas as sessões, não `eq("mentorado_id", ...)`: sessão não
        // carrega mentorado_id (só matricula_id OU turma_id, ver 0006) —
        // filtrar por matrícula em memória é o que cobre os dois vínculos
        // com uma consulta só (mesmo padrão de `lerFicha` em `dados.ts`).
        // A RLS de `sessao` (0007/0008) já restringe isto, de qualquer
        // forma, à matrícula/turma do próprio mentorado.
        //
        // BAIXO 7 da auditoria — colunas EXPLÍCITAS, sem `transcricao`: o
        // A VIEW, NUNCA A TABELA. Esta consulta lia `sessao` com uma lista
        // de colunas que deixava `transcricao` de fora de propósito, e o
        // comentário aqui dizia que dado que não vai para a tela não precisa
        // sair do banco. Os dois viraram mentira na Tarefa 19: a gravação e a
        // transcrição PASSAM a aparecer no portal quando o mentor libera.
        //
        // O que mudou não foi a régua, foi quem a segura. Antes a proteção era
        // esta linha de código não pedir a coluna — e uma linha de código só
        // protege quem passa por ela. `sessao_do_portal` (0017) devolve `''`
        // em `transcricao` e em `link_gravacao` enquanto as flags estiverem
        // falsas, para QUALQUER cliente: esta consulta, um curl com a anon
        // key, um PostgREST aberto no navegador. A tela nem sabe que existe
        // flag; ela desenha o que veio, e o que veio já está censurado.
        //
        // Colunas listadas mesmo assim (nunca `*`): a view pode ganhar coluna
        // um dia, e o portal deve continuar pedindo só o que sabe desenhar.
        s
          .from("sessao_do_portal")
          .select(
            "id, workspace_id, matricula_id, turma_id, numero, quando, duracao_min, status, link_gravacao, transcricao, resumo, criado_em"
          ),
        s.from("tarefa_mentoria").select("*").eq("mentorado_id", meuId),
        s.from("marco").select("*").eq("mentorado_id", meuId),
        s.from("score_evolucao").select("*").eq("mentorado_id", meuId),
        s.from("conteudo_liberado").select("*").eq("mentorado_id", meuId),
        // Conversa individual: o filtro só economiza leitura; a RLS 0042 é
        // a barreira que impede que uma identidade leia outra conversa.
        s
          .from("mensagem_mentoria")
          .select("id, direcao, texto, criado_em")
          .eq("mentorado_id", meuId)
          .order("criado_em", { ascending: true }),
        // Projeção security-definer: devolve somente contratos liberados e
        // nunca `valor_total`. Não consultar `contrato` diretamente evita
        // transformar um detalhe financeiro em dado do portal.
        s.rpc("contrato_do_portal"),
      ]);

    const erro =
      mentoradoRes.error ??
      matriculasRes.error ??
      sessoesRes.error ??
      tarefasRes.error ??
      marcosRes.error ??
      scoresRes.error ??
      conteudosRes.error ??
      mensagensRes.error ??
      contratosRes.error;

    if (erro) {
      avisar("lerPortal", erro);
      return portalDesconectado(MOTIVO_ERRO_LEITURA);
    }

    if (!mentoradoRes.data) {
      // Defensivo, não esperado em produção: `mentorado_atual()` achou um
      // id, mas a linha sumiu entre as duas consultas (corrida rara —
      // exclusão concorrente). Mesmo tratamento de "sem portal": nunca
      // quebrar a tela por causa disso.
      return portalSemMentorado();
    }

    const mentorado = linhaParaMentorado(mentoradoRes.data as Row);
    const todasSessoes = ((sessoesRes.data ?? []) as Row[]).map(linhaParaSessao);
    const matriculas = ((matriculasRes.data ?? []) as Row[]).map(linhaParaMatricula);

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
    // (regra 7). Data inválida vai para o fim, nunca quebra a ordenação.
    const sessoes = sessoesDeTodasAsMatriculas(matriculas, todasSessoes).sort(
      (a, b) => quandoOuLimite(b.quando, -Infinity) - quandoOuLimite(a.quando, -Infinity)
    );

    const tarefas = ((tarefasRes.data ?? []) as Row[]).map(linhaParaTarefaMentoria).sort(compararTarefas);

    // Marcos: mais recente primeiro. Data inválida vai para o fim, mesma
    // cautela de `sessoes` acima.
    const marcos = ((marcosRes.data ?? []) as Row[])
      .map(linhaParaMarco)
      .sort((a, b) => quandoOuLimite(b.conquistadoEm, -Infinity) - quandoOuLimite(a.conquistadoEm, -Infinity));

    // Scores em ordem CRESCENTE (regra 7: é série temporal, gráfico ao
    // contrário mente). Data inválida vai para o início — menos relevante
    // que qualquer semana válida.
    const scores = ((scoresRes.data ?? []) as Row[])
      .map(linhaParaScoreEvolucao)
      .sort((a, b) => quandoOuLimite(a.semana, -Infinity) - quandoOuLimite(b.semana, -Infinity));

    const conteudos = ((conteudosRes.data ?? []) as Row[]).map(linhaParaConteudoLiberado);
    const mensagens = ((mensagensRes.data ?? []) as Row[])
      .map(mensagemDoPortal)
      .filter((mensagem): mensagem is MensagemDoPortal => mensagem !== null);
    const contratos = ((contratosRes.data ?? []) as Row[])
      .map(contratoDoPortal)
      .filter((contrato): contrato is ContratoDoPortal => contrato !== null);

    // A linha do tempo. Entram só as entidades que o portal já mostra em
    // outros cards -- e ainda assim tudo passa por `projetarParaPortal`.
    //
    // `scores` entra na montagem de propósito, sabendo que vai ser DERRUBADO:
    // o fato de score carrega `motivo`, a frase que o mentor escreveu para si
    // mesmo sobre por que a nota caiu, e por isso o tipo é interno. Alimentar
    // o portão com algo que ele precisa barrar e provar em teste que barrou
    // vale mais do que nunca oferecer: é o que mantém a proteção viva em vez
    // de teórica.
    const linhaTempo = projetarParaPortal(
      historicoDe({ marcos, sessoes, tarefas, conteudos, scores }, agoraIso)
    );

    return {
      conectado: true,
      motivo: "",
      ehMentorado: true,
      mentorado,
      matriculas: matriculasComProgresso,
      proxima: proximaSessao(sessoes, agoraIso),
      sessoes,
      tarefas,
      marcos,
      scores,
      conteudos,
      mensagens,
      contratos,
      linhaTempo,
    };
  } catch (excecao) {
    avisar("lerPortal", excecao);
    return portalDesconectado(MOTIVO_ERRO_LEITURA);
  }
}
