// Tipos de domínio da mentoria — espelham, tabela por tabela, o schema de
// `supabase/migrations/0006_mentoros_mentoria.sql`. Esse arquivo .sql é a
// FONTE DA VERDADE: nomes de coluna, comentários e defaults foram lidos de
// lá, não inferidos. Se o schema mudar, este arquivo é quem está desatualizado
// — não o contrário.
//
// Datas como `string` (ISO), nunca `Date`: mesma convenção do resto do
// repositório (ver `src/lib/types.ts`). `Date` embute fuso e relógio da
// máquina onde roda; string ISO é o que o Postgres devolve e o que trafega
// em JSON sem perda.
//
// Módulo PURO: nada de Next, nada de acesso a banco, nada de `Date.now()`.
// Quem lê uma linha do Supabase e quem monta um objeto de teste usam os
// mesmos tipos e as mesmas funções de normalização daqui.
//
// AVISO DE NOME REPETIDO: `src/lib/types.ts` já exporta `Matricula` e
// `Turma` — são as entidades do domínio de infoproduto (aluno/afiliado/
// lançamento), tabelas diferentes das de mentoria. Os dois arquivos nunca
// devem ser importados sem prefixo/alias no mesmo módulo; é o preço aceito
// por manter, em cada domínio, o nome que a tabela realmente tem no banco
// (`matricula`, `turma`) em vez de inventar um prefixo artificial só para
// evitar colisão de import.

// ============================================================
// Enums — union de string com os valores EXATOS dos tipos do Postgres
// (0006_mentoros_mentoria.sql, seção "enums").
// ============================================================

export type FormatoPrograma = "individual" | "turma" | "online";

/** Ordem e valores idênticos a `create type formato_programa` no 0006. */
export const FORMATO_PROGRAMA_VALORES: readonly FormatoPrograma[] = [
  "individual",
  "turma",
  "online",
];

/**
 * "individual" — é o `default` da própria coluna `programa.formato` no
 * Postgres. Escolhido como padrão fail-closed porque, entre os três
 * formatos, é o único que NUNCA compartilha sessão com outra matrícula
 * (turma e online agrupam várias matrículas na mesma sessão via
 * `turma_id`). Se um valor corrompido/desconhecido fosse tratado como
 * "turma" por engano, o cálculo de progresso de um mentorado passaria a
 * depender de dado de outra matrícula sem ninguém ter decidido isso — o
 * padrão mais conservador é o que isola.
 */
export const FORMATO_PROGRAMA_PADRAO: FormatoPrograma = "individual";

export type StatusTurma = "planejada" | "em_andamento" | "encerrada";

/** Ordem e valores idênticos a `create type status_turma` no 0006. */
export const STATUS_TURMA_VALORES: readonly StatusTurma[] = [
  "planejada",
  "em_andamento",
  "encerrada",
];

/**
 * "planejada" — o `default` da coluna `turma.status`. É o estado "ainda não
 * aconteceu nada": uma turma tratada como planejada por engano, no pior
 * caso, é ignorada por telas que só mostram turma em andamento — não some
 * dado de ninguém. Tratá-la como "encerrada" por engano faria o oposto:
 * esconderia uma turma ativa das telas operacionais.
 */
export const STATUS_TURMA_PADRAO: StatusTurma = "planejada";

export type StatusMentorado = "lead" | "ativo" | "pausado" | "alumni";

/** Ordem e valores idênticos a `create type status_mentorado` no 0006. */
export const STATUS_MENTORADO_VALORES: readonly StatusMentorado[] = [
  "lead",
  "ativo",
  "pausado",
  "alumni",
];

/**
 * "lead" — o `default` da coluna `mentorado.status`, e também o status
 * MENOS privilegiado no portal (ver `docs/DESENHO-MENTOROS.md` §3: RLS de
 * portal é reforçado em 0007 a partir do ciclo de vida do mentorado). Um
 * status desconhecido virar "lead" nunca abre acesso a conteúdo de
 * mentorado ativo por engano; virar "ativo" por engano abriria.
 */
export const STATUS_MENTORADO_PADRAO: StatusMentorado = "lead";

export type StatusMatricula = "ativa" | "concluida" | "cancelada" | "trancada";

/** Ordem e valores idênticos a `create type status_matricula_mentoria` no 0006. */
export const STATUS_MATRICULA_VALORES: readonly StatusMatricula[] = [
  "ativa",
  "concluida",
  "cancelada",
  "trancada",
];

/**
 * "ativa" — o `default` da coluna `matricula.status`. Escolhido apesar de
 * "ativa" soar como o status mais "permissivo": é o que já está em
 * produção sempre que a matrícula acabou de ser criada (o INSERT nem
 * precisa mencionar a coluna), então tratar um valor desconhecido como
 * "ativa" é tratar a matrícula do jeito que ela nasce — nunca inventa uma
 * conclusão, cancelamento ou trancamento que não foi decidido por ninguém.
 */
