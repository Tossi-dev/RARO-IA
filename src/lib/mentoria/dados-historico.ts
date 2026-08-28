// Camada de LEITURA do HISTÓRICO 360° de UM mentorado — a que junta, numa
// chamada só, as duas metades que hoje vivem em telas separadas: o que o time
// anotou no CRM (`/crm/[id]`: notas, atividades, conversas de WhatsApp) e o
// que a mentoria entregou (`/mentoria/[id]`: sessões, tarefas, marcos, score,
// arquivos). Sem tela nenhuma aqui; módulo SERVER-ONLY (usa
// `criarSupabaseServer`, que usa `next/headers`).
//
// Molde de `dados.ts`, e as mesmas três regras valem palavra por palavra:
//
// 1) NUNCA INVENTAR. Sem Supabase configurado, devolve `conectado: false`,
//    `fatos: []` e uma saúde `semBase` — nunca dado de demonstração, nunca
//    zero disfarçado de dado real.
// 2) Erro de leitura não derruba a tela. `error` do supabase-js e exceção do
//    cliente viram texto curto e humano, sem nome de tabela, coluna, id ou
//    trecho de SQL. O detalhe técnico vai só para `console.warn`.
// 3) `agoraIso` é sempre parâmetro — nunca `new Date()` aqui dentro.
//
// E duas que são desta camada:
//
// ============================================================
// 4) FALHA PARCIAL É DITA, NUNCA ABSORVIDA
// ============================================================
//
// `lerFicha` (dados.ts) trata suas cinco consultas como um bloco só: uma
// falha e a ficha inteira volta desconectada. Ali isso é honesto — a ficha é
// uma coisa só. Aqui não dá: o histórico é a SOMA de nove leituras
// independentes, e uma delas falhar não torna as outras oito falsas. Se
// bastasse devolver o que sobrou, porém, a tela mostraria uma linha do tempo
// com um buraco e nenhuma marca de que ele existe — o mentor concluiria "ela
// não fez nada em maio" a partir de um `permission denied`. Por isso cada
// leitura é tolerada individualmente E o resultado carrega `parcial: true`:
// o histórico incompleto é entregue, mas nunca em silêncio.
//
// A mesma disciplina está no contrato de `EntradaHistorico` (historico.ts):
// lista AUSENTE não é lista VAZIA. Leitura que falhou é omitida, não mandada
// como `[]` — é o módulo puro deixando de poder afirmar "não houve nada".
//
// ============================================================
// 5) A SAÚDE VEM DE `saude-mentorado.ts`, E DE LUGAR NENHUM MAIS
// ============================================================
//
// Esta camada não tem — e não pode ter — nenhuma linha de aritmética de
// score. Ela lê as listas, entrega a `saudeDoMentorado` e devolve o que
// voltou. Duas contas para o mesmo número é como se inventa número sem
// ninguém notar: a ficha diria 62, o painel de risco diria 58, e as duas
// telas estariam "certas" segundo o próprio código.
//
// POR QUE O CRM VEM DE `getDB()` E A MENTORIA VEM DO CLIENTE DIRETO
// -----------------------------------------------------------------
// Notas, atividades e interações já têm leitor: o provider de `src/lib/data`,
// que `/crm/[id]` usa há tempo e que sabe mapear cada linha (inclusive as
// origens que não são Postgres). Reescrever esse mapeamento aqui criaria uma
// segunda verdade sobre os mesmos dados. As tabelas da mentoria não passam
// pelo provider — elas nasceram no 0006/0015 e o leitor delas é `dados.ts` —,
// então aqui se repete o que `portal.ts` já faz: consulta direta com o
// cliente e os mapeadores `linhaPara*` importados de `dados.ts`.
//
// O RECORTE POR MENTORADO NÃO É A GARANTIA — A RLS É
// ---------------------------------------------------
// Cada `.eq("mentorado_id", …)` abaixo é conveniência: evita puxar do banco a
// tabela inteira do workspace para descartar em memória. Quem impede que a
// ficha de outra pessoa apareça é a política de RLS (0007/0008 para a
// mentoria, 0015 para os arquivos), reavaliada pelo Postgres a cada consulta.

