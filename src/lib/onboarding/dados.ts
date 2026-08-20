// A leitura do onboarding — a da gestão e a do mentorado.
//
// Molde de `feed/dados.ts` e `conteudo/dados-trilha.ts`: nunca lança, devolve
// `conectado`/`motivo` em vez de exceção, e o motivo é texto humano sem nome
// de tabela, coluna nem código de erro. O código vai para o log, onde serve
// para alguma coisa.
//
// ============================================================
// `lerMeuOnboarding` NÃO RECEBE PARÂMETRO NENHUM
// ============================================================
//
// O plano da Fase 2 pedia aridade 1, e o parâmetro seria `agoraIso`. São
// ZERO, e a diferença importa nas duas direções:
//
//   - o que o plano queria garantir continua garantido, e mais estritamente:
//     o id do mentorado NÃO entra por aqui. Ele sai de
//     `rpc("mentorado_atual")`, que pergunta ao banco quem é o usuário da
//     sessão. É a defesa contra o buraco clássico de trocar o número na URL,
//     a mesma de `lerPortal`, `lerMinhaTrilha` e `lerMeuFeed`;
//   - o relógio não entra porque nada aqui depende dele. `estadoDoOnboarding`
//     (onboarding/roteiro.ts) é puro e atemporal — o cabeçalho de lá explica
//     por quê. `lerMeuFeed` recebe `agoraIso` porque o feed TEM data de
//     publicação e agendamento; onboarding não tem.
//
// A aridade é travada por teste nos dois casos, e pelo mesmo motivo: para
// ninguém acrescentar um segundo parâmetro sem perceber o que está abrindo.

import { estadoDoOnboarding, type EstadoDoOnboarding, type EtapaDeOnboarding, type MarcaDeOnboarding } from "./roteiro";
import { supabaseConfigurado } from "../data";
import { criarSupabaseServer } from "../supabase/server";

/* eslint-disable @typescript-eslint/no-explicit-any -- linha crua do
   Postgres, mesmo padrão de `Row` em `mentoria/dados.ts`. */
type Row = Record<string, any>;

const MOTIVO_SEM_CONEXAO =
  "Nenhuma conexão com o banco de dados configurada. O roteiro de entrada não pode ser carregado agora.";
const MOTIVO_ERRO_LEITURA =
  "Não foi possível carregar o roteiro de entrada agora. Tente novamente em instantes.";
const MOTIVO_MENTORADO_INVALIDO = "Não reconheci o mentorado.";
const MAX_ID = 100;
const MAX_DETALHE_LOG = 40;

function avisar(operacao: string, erro: unknown): void {
  const e = (erro ?? {}) as { code?: string };
  console.warn(`[onboarding/dados] ${operacao} falhou`, String(e.code ?? "sem-codigo").slice(0, MAX_DETALHE_LOG));
}

/** A etapa com os campos que a tela também precisa, além dos que decidem o
 *  cálculo. `EtapaDeOnboarding` (roteiro.ts) é o subconjunto puro. */
export interface Etapa extends EtapaDeOnboarding {
  workspaceId: string;
  descricao: string;
  criadoEm: string;
}

export interface Marca extends MarcaDeOnboarding {
  mentoradoId: string;
  concluidaEm: string | null;
}

export interface OnboardingDoMentorado {
  conectado: boolean;
  motivo: string;
  etapas: Etapa[];
  progresso: Marca[];
  estado: EstadoDoOnboarding;
}

export interface MeuOnboarding extends OnboardingDoMentorado {
  /** `false` = conectou, mas quem está logado não tem ficha de mentorado. */
  ehMentorado: boolean;
}

function linhaParaEtapa(r: Row): Etapa {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    ordem: Number(r.ordem ?? 0),
    titulo: r.titulo ?? "",
    descricao: r.descricao ?? "",
    responsavel: r.responsavel ?? "",
    obrigatoria: Boolean(r.obrigatoria),
    ativa: Boolean(r.ativa),
    criadoEm: r.criado_em,
  };
}

function linhaParaMarca(r: Row): Marca {
  return {
    etapaId: r.etapa_id,
    mentoradoId: r.mentorado_id,
    concluida: Boolean(r.concluida),
    concluidaEm: r.concluida_em ?? null,
  };
}

const ESTADO_VAZIO: EstadoDoOnboarding = {
  pct: null,
  proximaEtapa: null,
  pendentesDoMentor: [],
  pendentesDoMentorado: [],
  concluido: false,
};

function desconectado(motivo: string): OnboardingDoMentorado {
  return { conectado: false, motivo, etapas: [], progresso: [], estado: ESTADO_VAZIO };
}

/**
 * O roteiro de UM mentorado, para a tela do time.
 *
 * Traz as etapas INATIVAS junto: quem opera precisa ver o que tirou do
 * roteiro, e o cálculo já as ignora sozinho (`estadoDoOnboarding`). Esconder
 * aqui faria a tela de gestão mentir sobre o próprio trabalho de quem a usa
 * — mesma decisão de `lerFeedDoTime` com rascunho e arquivado.
 *
 * O `mentoradoId` entra por parâmetro AQUI, e só aqui: esta é a leitura de
 * quem opera, e ela é sobre outra pessoa por definição. Quem decide se essa
 * pessoa pode ver é a RLS de 0023 — não este argumento.
 */