export const STATUS_MATRICULA_PADRAO: StatusMatricula = "ativa";

export type StatusSessao = "agendada" | "realizada" | "faltou" | "cancelada";

/** Ordem e valores idênticos a `create type status_sessao_mentoria` no 0006. */
export const STATUS_SESSAO_VALORES: readonly StatusSessao[] = [
  "agendada",
  "realizada",
  "faltou",
  "cancelada",
];

/**
 * "agendada" — o `default` da coluna `sessao.status`. É o único dos quatro
 * valores que NÃO conta como sessão dada em `progressoDe` (ver
 * `progresso.ts`, regra 2): um status desconhecido virar "agendada" nunca
 * infla a contagem de sessões realizadas de um mentorado por acidente de
 * leitura — na dúvida, a sessão ainda não aconteceu.
 */
export const STATUS_SESSAO_PADRAO: StatusSessao = "agendada";

// ============================================================
// Normalizadores fail-closed — mesmo espírito de `papelDe` em
// `src/lib/papeis.ts`: aceitam qualquer `unknown` (linha crua do banco,
// JSON de request, cookie), toleram variação de caixa/espaço (erro
// inofensivo e comum: copiar e colar, digitação manual), e qualquer coisa
// fora da lista de valores válidos — string desconhecida, número, objeto,
// `null`, `undefined` — cai no valor padrão em vez de lançar ou propagar
// `undefined` para o resto do sistema.
// ============================================================

function normalizadorDe<T extends string>(
  valoresValidos: readonly T[],
  padrao: T,
): (valor: unknown) => T {
  return (valor: unknown): T => {
    if (typeof valor !== "string") return padrao;
    const normalizado = valor.trim().toLowerCase();
    return (valoresValidos as readonly string[]).includes(normalizado)
      ? (normalizado as T)
      : padrao;
  };
}

export const formatoProgramaDe = normalizadorDe(FORMATO_PROGRAMA_VALORES, FORMATO_PROGRAMA_PADRAO);
export const statusTurmaDe = normalizadorDe(STATUS_TURMA_VALORES, STATUS_TURMA_PADRAO);
export const statusMentoradoDe = normalizadorDe(STATUS_MENTORADO_VALORES, STATUS_MENTORADO_PADRAO);
export const statusMatriculaDe = normalizadorDe(STATUS_MATRICULA_VALORES, STATUS_MATRICULA_PADRAO);
export const statusSessaoDe = normalizadorDe(STATUS_SESSAO_VALORES, STATUS_SESSAO_PADRAO);

// ============================================================
// Entidades — uma interface por tabela do 0006, campos em camelCase (a
// convenção do resto do repositório, ver `src/lib/types.ts`) mapeando 1:1
// para as colunas snake_case do Postgres.
// ============================================================

/**
 * O "produto" da mentoria (`programa`). `totalSessoes` é nulo quando o
 * programa não é pacote fechado (turma/online contínua sem número fixo de
 * encontros). Ver `Matricula.sessoesPrevistas` para o motivo de o valor por
 * MENTORADO não vir direto daqui.
 */
export interface Programa {
  id: string;
  workspaceId: string;
  nome: string;
  formato: FormatoPrograma;
  totalSessoes: number | null;
  preco: number;
  ativo: boolean;
  criadoEm: string;
}

/** Só usada quando `Programa.formato` é "turma" ou "online": agrupa várias matrículas que compartilham sessões (aula em grupo). */
export interface Turma {
  id: string;
  workspaceId: string;
  programaId: string;
  nome: string;
  dataInicio: string | null;
  dataFim: string | null;
  status: StatusTurma;
  criadoEm: string;
}

/**
 * A ficha do mentorado (a pessoa, não a matrícula). `perfilId` é nulo até o
 * portal ser liberado para ele. `alunoId` é o vínculo opcional com o CRM de
 * vendas (`public.alunos`) — mentoria é pós-venda, alunos é funil; as duas
 * tabelas não se fundem (ver comentário completo no 0006).
 */
export interface Mentorado {
  id: string;
  workspaceId: string;
  alunoId: string | null;
  perfilId: string | null;
  nome: string;
  telefone: string;
  email: string;
  origem: string;
  status: StatusMentorado;
  criadoEm: string;
}

/**
 * Mentorado × programa. É aqui que vive o "sessão 8 de 12":
 * `sessoesPrevistas` é o pacote fechado NEGOCIADO com esse mentorado
 * especificamente, porque duas pessoas no mesmo programa individual podem
 * ter negociado pacotes de tamanhos diferentes — por isso o valor não é só
 * `programa.totalSessoes` (ver `progressoDe` em `progresso.ts`).
 * `turmaId` é nulo quando é atendimento 1:1.
 */
export interface Matricula {
  id: string;
  workspaceId: string;
  mentoradoId: string;
  programaId: string;
  turmaId: string | null;
  inicio: string;
  fimPrevisto: string | null;
  status: StatusMatricula;
  sessoesPrevistas: number | null;
  criadoEm: string;
}