import { criarSupabaseServer } from "../supabase/server";
import { getDB, modoDados, modoDadosEfetivo, supabaseConfigurado } from "../data";
import { lerDocumentosDoMentorado } from "../documentos/dados";
import {
  linhaParaMarco,
  linhaParaMatricula,
  linhaParaMentorado,
  linhaParaProgramaOuNulo,
  linhaParaScoreEvolucao,
  linhaParaSessao,
  linhaParaTarefaMentoria,
} from "./dados";
import { historicoDe, revisaoEntreSessoes, type FatoHistorico, type RevisaoEntreSessoes } from "./historico";
import { saudeDoMentorado, type SaudeMentorado } from "./saude-mentorado";
import type { Matricula, Programa, Sessao } from "./tipos";
import type { Atividade, Interacao, Nota } from "../types";

/* eslint-disable @typescript-eslint/no-explicit-any -- linha crua do Postgres
   via PostgREST: mesmo padrão de `Row` em `dados.ts` e `portal.ts`. Cada campo
   é normalizado pelos mapeadores `linhaPara*`, nunca passado adiante com
   `as Tipo`. */
type Row = Record<string, any>;

// ============================================================
// Contrato
// ============================================================

export interface HistoricoDaFicha {
  /** `false` = sem Supabase configurado, ou a leitura da ficha falhou. */
  conectado: boolean;
  /** "" quando conectado; texto curto e humano quando não. */
  motivo: string;
  /**
   * `true` = CONECTOU, mas pelo menos uma das leituras não voltou. Os fatos
   * abaixo são verdadeiros e incompletos ao mesmo tempo, e a tela precisa
   * dizer isso em texto — ver regra 4 no topo do arquivo.
   *
   * Mentorado sem `aluno_id` NÃO é parcial: não ter ficha de CRM é um fato da
   * pessoa, não uma leitura que falhou. Marcar aqui gastaria o aviso no caso
   * normal e o esvaziaria no caso que importa.
   */
  parcial: boolean;
  /** Ordem decrescente por data — quem ordena é `historicoDe`, não esta camada. */
  fatos: FatoHistorico[];
  /** Revisão factual para a ficha interna; nunca é projeção do portal. */
  revisoes?: RevisaoEntreSessoes[];
  /** Sempre presente: `score: null` + `semBase: true` quando não há base. */
  saude: SaudeMentorado;
}

// ============================================================
// Textos que vão para a tela — genéricos de propósito (regra 2: nunca
// tabela, coluna, id ou SQL). O detalhe técnico só existe no `console.warn`
// de `avisar`, nunca aqui.
// ============================================================

const MOTIVO_SEM_CONEXAO =
  "Nenhuma conexão com o banco de dados configurada. O histórico não pode ser carregado agora.";

const MOTIVO_ERRO_LEITURA = "Não foi possível carregar o histórico agora. Tente novamente em instantes.";

/**
 * Loga o detalhe técnico de uma falha (código/mensagem do supabase-js, ou a
 * exceção crua) — é AQUI, e só aqui, que ele pode aparecer. `motivo` (o que
 * vai para a tela) nunca herda nada deste log. Mesmo padrão de `avisar` em
 * `dados.ts` e `portal.ts` (não reexportado de lá: é função privada de cada
 * camada, e o prefixo do log precisa dizer de qual arquivo veio).
 */
function avisar(operacao: string, erro: unknown): void {
  if (erro && typeof erro === "object" && ("code" in erro || "message" in erro)) {
    const e = erro as { code?: string; message?: string };
    console.warn(`[mentoria/dados-historico] ${operacao} falhou`, e.code, e.message);
  } else {
    console.warn(`[mentoria/dados-historico] ${operacao} falhou`, erro);
  }
}

