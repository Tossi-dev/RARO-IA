// A leitura do funil comercial: pipeline, uma oportunidade e as propostas
// dela.
//
// Molde de `feed/dados.ts` e `onboarding/dados.ts`: nunca lança, devolve
// `conectado`/`motivo` em vez de exceção, e o motivo é frase humana sem nome
// de tabela, sem nome de coluna e sem código de erro. O código vai para o
// log, onde serve para alguma coisa.
//
// ============================================================
// LEITURA PELA METADE NÃO VIRA CONTA
// ============================================================
//
// Esta é a decisão que dá forma ao arquivo. Quando uma das leituras do
// pipeline falha, o que já veio continua vindo — a tela mostra os cartões e
// avisa que a foto está incompleta —, mas `conversao` e `cicloMedioDias`
// voltam `null`.
//
// O motivo não é purismo. A conversão é o número que faz o dono mudar o
// discurso da equipe ("a gente perde na reunião"), e uma conta feita em cima
// de metade dos dados não parece incompleta: parece uma conta. Um número a
// menos é um problema visível; um número errado é um problema que ninguém vê.
// É a mesma disciplina de `funil.ts` (taxa `null` em vez de 0), aplicada um
// andar acima.
//
// A espinha é outra história: sem etapas ou sem oportunidades não há tela
// nenhuma para desenhar, e aí a resposta é `conectado: false`.
//
// ============================================================
// O TOKEN NÃO SAI NA LISTAGEM
// ============================================================
//
// `lerPipeline` traz um RESUMO das propostas — para a tela poder dizer "essa
// negociação já tem proposta enviada" — e esse resumo NÃO tem o token. Nem no
// objeto devolvido, nem na consulta: a lista de colunas é escrita à mão, e o
// teste falha se `token` (ou `corpo`) entrar nela.
//
// O token é a fechadura do link público (0025 + proposta-token.ts). Uma tela
// de listagem carrega dezenas deles de uma vez, para dentro do HTML, sem
// ninguém ter pedido nenhum link. Quem monta link é `lerPropostas`, que é a
// leitura de UMA negociação — e aí, sim, o token vem.
//
// ============================================================
// VISITA SE CONTA, PESSOA NÃO SE IDENTIFICA
// ============================================================
//
// `proposta_visita` guarda `ip_hash` e `agente_hash` (0025). Este módulo lê a
// tabela para responder "quantas vezes abriram, e quando foi a última" — e
// nenhum dos dois hashes atravessa para a tela. Levar o valor adiante
// transformaria um contador em rastreamento de pessoa, que é exatamente o que
// a migração evitou ao guardar hash em vez do endereço.
//
// E quando a contagem falha, `visitas` é `null`, não 0: "não sei quantas" e
// "ninguém abriu" são notícias opostas para quem está esperando resposta de
// uma proposta.

import { cicloMedio, conversaoPorEtapa, type ConversaoDoFunil } from "./funil";
import { supabaseConfigurado } from "../data";
import { criarSupabaseServer } from "../supabase/server";

/* eslint-disable @typescript-eslint/no-explicit-any -- linha crua do
   Postgres, mesmo padrão de `Row` em `mentoria/dados.ts`. Cada campo passa
   por um mapeador, nunca por `as Tipo`. */
type Row = Record<string, any>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MOTIVO_SEM_CONEXAO =
  "Nenhuma conexão com o banco de dados configurada. O funil não pode ser carregado agora.";
const MOTIVO_ERRO_LEITURA = "Não foi possível carregar o funil agora. Tente novamente em instantes.";
const MOTIVO_ID_INVALIDO = "Não reconheci esse negócio.";
const MAX_DETALHE_LOG = 40;

/**
 * As colunas do resumo de proposta, escritas à mão. Ver o cabeçalho: `token`
 * e `corpo` ficam de fora de propósito, e há teste que confere esta string.
 */
const COLUNAS_RESUMO_PROPOSTA = "id, oportunidade_id, titulo, valor, validade, status, criado_em";

function avisar(operacao: string, erro: unknown): void {
  const e = (erro ?? {}) as { code?: string };
  // Só o código. A mensagem de um erro de PostgREST ecoa o corpo da
  // requisição — aqui isso significaria valor negociado e nome de cliente.
  console.warn(`[comercial/dados] ${operacao} falhou`, String(e.code ?? "sem-codigo").slice(0, MAX_DETALHE_LOG));
}

