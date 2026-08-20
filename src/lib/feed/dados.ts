// A leitura do feed — a da gestão e a do mentorado.
//
// Molde de `conteudo/dados-trilha.ts` e `mentoria/portal.ts`: nunca lança,
// devolve `conectado`/`motivo` em vez de exceção, e o motivo é texto humano
// sem nome de tabela, sem nome de coluna e sem código de erro. Quem lê a
// mensagem é o cliente do Jefson; o código do erro vai para o log, onde ele
// serve para alguma coisa.
//
// ============================================================
// A CONSULTA DE COMENTÁRIO PARTE DOS POSTS JÁ FILTRADOS
// ============================================================
//
// A ordem aqui é uma decisão, não um detalhe de implementação: primeiro os
// posts, depois `postsVisiveis`, e só então os comentários — pedidos por
// `.in("post_id", <ids que sobraram>)`.
//
// O caminho oposto seria pedir todos os comentários e descartar os que não
// servem. A RLS de 0022 barraria do mesmo jeito (a política de `comentario`
// delega a `post_visivel`), então "funcionaria". Mas pedir o que não se pode
// ver é o hábito que produz vazamento no dia em que uma política mudar por
// outro motivo — e, no caminho normal, faz o corpo de um comentário de
// mensagem direta alheia atravessar a rede e passar pela memória do
// servidor sem precisar. Não se pede o que não se pode ver.
//
// E quando não sobra post nenhum, a consulta de comentário não acontece: um
// `.in("post_id", [])` é uma ida ao banco para receber lista vazia de volta.
//
// ============================================================
// O QUE ESTE MÓDULO NÃO É
// ============================================================
//
// Não é a barreira. `postsVisiveis` (feed/visibilidade.ts) é conveniência de
// tela — o cabeçalho de lá diz isso com todas as letras, e vale igual aqui.
// Quem impede um mentorado de ler a mensagem direta de outro é a política de
// select de `post`, no Postgres.

import {
  postsVisiveis,
  resumoNaoLidos,
  type Destinatario,
  type ResumoNaoLidos,
} from "./visibilidade";
import { supabaseConfigurado } from "../data";
import { criarSupabaseServer } from "../supabase/server";

/* eslint-disable @typescript-eslint/no-explicit-any -- linha crua do
   Postgres, mesmo padrão de `Row` em `mentoria/dados.ts`. Cada campo passa
   por um mapeador, nunca por `as Tipo`. */
type Row = Record<string, any>;

const MOTIVO_SEM_CONEXAO =
  "Nenhuma conexão com o banco de dados configurada. Os avisos não podem ser carregados agora.";
const MOTIVO_ERRO_LEITURA = "Não foi possível carregar os avisos agora. Tente novamente em instantes.";
const MAX_DETALHE_LOG = 40;

function avisar(operacao: string, erro: unknown): void {
  const e = (erro ?? {}) as { code?: string };
  // Só o código. A mensagem de um erro de PostgREST ecoa o corpo da
  // requisição — aqui isso significaria id de mentorado e, às vezes, o texto
  // do post.
  console.warn(`[feed/dados] ${operacao} falhou`, String(e.code ?? "sem-codigo").slice(0, MAX_DETALHE_LOG));
}

export interface Post {
  id: string;
  workspaceId: string;
  autorPerfilId: string | null;
  escopo: string;
  titulo: string;
  corpo: string;
  publicadoEm: string | null;
  arquivado: boolean;
  criadoEm: string;
}

export interface Comentario {
  id: string;
  workspaceId: string;
  postId: string;
  autorPerfilId: string | null;
  corpo: string;
  arquivado: boolean;
  criadoEm: string;
}

export interface FeedDoTime {
  conectado: boolean;
  motivo: string;
  posts: Array<{ post: Post; destinatarios: Destinatario[]; comentarios: Comentario[] }>;
}