/**
 * A saúde de quem não tem dado nenhum — e também a de quem tem dado que não
 * deu para LER (ver regra 4 aplicada à conta, em `lerHistorico`): a MESMA
 * função de sempre, chamada com listas vazias. Escrever à mão um
 * `{ score: null, semBase: true, … }` aqui seria a segunda conta entrando
 * pela porta dos fundos — bastaria `saude-mentorado.ts` ganhar um campo para
 * os dois objetos divergirem.
 */
function saudeSemDado(agoraIso: string): SaudeMentorado {
  return saudeDoMentorado({ matriculas: [], sessoes: [], tarefas: [], scores: [] }, agoraIso);
}

function historicoDesconectado(motivo: string, agoraIso: string): HistoricoDaFicha {
  return { conectado: false, motivo, parcial: false, fatos: [], revisoes: [], saude: saudeSemDado(agoraIso) };
}

/** Conectou e não achou a ficha. `conectado: true` de propósito: "não existe" é uma resposta. */
function historicoSemFicha(agoraIso: string): HistoricoDaFicha {
  return { conectado: true, motivo: "", parcial: false, fatos: [], revisoes: [], saude: saudeSemDado(agoraIso) };
}

// ============================================================
// Leitura tolerante — uma fonte de cada vez
// ============================================================

/**
 * O resultado de UMA leitura: o que voltou, e se dá para confiar que aquilo é
 * tudo. `ok: false` com `valor: []` não quer dizer "não havia nada" — quer
 * dizer "não deu para saber", e é por isso que os dois campos andam juntos em
 * vez de a lista vazia falar sozinha.
 */
interface Fonte<T> {
  ok: boolean;
  valor: T;
}

type RespostaDoBanco = { data: unknown; error: { code?: string; message?: string } | null };

/**
 * Uma consulta ao Postgres que nunca rejeita. `consulta` é uma função, e não
 * uma Promise já criada, porque `s.from(...)` pode lançar SÍNCRONO quando o
 * cliente está quebrado — passar a Promise pronta deixaria essa exceção
 * escapar antes de qualquer `try` desta camada.
 */
async function daTabela(operacao: string, consulta: () => PromiseLike<RespostaDoBanco>): Promise<Fonte<Row[]>> {
  try {
    const { data, error } = await consulta();
    if (error) {
      avisar(operacao, error);
      return { ok: false, valor: [] };
    }
    return { ok: true, valor: (data ?? []) as Row[] };
  } catch (excecao) {
    avisar(operacao, excecao);
    return { ok: false, valor: [] };
  }
}

/** O mesmo para as leituras que passam pelo provider de dados do CRM. */
async function doProvider<T>(operacao: string, chamada: () => Promise<T[]>): Promise<Fonte<T[]>> {
  try {
    return { ok: true, valor: await chamada() };
  } catch (excecao) {
    avisar(operacao, excecao);
    return { ok: false, valor: [] };
  }
}

/** Lista quando a leitura deu certo; `undefined` quando não (ver regra 4). */
function ouAusente<T>(ok: boolean, valor: T[]): T[] | undefined {
  return ok ? valor : undefined;
}

// ============================================================
// Vínculo sessão ↔ matrícula — cópia local, de propósito
// ============================================================
//
// Idêntico ao de `dados.ts` e `portal.ts`, que também mantêm a sua: sessão OU
// é da matrícula (`matricula_id`) OU é da turma da matrícula (`turma_id`,
// aula em grupo). As três cópias existem porque exportar o helper obrigaria a
// mexer em `dados.ts` só para isso; se um dia o critério mudar, ele muda nos
// três lugares — e é o mesmo critério da view `matricula_progresso` desde o
// 0008.

function sessoesDaMatricula(matricula: Matricula, todasSessoes: readonly Sessao[]): Sessao[] {
  return todasSessoes.filter(
    (sessao) =>
      sessao.matriculaId === matricula.id || (matricula.turmaId !== null && sessao.turmaId === matricula.turmaId)
  );
}