export interface EtapaLida {
  id: string;
  workspaceId: string;
  chave: string;
  nome: string;
  ordem: number;
  tipo: string;
  ativa: boolean;
  criadoEm: string;
}

export interface OportunidadeLida {
  id: string;
  workspaceId: string;
  alunoId: string;
  mentoradoId: string | null;
  etapaId: string;
  responsavelPerfilId: string | null;
  valor: number;
  probabilidade: number;
  origem: string;
  status: string;
  motivoPerda: string;
  criadoEm: string;
  fechadoEm: string | null;
}

/** O resumo que a listagem mostra. SEM token e SEM corpo — ver o cabeçalho. */
export interface PropostaResumo {
  id: string;
  oportunidadeId: string;
  titulo: string;
  valor: number;
  validade: string | null;
  status: string;
  criadoEm: string;
  /** Calculada contra o `agoraIso` recebido, e só para a tela avisar. */
  vencida: boolean;
}

export interface PropostaComLink {
  id: string;
  oportunidadeId: string;
  token: string;
  titulo: string;
  corpo: string;
  valor: number;
  validade: string | null;
  status: string;
  criadoEm: string;
  /** `null` = não deu para contar. Diferente de 0, que é "ninguém abriu". */
  visitas: number | null;
  ultimaVisita: string | null;
}

/** O mínimo para o cartão do kanban dizer de QUEM é a negociação. */
export interface AlunoDoFunil {
  id: string;
  nome: string;
}

export interface PipelineDoTime {
  conectado: boolean;
  motivo: string;
  /** Alguma leitura falhou: o que veio é verdade, mas não é tudo. */
  parcial: boolean;
  etapas: EtapaLida[];
  oportunidades: OportunidadeLida[];
  alunos: AlunoDoFunil[];
  propostas: PropostaResumo[];
  /** `null` quando `parcial` — ver o cabeçalho. */
  conversao: ConversaoDoFunil | null;
  cicloMedioDias: number | null;
}

export interface OportunidadeDetalhada {
  conectado: boolean;
  motivo: string;
  oportunidade: OportunidadeLida | null;
  etapa: EtapaLida | null;
}

export interface PropostasDaOportunidade {
  conectado: boolean;
  motivo: string;
  parcial: boolean;
  propostas: PropostaComLink[];
}

function linhaParaEtapa(r: Row): EtapaLida {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    chave: r.chave ?? "",
    nome: r.nome ?? "",
    ordem: Number(r.ordem ?? 0),
    tipo: r.tipo ?? "",
    ativa: Boolean(r.ativa),
    criadoEm: r.criado_em,
  };
}

function linhaParaOportunidade(r: Row): OportunidadeLida {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    alunoId: r.aluno_id,
    mentoradoId: r.mentorado_id ?? null,
    etapaId: r.etapa_id,
    responsavelPerfilId: r.responsavel_perfil_id ?? null,
    valor: Number(r.valor ?? 0),
    probabilidade: Number(r.probabilidade ?? 0),
    origem: r.origem ?? "",
    status: r.status ?? "",
    motivoPerda: r.motivo_perda ?? "",
    criadoEm: r.criado_em,
    fechadoEm: r.fechado_em ?? null,
  };
}

/**
 * Vencida = tem prazo e o prazo já passou.
 *
 * A comparação é por DIA, e o último dia ainda vale — é o mesmo
 * `validade >= current_date` de `proposta_publica` (0025). Duas réguas
 * diferentes aqui produziriam uma tela dizendo "vencida" sobre uma proposta
 * que o link ainda abre.
 */
function estaVencida(validade: unknown, agoraIso: string): boolean {
  if (typeof validade !== "string" || validade === "") return false;
  const hoje = agoraIso.slice(0, 10);
  return validade < hoje;
}

function linhaParaResumoDeProposta(r: Row, agoraIso: string): PropostaResumo {
  return {
    id: r.id,
    oportunidadeId: r.oportunidade_id,
    titulo: r.titulo ?? "",
    valor: Number(r.valor ?? 0),
    validade: r.validade ?? null,
    status: r.status ?? "",
    criadoEm: r.criado_em,
    vencida: estaVencida(r.validade, agoraIso),
  };
}