export interface MeuFeed {
  conectado: boolean;
  motivo: string;
  /** `false` = conectou, mas quem está logado não tem ficha de mentorado. */
  ehMentorado: boolean;
  itens: Array<{ post: Post; comentarios: Comentario[]; lido: boolean }>;
  naoLidos: ResumoNaoLidos;
}

function linhaParaPost(r: Row): Post {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    autorPerfilId: r.autor_perfil_id ?? null,
    escopo: r.escopo ?? "",
    titulo: r.titulo ?? "",
    corpo: r.corpo ?? "",
    publicadoEm: r.publicado_em ?? null,
    arquivado: Boolean(r.arquivado),
    criadoEm: r.criado_em,
  };
}

function linhaParaDestinatario(r: Row): Destinatario {
  return {
    postId: r.post_id,
    mentoradoId: r.mentorado_id,
    lidoEm: r.lido_em ?? null,
  };
}

function linhaParaComentario(r: Row): Comentario {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    postId: r.post_id,
    autorPerfilId: r.autor_perfil_id ?? null,
    corpo: r.corpo ?? "",
    arquivado: Boolean(r.arquivado),
    criadoEm: r.criado_em,
  };
}

const SEM_NAO_LIDOS: ResumoNaoLidos = { total: 0, porEscopo: { feed: 0, broadcast: 0, dm: 0 } };

function timeDesconectado(motivo: string): FeedDoTime {
  return { conectado: false, motivo, posts: [] };
}

function meuDesconectado(motivo: string): MeuFeed {
  return { conectado: false, motivo, ehMentorado: false, itens: [], naoLidos: SEM_NAO_LIDOS };
}

/**
 * Tudo o que a gestão enxerga: post, destinatários e comentários.
 *
 * Sem parâmetro nenhum, de propósito — nem de workspace, nem de autor, nem de
 * escopo. Um filtro que entrasse por aqui seria um filtro que alguém pode
 * mudar; o recorte de quem vê o quê é da RLS (0022), e ela já sabe quem está
 * perguntando.
 *
 * Rascunho e arquivado VÊM. Quem opera precisa ver o que escreveu e ainda não
 * publicou, e o que tirou do ar — esconder isso aqui faria a tela de gestão
 * mentir sobre o próprio trabalho de quem a usa.
 */
export async function lerFeedDoTime(): Promise<FeedDoTime> {
  if (!supabaseConfigurado()) return timeDesconectado(MOTIVO_SEM_CONEXAO);

  try {
    const s = criarSupabaseServer();

    const postsRes = await s.from("post").select("*").order("publicado_em", { ascending: false });
    if (postsRes.error) {
      avisar("lerFeedDoTime/post", postsRes.error);
      return timeDesconectado(MOTIVO_ERRO_LEITURA);
    }

    const posts = ((postsRes.data ?? []) as Row[]).map(linhaParaPost);
    if (posts.length === 0) return { conectado: true, motivo: "", posts: [] };

    const ids = posts.map((p) => p.id);
    const [destRes, comRes] = await Promise.all([
      s.from("post_destinatario").select("*").in("post_id", ids),
      s.from("comentario").select("*").in("post_id", ids),
    ]);

    const erro = destRes.error ?? comRes.error;
    if (erro) {
      avisar("lerFeedDoTime/relacionados", erro);
      return timeDesconectado(MOTIVO_ERRO_LEITURA);
    }

    const destinatarios = ((destRes.data ?? []) as Row[]).map(linhaParaDestinatario);
    const comentarios = ((comRes.data ?? []) as Row[]).map(linhaParaComentario);

    return {
      conectado: true,
      motivo: "",
      posts: posts.map((post) => ({
        post,
        destinatarios: destinatarios.filter((d) => d.postId === post.id),
        comentarios: comentarios.filter((c) => c.postId === post.id),
      })),
    };
  } catch (excecao) {
    avisar("lerFeedDoTime", { code: excecao instanceof Error ? excecao.name : "excecao" });
    return timeDesconectado(MOTIVO_ERRO_LEITURA);
  }
}