/**
 * Uma sessão pertence OU a uma matrícula (atendimento 1:1) OU a uma turma
 * (aula em grupo) — nunca as duas, nunca nenhuma (`sessao_vinculo_unico` no
 * 0006). `numero` é o "8" de "sessão 8 de 12", guardado explicitamente (não
 * inferido pela ordem cronológica) porque reagendamento e cancelamento
 * bagunçam a ordem: é o número que o mentor efetivamente comunicou.
 */
export interface Sessao {
  id: string;
  workspaceId: string;
  matriculaId: string | null;
  turmaId: string | null;
  numero: number | null;
  quando: string;
  duracaoMin: number;
  status: StatusSessao;
  linkGravacao: string;
  transcricao: string;
  resumo: string;

  // ---- Colunas de 0017_sessao_agenda_gravacao.sql ----
  //
  // `eventoGoogleId` vazio significa "nunca sincronizada". Guardar o id e o
  // que permite ATUALIZAR o evento existente em vez de criar um duplicado a
  // cada clique em sincronizar.
  eventoGoogleId: string;

  /**
   * O Meet/Zoom onde a conversa VAI acontecer. Separado de `linkGravacao`,
   * que e onde ela FICOU registrada: confundir os dois publica no portal um
   * link de sala vazia.
   */
  linkReuniao: string;

  /**
   * Falso por padrao, e o default vem do proprio Postgres. E o interruptor
   * entre "o mentor colou o link" e "o mentorado ve o link". Quem respeita
   * esta flag NAO e a tela: e a view `sessao_do_portal`, porque RLS decide se
   * a LINHA aparece, e quando aparece, aparece inteira.
   */
  gravacaoLiberada: boolean;

  /**
   * Idem. Numa sessao de TURMA, ligar isto libera a fala de todos os
   * participantes para cada um deles -- por isso a tela avisa antes.
   */
  transcricaoLiberada: boolean;

  /** Quando a transcricao foi gerada. Nulo = nunca. */
  transcritaEm: string | null;

  /** Qual motor gerou o texto ('groq'). Vazio quando nao ha transcricao. */
  transcricaoOrigem: string;

  criadoEm: string;
}

/**
 * Tarefa combinada numa sessão ("até a próxima call, fazer X"). Distinta de
 * `Tarefa` (CRM interno em `src/lib/types.ts`): esta é conteúdo de portal —
 * o mentorado lê a própria tarefa e (B3.2, `acoes-portal.ts`) pode marcar
 * como feita.
 *
 * `concluidaEm` — coluna nova de `0012_portal_mentorado_conclui_tarefa.sql`,
 * não existia em `0006`: QUANDO a tarefa foi concluída (`null` enquanto
 * aberta, ou depois de reaberta — ver `reabrirTarefa`). `concluida`
 * sozinha dizia "feita ou não", nunca "desde quando".
 */
export interface TarefaMentoria {
  id: string;
  workspaceId: string;
  mentoradoId: string;
  sessaoId: string | null;
  titulo: string;
  prazo: string | null;
  concluida: boolean;
  concluidaEm: string | null;
  marcadaPor: string;
  criadoEm: string;
}

/** Conquista exibida no portal do mentorado (ex.: "primeiro cliente fechado"). */
export interface Marco {
  id: string;
  workspaceId: string;
  mentoradoId: string;
  titulo: string;
  descricao: string;
  conquistadoEm: string;
  criadoEm: string;
}

/**
 * Uma LINHA POR SEMANA, não um campo único no mentorado — é histórico, não
 * estado, de propósito: sem a série semanal não existe "caiu 18 pontos essa
 * semana", e é essa variação que alimenta o alerta de risco de churn (ver
 * comentário completo em `score_evolucao` no 0006).
 */
export interface ScoreEvolucao {
  id: string;
  workspaceId: string;
  mentoradoId: string;
  semana: string;
  score: number;
  motivo: string;
  criadoEm: string;
}

/**
 * Material (arquivo/link) liberado pelo mentor para UM mentorado específico
 * dentro do portal (`conteudo_liberado` em 0006). Existe para o portal ter
 * onde guardar "o que já pode ser visto" — sem RLS por mentorado_id (grupo 3
 * do 0007/0008), essa promessa não teria como se sustentar.
 */
export interface ConteudoLiberado {
  id: string;
  workspaceId: string;
  mentoradoId: string;
  titulo: string;
  url: string;
  liberadoEm: string;
  /**
   * Revogado (0018). A linha FICA -- conteudo liberado e uma promessa feita a
   * um cliente, e apagar a linha apagaria a prova de que a promessa existiu.
   * O mentorado deixa de enxergar a linha pela politica de select, nao por
   * filtro de tela; a gestao continua vendo.
   */
  arquivado: boolean;
  criadoEm: string;
}