function pipelineDesconectado(motivo: string): PipelineDoTime {
  return {
    conectado: false,
    motivo,
    parcial: false,
    etapas: [],
    oportunidades: [],
    alunos: [],
    propostas: [],
    conversao: null,
    cicloMedioDias: null,
  };
}

/**
 * O pipeline inteiro do time.
 *
 * UM parâmetro, e é o relógio — usado só para dizer quais propostas
 * venceram. Nenhum filtro entra por aqui: nem workspace, nem responsável,
 * nem etapa. Quem recorta é a RLS de 0024 e 0025, que já sabe quem está
 * perguntando; um filtro de parâmetro seria um filtro que alguém pode mudar.
 */
export async function lerPipeline(agoraIso: string): Promise<PipelineDoTime> {
  if (!supabaseConfigurado()) return pipelineDesconectado(MOTIVO_SEM_CONEXAO);

  try {
    const s = criarSupabaseServer();

    const [etapasRes, oportunidadesRes, propostasRes, alunosRes] = await Promise.all([
      s.from("funil_etapa").select("*").order("ordem", { ascending: true }),
      s.from("oportunidade").select("*").order("criado_em", { ascending: false }),
      s.from("proposta").select(COLUNAS_RESUMO_PROPOSTA).order("criado_em", { ascending: false }),
      // Só id e nome. O cartão precisa dizer de quem é a negociação, e mais
      // nada daqui: telefone, e-mail e histórico são da ficha, não do funil.
      s.from("alunos").select("id, nome"),
    ]);

    // A espinha: sem etapa ou sem oportunidade não há funil para desenhar.
    const erroDaEspinha = etapasRes.error ?? oportunidadesRes.error;
    if (erroDaEspinha) {
      avisar("lerPipeline/espinha", erroDaEspinha);
      return pipelineDesconectado(MOTIVO_ERRO_LEITURA);
    }

    const etapas = ((etapasRes.data ?? []) as Row[]).map(linhaParaEtapa);
    const oportunidades = ((oportunidadesRes.data ?? []) as Row[]).map(linhaParaOportunidade);

    const parcial = Boolean(propostasRes.error) || Boolean(alunosRes.error);
    if (propostasRes.error) avisar("lerPipeline/proposta", propostasRes.error);
    if (alunosRes.error) avisar("lerPipeline/aluno", alunosRes.error);

    const propostas = parcial
      ? []
      : ((propostasRes.data ?? []) as Row[]).map((r) => linhaParaResumoDeProposta(r, agoraIso));

    return {
      conectado: true,
      motivo: "",
      parcial,
      etapas,
      oportunidades,
      alunos: alunosRes.error
        ? []
        : ((alunosRes.data ?? []) as Row[]).map((r) => ({ id: r.id, nome: r.nome ?? "" })),
      propostas,
      // Ver o cabeçalho: conta pela metade não é conta.
      conversao: parcial ? null : conversaoPorEtapa(oportunidades, etapas),
      cicloMedioDias: parcial ? null : cicloMedio(oportunidades),
    };
  } catch (excecao) {
    avisar("lerPipeline", { code: excecao instanceof Error ? excecao.name : "excecao" });
    return pipelineDesconectado(MOTIVO_ERRO_LEITURA);
  }
}

/**
 * Uma negociação e a etapa em que ela está.
 *
 * O id entra por parâmetro porque a tela é sobre UMA — mas quem decide se
 * essa pessoa pode vê-la é a RLS de 0024, não este argumento. A conferência
 * de forma aqui existe para não transformar lixo de URL em consulta.
 *
 * Não encontrada NÃO é erro de leitura: volta `conectado: true` com
 * `oportunidade: null`, porque "não existe (ou não é sua)" e "não consegui
 * ler" pedem telas diferentes.
 */
