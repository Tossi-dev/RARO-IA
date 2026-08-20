// O roteiro de onboarding de um mentorado — módulo PURO. Sem banco, sem Next,
// sem relógio.
//
// ============================================================
// SOBRE O PARÂMETRO QUE NÃO EXISTE AQUI
// ============================================================
//
// O plano da Fase 2 pedia `estadoDoOnboarding(etapas, progresso, agoraIso)`.
// São dois parâmetros, não três: NADA neste cálculo depende de que horas são.
// Percentual, próxima etapa, pendências e "concluído" saem todos da lista de
// etapas e das marcas — o mesmo resultado hoje, amanhã e daqui a um ano.
//
// Aceitar um `agoraIso` que ninguém lê teria dois preços: sugere a quem chama
// que a resposta muda com o tempo (e ela não muda), e cria uma linha que
// nenhum teste consegue derrubar. Esta fase já aprendeu isso de um jeito
// concreto — em `feed/visibilidade.ts` um mutante sobreviveu justamente
// apontando para código defensivo que não defendia de nada. O dia em que
// existir "etapa atrasada desde tal data", o relógio volta, e volta sendo
// usado.
//
// ============================================================
// AS TRÊS DECISÕES DE NÚMERO
// ============================================================
//
// 1. `pct` é `null`, e não 0, quando não há etapa obrigatória ativa. "Não há
//    o que cumprir" e "não cumpriu nada" são coisas diferentes, e um 0% na
//    tela de quem acabou de entrar num roteiro vazio lê como acusação.
//
// 2. `concluido` olha só as OBRIGATÓRIAS. Etapa opcional pendente não segura
//    o onboarding de ninguém — se segurasse, "opcional" não queria dizer
//    nada. Mas ela continua aparecendo na lista de pendências: concluído não
//    é o mesmo que "não há mais nada a fazer".
//
// 3. Roteiro SEM obrigatória nenhuma não é "concluído". Dizer que alguém
//    concluiu uma lista vazia é afirmar algo que ninguém verificou — mesma
//    escolha de `temDireitoAoCertificado` (conteudo/progresso-trilha.ts) para
//    a trilha sem aula.
//
// ============================================================
// ⚠ CONVENIÊNCIA DE TELA, NÃO SEGURANÇA
// ============================================================
//
// Este módulo diz quais etapas são do mentorado. Ele NÃO é o que impede o
// mentorado de marcar a etapa do mentor — quem impede é
// `public.onboarding_marcar` (migração 0023), que confere
// `responsavel = 'mentorado'` dentro do próprio `where`, no banco, a cada
// chamada. Se este arquivo inteiro sumisse, nada mudaria para quem tentasse
// marcar o que não é dele.

/** Os dois valores do enum `responsavel_etapa` (migração 0023). */
export type Responsavel = "mentor" | "mentorado";

export interface EtapaDeOnboarding {
  id: string;
  ordem: number;
  titulo: string;
  /** Vem do banco como texto; pode ser qualquer coisa em runtime. */
  responsavel: string;
  obrigatoria: boolean;
  ativa: boolean;
}

export interface MarcaDeOnboarding {
  etapaId: string;
  concluida: boolean;
}

export interface EstadoDoOnboarding {
  /** 0 a 100, inteiro. `null` quando não há etapa obrigatória ativa. */
  pct: number | null;
  /** A de menor `ordem` ainda pendente, ou `null` quando não há pendência. */
  proximaEtapa: EtapaDeOnboarding | null;
  pendentesDoMentor: EtapaDeOnboarding[];
  pendentesDoMentorado: EtapaDeOnboarding[];
  concluido: boolean;
}

/**
 * O responsável de uma etapa. Qualquer coisa fora do enum vira `"mentor"`.
 *
 * O lado seguro aqui não é "esconder", é "não delegar": uma etapa com
 * responsável ilegível aparece para o TIME, que pode consertar, e não para o
 * cliente, que receberia uma tarefa que talvez não seja dele. O pior caso é
 * o mentor ver uma linha a mais.
 */
export function responsavelDaEtapa(valor: unknown): Responsavel {
  return valor === "mentorado" ? "mentorado" : "mentor";
}

/** A ordem em que o roteiro é lido: por `ordem`, e o empate pelo título.
 *  Sem o desempate, duas etapas com a mesma ordem trocariam de lugar entre
 *  dois carregamentos e a "próxima etapa" mudaria sem nada ter mudado. */
function porOrdem(a: EtapaDeOnboarding, b: EtapaDeOnboarding): number {
  if (a.ordem !== b.ordem) return a.ordem - b.ordem;
  return a.titulo.localeCompare(b.titulo, "pt-BR");
}

const VAZIO: EstadoDoOnboarding = {
  pct: null,
  proximaEtapa: null,
  pendentesDoMentor: [],
  pendentesDoMentorado: [],
  concluido: false,
};

/**
 * Onde esta pessoa está no roteiro.
 *
 * Etapa INATIVA não entra em número nenhum — nem no denominador do
 * percentual, nem nas pendências, nem como próxima. `ativa = false` é o
 * "arquivado" desta tabela (0023): a etapa saiu do roteiro de quem entra
 * amanhã, e contá-la aqui faria o progresso de quem já a cumpriu andar para
 * trás no dia em que o time desativasse uma linha.
 *
 * Marca apontando para etapa que não está na lista não afeta nada — não por
 * um filtro, mas pelo sentido da pergunta: o cálculo percorre as ETAPAS e
 * pergunta "esta foi concluída?", nunca o contrário. O denominador é a lista,
 * não o histórico.
 */
export function estadoDoOnboarding(
  etapas: readonly EtapaDeOnboarding[],
  progresso: readonly MarcaDeOnboarding[],
): EstadoDoOnboarding {
  if (!Array.isArray(etapas)) return VAZIO;

  const ativas = [...etapas].filter((e) => e && e.ativa).sort(porOrdem);
  if (ativas.length === 0) return VAZIO;

  // Sem filtrar por "a etapa está na lista", de propósito. A primeira versão
  // disto montava um `Set` de ids ativos e cruzava com ele — e um mutante que
  // removia esse cruzamento sobreviveu à suíte inteira. Não era teste fraco:
  // a consulta é sempre no sentido contrário (`concluidas.has(etapa.id)`,
  // sobre etapas que já vieram da lista de ativas), então uma marca órfã ou
  // de etapa desativada nunca chega a ser perguntada. O filtro parecia
  // proteger e não protegia de nada — mesma lição de `feed/visibilidade.ts`.
  const concluidas = new Set(
    (Array.isArray(progresso) ? progresso : [])
      .filter((m) => m && m.concluida)
      .map((m) => m.etapaId),
  );

  const obrigatorias = ativas.filter((e) => e.obrigatoria);
  const obrigatoriasFeitas = obrigatorias.filter((e) => concluidas.has(e.id));

  const pendentes = ativas.filter((e) => !concluidas.has(e.id));

  return {
    // Denominador zero não vira 0% — vira "não há o que cumprir".
    pct: obrigatorias.length === 0 ? null : Math.round((obrigatoriasFeitas.length / obrigatorias.length) * 100),
    proximaEtapa: pendentes[0] ?? null,
    pendentesDoMentor: pendentes.filter((e) => responsavelDaEtapa(e.responsavel) === "mentor"),
    pendentesDoMentorado: pendentes.filter((e) => responsavelDaEtapa(e.responsavel) === "mentorado"),
    // Nunca `true` para um roteiro sem obrigatória — ver o cabeçalho.
    concluido: obrigatorias.length > 0 && obrigatoriasFeitas.length === obrigatorias.length,
  };
}