export async function lerOnboarding(mentoradoId: string): Promise<OnboardingDoMentorado> {
  if (typeof mentoradoId !== "string" || mentoradoId.trim() === "" || mentoradoId.length > MAX_ID) {
    return desconectado(MOTIVO_MENTORADO_INVALIDO);
  }
  if (!supabaseConfigurado()) return desconectado(MOTIVO_SEM_CONEXAO);

  try {
    const s = criarSupabaseServer();
    const [etapasRes, progressoRes] = await Promise.all([
      s.from("onboarding_etapa").select("*").order("ordem", { ascending: true }),
      s.from("onboarding_progresso").select("*").eq("mentorado_id", mentoradoId),
    ]);

    const erro = etapasRes.error ?? progressoRes.error;
    if (erro) {
      avisar("lerOnboarding", erro);
      return desconectado(MOTIVO_ERRO_LEITURA);
    }

    const etapas = ((etapasRes.data ?? []) as Row[]).map(linhaParaEtapa);
    const progresso = ((progressoRes.data ?? []) as Row[]).map(linhaParaMarca);

    return {
      conectado: true,
      motivo: "",
      etapas,
      progresso,
      estado: estadoDoOnboarding(etapas, progresso),
    };
  } catch (excecao) {
    avisar("lerOnboarding", { code: excecao instanceof Error ? excecao.name : "excecao" });
    return desconectado(MOTIVO_ERRO_LEITURA);
  }
}

/**
 * O MODELO do roteiro — as etapas do workspace, sem pessoa nenhuma.
 *
 * É o que a tela de gestão (`/onboarding`) precisa: ela configura a régua, não
 * mede ninguém. Nenhum nome de cliente e nenhum progresso atravessam daqui —
 * `estado` volta vazio porque não há de quem calcular, e isso é honesto: o
 * progresso de UMA pessoa é `lerOnboarding(id)`, e ele aparece na ficha dela.
 *
 * Traz as etapas INATIVAS junto, como `lerOnboarding`: quem opera precisa ver
 * o que tirou do roteiro.
 */
export async function lerModeloDeOnboarding(): Promise<OnboardingDoMentorado> {
  if (!supabaseConfigurado()) return desconectado(MOTIVO_SEM_CONEXAO);

  try {
    const s = criarSupabaseServer();
    const { data, error } = await s.from("onboarding_etapa").select("*").order("ordem", { ascending: true });

    if (error) {
      avisar("lerModeloDeOnboarding", error);
      return desconectado(MOTIVO_ERRO_LEITURA);
    }

    return {
      conectado: true,
      motivo: "",
      etapas: ((data ?? []) as Row[]).map(linhaParaEtapa),
      progresso: [],
      estado: ESTADO_VAZIO,
    };
  } catch (excecao) {
    avisar("lerModeloDeOnboarding", { code: excecao instanceof Error ? excecao.name : "excecao" });
    return desconectado(MOTIVO_ERRO_LEITURA);
  }
}

/**
 * O roteiro de quem está logado — ver o cabeçalho sobre a aridade zero.
 *
 * A RLS de 0023 já devolve só as etapas ATIVAS para o mentorado e só o
 * progresso dele. O filtro que a tela vê não é escrito aqui.
 */
export async function lerMeuOnboarding(): Promise<MeuOnboarding> {
  if (!supabaseConfigurado()) return { ...desconectado(MOTIVO_SEM_CONEXAO), ehMentorado: false };

  try {
    const s = criarSupabaseServer();

    const { data: meuId, error: erroRpc } = await s.rpc("mentorado_atual");
    if (erroRpc) {
      avisar("lerMeuOnboarding/rpc", erroRpc);
      return { ...desconectado(MOTIVO_ERRO_LEITURA), ehMentorado: false };
    }
    // Conectou e não é mentorado: estado diferente de "não consegui ler", e a
    // tela precisa saber a diferença. Nenhuma consulta acontece daqui em diante.
    if (!meuId) {
      return { conectado: true, motivo: "", etapas: [], progresso: [], estado: ESTADO_VAZIO, ehMentorado: false };
    }

    const [etapasRes, progressoRes] = await Promise.all([
      s.from("onboarding_etapa").select("*").order("ordem", { ascending: true }),
      s.from("onboarding_progresso").select("*").eq("mentorado_id", meuId),
    ]);

    const erro = etapasRes.error ?? progressoRes.error;
    if (erro) {
      avisar("lerMeuOnboarding", erro);
      return { ...desconectado(MOTIVO_ERRO_LEITURA), ehMentorado: false };
    }

    const etapas = ((etapasRes.data ?? []) as Row[]).map(linhaParaEtapa);
    const progresso = ((progressoRes.data ?? []) as Row[]).map(linhaParaMarca);

    return {
      conectado: true,
      motivo: "",
      ehMentorado: true,
      etapas,
      progresso,
      estado: estadoDoOnboarding(etapas, progresso),
    };
  } catch (excecao) {
    avisar("lerMeuOnboarding", { code: excecao instanceof Error ? excecao.name : "excecao" });
    return { ...desconectado(MOTIVO_ERRO_LEITURA), ehMentorado: false };
  }
}