/** União das sessões de todas as matrículas do mentorado, sem repetir. */
function sessoesDeTodasAsMatriculas(matriculas: readonly Matricula[], todasSessoes: readonly Sessao[]): Sessao[] {
  const vistas = new Map<string, Sessao>();
  for (const matricula of matriculas) {
    for (const sessao of sessoesDaMatricula(matricula, todasSessoes)) {
      vistas.set(sessao.id, sessao);
    }
  }
  return [...vistas.values()];
}

// ============================================================
// lerHistorico
// ============================================================

/**
 * O histórico 360° de um mentorado, mais o score de saúde dele.
 *
 * `mentoradoId` vem de quem chama (é a ficha aberta pelo TIME — a rota
 * `/mentoria/[id]`, protegida por `papeis.ts` e pela RLS de gestão). Isto é
 * o oposto de `lerPortal`, que se recusa a receber um id justamente porque
 * lá quem abre a tela é o próprio cliente; a diferença está explicada no
 * topo de `portal.ts` e não é descuido aqui.
 */
export async function lerHistorico(mentoradoId: string, agoraIso: string): Promise<HistoricoDaFicha> {
  if (!supabaseConfigurado()) {
    // Regra 1: sem Supabase configurado, nenhuma consulta é sequer tentada —
    // nem ao banco, nem ao provider do CRM.
    return historicoDesconectado(MOTIVO_SEM_CONEXAO, agoraIso);
  }

  let alunoId: string | null;
  let s: ReturnType<typeof criarSupabaseServer>;

  // A ficha vem PRIMEIRO e sozinha, e não junto do resto: é ela que diz se
  // existe aluno de CRM vinculado, e sem essa resposta não dá para saber se
  // as três leituras de CRM devem acontecer. Falha aqui é o único caso que
  // derruba tudo — sem a ficha não há histórico de ninguém.
  try {
    s = criarSupabaseServer();
    const { data, error } = await s.from("mentorado").select("*").eq("id", mentoradoId).maybeSingle();

    if (error) {
      avisar("lerHistorico/ficha", error);
      return historicoDesconectado(MOTIVO_ERRO_LEITURA, agoraIso);
    }
    if (!data) {
      // Conectou e não achou — nenhuma consulta dependente é feita. Pedir
      // sessão, tarefa e arquivo de uma ficha que não existe seria trabalho
      // à toa e ruído de log (mesma escolha de `lerPortal`).
      return historicoSemFicha(agoraIso);
    }

    alunoId = linhaParaMentorado(data as Row).alunoId;
  } catch (excecao) {
    avisar("lerHistorico/ficha", excecao);
    return historicoDesconectado(MOTIVO_ERRO_LEITURA, agoraIso);
  }

  // As leituras seguintes vão TODAS juntas — as da mentoria, a dos arquivos e
  // (só quando há aluno vinculado) as três do CRM. Escala pequena de propósito
  // (docs/DESENHO-MENTOROS.md, decisão 2): dezenas de linhas, sem paginação.
  const [matriculasRes, sessoesRes, tarefasRes, marcosRes, scoresRes, documentosRes, crmRes] = await Promise.all([
    daTabela("lerHistorico/matriculas", () => s.from("matricula").select("*, programa(*)").eq("mentorado_id", mentoradoId)),
    // Todas as sessões, e não `eq("mentorado_id", …)`: sessão não carrega
    // mentorado_id (só `matricula_id` OU `turma_id`, ver 0006) — o vínculo é
    // resolvido em memória logo abaixo, com o mesmo critério de `dados.ts`.
    daTabela("lerHistorico/sessoes", () => s.from("sessao").select("*")),
    daTabela("lerHistorico/tarefas", () => s.from("tarefa_mentoria").select("*").eq("mentorado_id", mentoradoId)),
    daTabela("lerHistorico/marcos", () => s.from("marco").select("*").eq("mentorado_id", mentoradoId)),
    daTabela("lerHistorico/scores", () => s.from("score_evolucao").select("*").eq("mentorado_id", mentoradoId)),
    lerDocumentosDoMentorado(mentoradoId, { incluirArquivados: true }),
    lerDoCrm(alunoId),
  ]);

  // Um mapeamento só para os dois usos (o vínculo das sessões e a conta da
  // saúde): converter a mesma linha duas vezes abriria a porta para as duas
  // cópias divergirem no dia em que uma delas ganhasse um ajuste.
  const matriculasComPrograma: Array<{ matricula: Matricula; programa: Programa | null }> = matriculasRes.valor.map(
    (r) => ({ matricula: linhaParaMatricula(r), programa: linhaParaProgramaOuNulo(r) })
  );
  const matriculas = matriculasComPrograma.map((m) => m.matricula);

  const todasSessoes = sessoesRes.valor.map(linhaParaSessao);
  const sessoes = sessoesDeTodasAsMatriculas(matriculas, todasSessoes);
  const tarefas = tarefasRes.valor.map(linhaParaTarefaMentoria);
  const marcos = marcosRes.valor.map(linhaParaMarco);
  const scores = scoresRes.valor.map(linhaParaScoreEvolucao);

  const fatos = historicoDe(
    {
      interacoes: ouAusente(crmRes.interacoes.ok, crmRes.interacoes.valor),
      notas: ouAusente(crmRes.notas.ok, crmRes.notas.valor),
      atividades: ouAusente(crmRes.atividades.ok, crmRes.atividades.valor),
      // A lista de sessões depende das DUAS leituras: sem as matrículas não
      // dá para dizer quais sessões são desta pessoa (o vínculo mora nelas),
      // e uma lista filtrada por uma lista vazia afirmaria "nenhuma sessão".
      sessoes: ouAusente(sessoesRes.ok && matriculasRes.ok, sessoes),
      tarefas: ouAusente(tarefasRes.ok, tarefas),
      marcos: ouAusente(marcosRes.ok, marcos),
      scores: ouAusente(scoresRes.ok, scores),
      documentos: ouAusente(documentosRes.conectado, documentosRes.documentos),
    },
    agoraIso
  );
  const revisoes = revisaoEntreSessoes({ sessoes, tarefas, scores }, agoraIso);

  // ============================================================
  // A CONTA DA SAÚDE SÓ RODA SOBRE LEITURA COMPLETA
  // ============================================================
  //
  // `saudeDoMentorado` recebe LISTAS, e lista vazia lá dentro quer dizer "não
  // houve" — é o único significado que ela tem. Entregar a lista vazia de uma
  // leitura que FALHOU seria mentir para a conta, e a mentira volta como
  // número: com a leitura de `sessao` negada pela RLS, o fator ritmo continua
  // tendo base (o denominador vem da matrícula, não das sessões) e pontua
  // "0 de 4,2 sessões esperadas" — um `permission denied` virando nota baixa,
  // com frase explicativa e tudo, na ficha de quem talvez esteja em dia.
  //
  // Por isso, faltando QUALQUER uma das quatro leituras que alimentam a conta,
  // esta camada não entrega score: devolve a mesma saúde sem base de quem não
  // tem dado. É o lado seguro da regra da casa — sem dado, a tela DIZ que não
  // tem — e vale para as quatro juntas, e não só para `sessao`, porque quais
  // fatores sobrevivem a uma lista vazia é decisão de `saude-mentorado.ts`:
  // depender disso aqui seria acertar hoje e errar no dia em que um fator novo
  // entrasse lá. `parcial: true` continua dizendo à tela que faltou leitura.
  //
  // O que fica de fora desta guarda é de propósito: arquivos e CRM não entram
  // na conta, então falha neles não pode apagar um score que existe.
  const leituraDaContaCompleta = matriculasRes.ok && sessoesRes.ok && tarefasRes.ok && scoresRes.ok;
  const saude = leituraDaContaCompleta
    ? saudeDoMentorado({ matriculas: matriculasComPrograma, sessoes, tarefas, scores }, agoraIso)
    : saudeSemDado(agoraIso);

  const parcial =
    !matriculasRes.ok ||
    !sessoesRes.ok ||
    !tarefasRes.ok ||
    !marcosRes.ok ||
    !scoresRes.ok ||
    !documentosRes.conectado ||
    !crmRes.notas.ok ||
    !crmRes.atividades.ok ||
    !crmRes.interacoes.ok;

  return { conectado: true, motivo: "", parcial, fatos, revisoes, saude };
}