/**
 * O feed de quem está logado, com visibilidade e leitura já resolvidas.
 *
 * UM parâmetro, e é o relógio. O id do mentorado NÃO entra por aqui: sai de
 * `rpc("mentorado_atual")`, que pergunta ao banco quem é o usuário da sessão
 * — a mesma defesa de `lerPortal` e `lerMinhaTrilha`, e o teste trava a
 * aridade para ninguém acrescentar um segundo parâmetro sem perceber o que
 * está abrindo.
 */
export async function lerMeuFeed(agoraIso: string): Promise<MeuFeed> {
  if (!supabaseConfigurado()) return meuDesconectado(MOTIVO_SEM_CONEXAO);

  try {
    const s = criarSupabaseServer();

    const { data: meuId, error: erroRpc } = await s.rpc("mentorado_atual");
    if (erroRpc) {
      avisar("lerMeuFeed/rpc", erroRpc);
      return meuDesconectado(MOTIVO_ERRO_LEITURA);
    }
    // Conectou e não é mentorado: estado diferente de "não consegui ler", e a
    // tela precisa saber a diferença. Nenhuma consulta acontece daqui em
    // diante.
    if (!meuId) {
      return { conectado: true, motivo: "", ehMentorado: false, itens: [], naoLidos: SEM_NAO_LIDOS };
    }

    const [postsRes, destRes] = await Promise.all([
      s.from("post").select("*").order("publicado_em", { ascending: false }),
      s.from("post_destinatario").select("*").eq("mentorado_id", meuId),
    ]);

    const erro = postsRes.error ?? destRes.error;
    if (erro) {
      avisar("lerMeuFeed", erro);
      return meuDesconectado(MOTIVO_ERRO_LEITURA);
    }

    const posts = ((postsRes.data ?? []) as Row[]).map(linhaParaPost);
    const destinatarios = ((destRes.data ?? []) as Row[]).map(linhaParaDestinatario);

    // O filtro acontece ANTES da próxima consulta — ver o cabeçalho.
    const visiveis = postsVisiveis(posts, destinatarios, String(meuId), agoraIso);
    if (visiveis.length === 0) {
      return { conectado: true, motivo: "", ehMentorado: true, itens: [], naoLidos: SEM_NAO_LIDOS };
    }

    const comRes = await s
      .from("comentario")
      .select("*")
      .in(
        "post_id",
        visiveis.map((p) => p.id),
      );
    if (comRes.error) {
      avisar("lerMeuFeed/comentario", comRes.error);
      return meuDesconectado(MOTIVO_ERRO_LEITURA);
    }

    const comentarios = ((comRes.data ?? []) as Row[])
      .map(linhaParaComentario)
      // Arquivado é o "revogado" do comentário: some para o cliente e continua
      // existindo para quem opera (mesma decisão de `conteudo_liberado`, 0018).
      // A política de select de 0022 já não devolve arquivado para mentorado;
      // este filtro é a segunda porta, não a primeira.
      .filter((c) => !c.arquivado);

    const lidos = new Set(
      destinatarios.filter((d) => d.lidoEm !== null && d.lidoEm !== "").map((d) => d.postId),
    );

    return {
      conectado: true,
      motivo: "",
      ehMentorado: true,
      itens: visiveis.map((post) => ({
        post,
        comentarios: comentarios.filter((c) => c.postId === post.id),
        lido: lidos.has(post.id),
      })),
      naoLidos: resumoNaoLidos(posts, destinatarios, String(meuId), agoraIso),
    };
  } catch (excecao) {
    avisar("lerMeuFeed", { code: excecao instanceof Error ? excecao.name : "excecao" });
    return meuDesconectado(MOTIVO_ERRO_LEITURA);
  }
}