export async function lerOportunidade(id: string): Promise<OportunidadeDetalhada> {
  if (typeof id !== "string" || !UUID.test(id)) {
    return { conectado: false, motivo: MOTIVO_ID_INVALIDO, oportunidade: null, etapa: null };
  }
  if (!supabaseConfigurado()) {
    return { conectado: false, motivo: MOTIVO_SEM_CONEXAO, oportunidade: null, etapa: null };
  }

  try {
    const s = criarSupabaseServer();

    const [oportunidadeRes, etapasRes] = await Promise.all([
      s.from("oportunidade").select("*").eq("id", id),
      s.from("funil_etapa").select("*").order("ordem", { ascending: true }),
    ]);

    const erro = oportunidadeRes.error ?? etapasRes.error;
    if (erro) {
      avisar("lerOportunidade", erro);
      return { conectado: false, motivo: MOTIVO_ERRO_LEITURA, oportunidade: null, etapa: null };
    }

    const linhas = (oportunidadeRes.data ?? []) as Row[];
    const oportunidade = linhas.length > 0 ? linhaParaOportunidade(linhas[0]) : null;
    const etapas = ((etapasRes.data ?? []) as Row[]).map(linhaParaEtapa);

    return {
      conectado: true,
      motivo: "",
      oportunidade,
      etapa: oportunidade ? etapas.find((e) => e.id === oportunidade.etapaId) ?? null : null,
    };
  } catch (excecao) {
    avisar("lerOportunidade", { code: excecao instanceof Error ? excecao.name : "excecao" });
    return { conectado: false, motivo: MOTIVO_ERRO_LEITURA, oportunidade: null, etapa: null };
  }
}

/**
 * As propostas de UMA negociação, com token — é aqui que o link é montado.
 *
 * A contagem de visitas é pedida pelos ids que sobraram, nunca pela
 * negociação: mesma regra de `lerFeedDoTime` com comentários. E se não sobrou
 * proposta nenhuma, a consulta de visita não acontece — perguntar por uma
 * lista vazia é uma ida ao banco para receber nada de volta.
 */
export async function lerPropostas(oportunidadeId: string): Promise<PropostasDaOportunidade> {
  if (typeof oportunidadeId !== "string" || !UUID.test(oportunidadeId)) {
    return { conectado: false, motivo: MOTIVO_ID_INVALIDO, parcial: false, propostas: [] };
  }
  if (!supabaseConfigurado()) {
    return { conectado: false, motivo: MOTIVO_SEM_CONEXAO, parcial: false, propostas: [] };
  }

  try {
    const s = criarSupabaseServer();

    const propostasRes = await s
      .from("proposta")
      .select("*")
      .eq("oportunidade_id", oportunidadeId)
      .order("criado_em", { ascending: false });

    if (propostasRes.error) {
      avisar("lerPropostas/proposta", propostasRes.error);
      return { conectado: false, motivo: MOTIVO_ERRO_LEITURA, parcial: false, propostas: [] };
    }

    const linhas = (propostasRes.data ?? []) as Row[];
    if (linhas.length === 0) return { conectado: true, motivo: "", parcial: false, propostas: [] };

    const visitasRes = await s
      .from("proposta_visita")
      .select("proposta_id, quando")
      .in("proposta_id", linhas.map((r) => r.id));

    const parcial = Boolean(visitasRes.error);
    if (visitasRes.error) avisar("lerPropostas/visita", visitasRes.error);

    // Só `proposta_id` e `quando` saem da tabela, e só contagem e data saem
    // deste módulo. O hash não atravessa — ver o cabeçalho.
    const visitas = parcial ? [] : ((visitasRes.data ?? []) as Row[]);

    return {
      conectado: true,
      motivo: "",
      parcial,
      propostas: linhas.map((r) => {
        const minhas = visitas.filter((v) => v.proposta_id === r.id).map((v) => String(v.quando));
        return {
          id: r.id,
          oportunidadeId: r.oportunidade_id,
          token: r.token ?? "",
          titulo: r.titulo ?? "",
          corpo: r.corpo ?? "",
          valor: Number(r.valor ?? 0),
          validade: r.validade ?? null,
          status: r.status ?? "",
          criadoEm: r.criado_em,
          visitas: parcial ? null : minhas.length,
          ultimaVisita: parcial || minhas.length === 0 ? null : minhas.sort().at(-1) ?? null,
        };
      }),
    };
  } catch (excecao) {
    avisar("lerPropostas", { code: excecao instanceof Error ? excecao.name : "excecao" });
    return { conectado: false, motivo: MOTIVO_ERRO_LEITURA, parcial: false, propostas: [] };
  }
}