/**
 * As três leituras do CRM — ou nenhuma delas.
 *
 * Sem `aluno_id` na ficha, `getDB()` nem é chamado: mentorado que nunca
 * passou pelo CRM (cadastrado direto na mentoria) não tem ficha de aluno, e
 * perguntar por notas de um id inexistente devolveria lista vazia com cara de
 * "não há nada anotado" — uma afirmação que ninguém verificou. As três fontes
 * saem `ok: true` com lista vazia porque aqui não houve falha nenhuma: não há
 * o que ler, e isso é sabido, não suposto.
 *
 * `!alunoId`, e não `alunoId === null`: `linhaParaMentorado` preserva string
 * vazia (`r.aluno_id ?? null`), e do outro lado id falsy não é "nenhum
 * resultado" — é AUSÊNCIA DE FILTRO. `listInteracoes("")` devolve as conversas
 * de todos os leads do workspace, `listAtividades("")` devolve até 500
 * atividades de qualquer um, e tudo isso cairia na linha do tempo de uma
 * pessoa só. Hoje a coluna é `uuid` e não aceita `''`, mas a distância entre
 * a versão segura e a insegura desta linha é um caractere.
 */
async function lerDoCrm(alunoId: string | null): Promise<{
  notas: Fonte<Nota[]>;
  atividades: Fonte<Atividade[]>;
  interacoes: Fonte<Interacao[]>;
}> {
  if (!alunoId) {
    return {
      notas: { ok: true, valor: [] },
      atividades: { ok: true, valor: [] },
      interacoes: { ok: true, valor: [] },
    };
  }

  // ============================================================
  // AS DUAS METADES PRECISAM SER DA MESMA PESSOA
  // ============================================================
  //
  // A metade da mentoria vem de `criarSupabaseServer`, que não conhece o modo
  // simulação (é sempre o Postgres real). `getDB()` conhece: com o cookie
  // ligado, ele devolve o provider de demonstração. Nesse estado, as três
  // leituras do CRM seriam feitas num universo fictício, com um `aluno_id`
  // real que lá não existe — três listas vazias, `ok: true`, e a tela
  // afirmando "nada anotado no CRM" sobre uma pessoa de verdade. Exatamente a
  // afirmação que ninguém verificou, e que esta camada existe para recusar.
  //
  // Então não se lê: `ok: false` marca o histórico como parcial, e a tela
  // diz que essa metade não pôde ser lida — que é a verdade.
  if (modoDadosEfetivo() !== modoDados()) {
    avisar("lerHistorico/crm", {
      message: "origem efetiva do provider diferente da metade da mentoria (simulação ligada) — CRM não lido",
    });
    return {
      notas: { ok: false, valor: [] },
      atividades: { ok: false, valor: [] },
      interacoes: { ok: false, valor: [] },
    };
  }

  const db = getDB();
  const [notas, atividades, interacoes] = await Promise.all([
    doProvider("lerHistorico/notas", () => db.listNotas(alunoId)),
    doProvider("lerHistorico/atividades", () => db.listAtividades(alunoId)),
    doProvider("lerHistorico/interacoes", () => db.listInteracoes(alunoId)),
  ]);

  return { notas, atividades, interacoes };
}
