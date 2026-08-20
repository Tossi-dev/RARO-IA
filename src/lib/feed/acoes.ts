// NOTA DE FRONTEIRA: sem "use server". Um módulo "use server" só pode exportar
// função async, e este exporta as constantes de mensagem que os testes leem. A
// fronteira das telas do feed nasce na tarefa 36, no mesmo molde de
// `conteudo/acoes-gestao-trilha.ts` e `mentoria/acoes-ficha.ts`.
//
// Escrita do feed: publicar, comentar, arquivar e marcar como lido.
//
// ============================================================
// AS DUAS RECUSAS QUE DÃO O DESENHO DESTE ARQUIVO
// ============================================================
//
// 1. `dm` SEM DESTINATÁRIO é recusada. Um post de escopo `dm` sem ninguém
//    endereçado é invisível para todo mundo: a política de select de 0022
//    exige uma linha em `post_destinatario` para liberá-lo. O mentor
//    escreveria um recado que nenhum cliente recebe, e nada avisaria — ele
//    ficaria esperando resposta de uma mensagem que não existe para o outro
//    lado.
//
// 2. `feed` e `broadcast` COM lista de destinatários são recusados. Os dois
//    alcançam todo mundo; aceitar uma lista significaria a carteira de
//    clientes do Jefson montada dentro de um formulário, no navegador, para
//    quem abrir as devtools ler. Quem monta essa lista é o SERVIDOR, aqui
//    dentro, depois de gravar o post — o formulário nunca a vê.
//
// O plano da Fase 2 pedia a recusa só para `broadcast`. `feed` entra pela
// mesma razão, palavra por palavra: os dois têm o mesmo alcance, e a
// diferença entre eles é de destaque na tela, não de permissão.
//
// ============================================================
// O CORPO É GRAVADO COMO VEIO
// ============================================================
//
// Nada de interpretar HTML, nada de "sanitizar" aqui. Quem escapa é o React,
// na hora de desenhar, e ele faz isso sozinho para todo texto. Um sanitizador
// caseiro no caminho da escrita é a forma mais confiável de estragar um texto
// legítimo (um `<` num "5 < 10", uma aspa num nome) e ainda deixar passar o
// que importa. O que a pessoa escreveu é o que fica gravado.
//
// ============================================================
// MARCAR COMO LIDO É `rpc`, NUNCA `.update()`
// ============================================================
//
// Não existe política de update de `post_destinatario` para mentorado, e isso
// foi decisão da 0022: RLS decide se a LINHA aparece, nunca QUE COLUNA pode
// ser escrita. Com a política de linha inteira que 0012 tinha, um PATCH
// direto no PostgREST forjava a data e movia a linha para outro mentorado.
// Quem decide é `public.post_marcar_lido`, dentro do banco, a cada chamada.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { escopoDePost } from "./visibilidade";
import { criarSupabaseServer } from "../supabase/server";

export const MOTIVO_CORPO_VAZIO = "Escreva o texto do aviso antes de salvar.";
export const MOTIVO_ESCOPO_INVALIDO = "Não reconheci o tipo do aviso. Recarregue a página e tente de novo.";
export const MOTIVO_DM_SEM_DESTINATARIO =
  "Uma mensagem direta precisa de pelo menos um destinatário — sem isso, ninguém a receberia.";
export const MOTIVO_BROADCAST_COM_DESTINATARIO =
  "Avisos do mural vão para todos os mentorados. Para escrever a uma pessoa só, use mensagem direta.";
export const MOTIVO_POST_INVALIDO = "Não reconheci o aviso. Recarregue a página e tente de novo.";
export const MOTIVO_COMENTARIO_INVALIDO = "Não reconheci o comentário. Recarregue a página e tente de novo.";
export const MOTIVO_SEM_SESSAO = "Sua sessão expirou. Entre de novo para continuar.";
export const MOTIVO_ERRO_SALVAR = "Não foi possível salvar agora. Tente novamente em instantes.";
export const MOTIVO_ERRO_MARCAR =
  "Não foi possível registrar a leitura agora. Tente novamente em instantes.";

// As rotas de verdade. `/portal` e NÃO `/portal/feed`: o mentorado vê os
// avisos num CARD dentro do próprio portal (tarefa 36), não numa tela
// separada — a casa dele é uma página só. Constante, e não literal espalhado,
// porque cada caminho é usado duas vezes (o `redirect` de erro e o
// `revalidatePath` de sucesso) e porque isso já errou antes: em `acoes-trilha.ts`
// os dois nasceram apontando para rotas que nunca existiram, e o estrago era
// silencioso — erro virando 404 em vez de mensagem, e cache limpo de uma rota
// que ninguém abre.
/** Os códigos que o portal sabe traduzir (`MENSAGENS_ERRO`, em
 *  portal/textos.ts). Curtos e sem espaço de propósito: eles atravessam a URL
 *  e a tela nunca os desenha crus. */
export const CODIGO_COMENTARIO = "comentario";
export const CODIGO_AVISO = "aviso";

const CAMINHO_GESTAO = "/feed";
const CAMINHO_PORTAL = "/portal";
const MAX_ID = 100;
const MAX_TITULO = 200;
const MAX_CORPO = 20000;
const MAX_DESTINATARIOS = 2000;
const MAX_DETALHE_LOG = 40;

function avisar(operacao: string, detalhe: unknown): void {
  console.warn(`[feed/acoes] ${operacao} falhou`, String(detalhe).slice(0, MAX_DETALHE_LOG));
}

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim();
}

/**
 * Volta para a tela com o motivo.
 *
 * DUAS GRAMÁTICAS, e a diferença não é estética. A tela da GESTÃO renderiza
 * `?erro=` como frase, porque quem a lê é o time e a mensagem precisa dizer
 * exatamente o que recusou. O PORTAL não: lá `?erro=` carrega um CÓDIGO
 * curto, que `mensagemDeErro` (portal/textos.ts) traduz. A razão está escrita
 * na auditoria — o MÉDIO 5: enquanto o portal renderizava o texto da URL,
 * qualquer link `?erro=<texto de ataque>` virava um "aviso do sistema" dentro
 * do banner oficial do produto, para quem clicasse.
 *
 * Por isso as ações do portal chamam `voltarComCodigo`, e nunca esta.
 */
function voltarComErro(caminho: string, mensagem: string): never {
  redirect(`${caminho}?erro=${encodeURIComponent(mensagem)}`);
}

/** O caminho do portal, com o CÓDIGO que a tela sabe traduzir. */
function voltarComCodigo(codigo: string): never {
  redirect(`${CAMINHO_PORTAL}?erro=${encodeURIComponent(codigo)}`);
}

/** `redirect` do Next sinaliza por exceção — engoli-la mataria o próprio
 *  redirecionamento. */
function ehControleDeFluxoDoNext(excecao: unknown): boolean {
  if (typeof excecao !== "object" || excecao === null) return false;
  const digest = (excecao as { digest?: unknown }).digest;
  if (typeof digest !== "string") return false;
  return (
    digest.startsWith("NEXT_REDIRECT") ||
    digest.startsWith("NEXT_NOT_FOUND") ||
    digest.startsWith("DYNAMIC_SERVER_USAGE")
  );
}

/**
 * Quem está escrevendo — a SESSÃO, nunca um campo do formulário.
 *
 * A política de insert de `comentario` (0022) exige
 * `autor_perfil_id = auth.uid()`, então o banco recusaria de qualquer jeito um
 * id alheio. Resolver aqui não é redundância: é a diferença entre uma
 * mensagem humana e um erro de constraint na cara do usuário — e entre
 * escrever a ação já contando com o banco dizer não, ou não tentar.
 */
async function idDeQuemEscreve(s: ReturnType<typeof criarSupabaseServer>): Promise<string | null> {
  try {
    const { data, error } = await s.auth.getUser();
    if (error) return null;
    const id = data?.user?.id;
    return typeof id === "string" && id !== "" ? id : null;
  } catch (excecao) {
    avisar("idDeQuemEscreve", excecao instanceof Error ? excecao.name : "excecao");
    return null;
  }
}

/** Os destinatários que vieram do formulário, sem repetição e sem vazios. */
function destinatariosDoFormulario(formData: FormData): string[] {
  const brutos = formData.getAll("destinatarios").map((v) => String(v).trim());
  return [...new Set(brutos.filter((v) => v !== "" && v.length <= MAX_ID))];
}

// ============================================================
// publicarPost
// ============================================================

/**
 * Cria (ou atualiza) um post e amarra os destinatários.
 *
 * `workspace_id` NUNCA é lido do formulário — nem é mencionado. Ele tem
 * `default` no schema, e a política de insert de 0022 exige
 * `workspace_id = workspace_atual()`: quem decide de quem é a linha é o banco,
 * a partir de quem está autenticado.
 *
 * `publicar` liga só com o literal `"1"`. Qualquer outra coisa deixa como
 * rascunho — o lado seguro: o erro possível é a pessoa precisar clicar de
 * novo, nunca um recado indo ao ar sem ninguém ter mandado.
 */
export async function publicarPost(formData: FormData): Promise<void> {
  const caminho = CAMINHO_GESTAO;

  const escopo = escopoDePost(texto(formData, "escopo"));
  if (escopo === null) voltarComErro(caminho, MOTIVO_ESCOPO_INVALIDO);

  const corpo = String(formData.get("corpo") ?? "").trim();
  if (corpo === "" || corpo.length > MAX_CORPO) voltarComErro(caminho, MOTIVO_CORPO_VAZIO);

  const destinatarios = destinatariosDoFormulario(formData);
  if (escopo === "dm" && destinatarios.length === 0) {
    voltarComErro(caminho, MOTIVO_DM_SEM_DESTINATARIO);
  }
  if (escopo !== "dm" && destinatarios.length > 0) {
    voltarComErro(caminho, MOTIVO_BROADCAST_COM_DESTINATARIO);
  }

  const titulo = texto(formData, "titulo").slice(0, MAX_TITULO);
  // `new Date()` aqui é a BORDA: esta função é uma ação, não um módulo puro.
  // O instante da publicação é o do servidor, e não algo que o formulário
  // possa escolher — um `publicadoEm` vindo de fora seria um agendamento
  // para o passado, publicando na hora com data mentirosa.
  const publicadoEm = texto(formData, "publicar") === "1" ? new Date().toISOString() : null;

  try {
    const s = criarSupabaseServer();

    const autor = await idDeQuemEscreve(s);
    if (!autor) voltarComErro(caminho, MOTIVO_SEM_SESSAO);

    const { data, error } = await s
      .from("post")
      .insert({
        autor_perfil_id: autor,
        escopo,
        titulo,
        corpo,
        publicado_em: publicadoEm,
      })
      .select("id")
      .maybeSingle();

    if (error || !data?.id) {
      avisar("publicarPost", (error as { code?: string } | null)?.code ?? "sem-codigo");
      voltarComErro(caminho, MOTIVO_ERRO_SALVAR);
    }

    const postId = String(data.id);
    const alvos = escopo === "dm" ? destinatarios : await todosOsMentorados(s);

    if (alvos.length > 0) {
      const { error: erroDest } = await s
        .from("post_destinatario")
        .insert(alvos.slice(0, MAX_DESTINATARIOS).map((mentoradoId) => ({
          post_id: postId,
          mentorado_id: mentoradoId,
        })));

      if (erroDest) {
        // O post já existe; só a lista de leitura falhou. Dizer isso é melhor
        // que fingir sucesso — sem as linhas, ninguém consegue marcar como
        // lido e o contador nunca acende.
        avisar("publicarPost/destinatarios", (erroDest as { code?: string }).code ?? "sem-codigo");
        voltarComErro(caminho, MOTIVO_ERRO_SALVAR);
      }
    }
  } catch (excecao) {
    if (ehControleDeFluxoDoNext(excecao)) throw excecao;
    avisar("publicarPost", excecao instanceof Error ? excecao.name : "excecao");
    voltarComErro(caminho, MOTIVO_ERRO_SALVAR);
  }

  revalidatePath(caminho);
  revalidatePath(CAMINHO_PORTAL);
}

/**
 * Os mentorados do workspace que têm login — a lista de quem recebe um aviso
 * de mural.
 *
 * `perfil_id not null` porque um mentorado sem conta não abre o portal: criar
 * uma linha de leitura para ele seria um "não lido" que ninguém nunca apaga,
 * inflando o contador de todo mundo por uma pessoa que nem entrou.
 *
 * A lista sai do BANCO, com a RLS de quem está publicando — não do
 * formulário. É o ponto inteiro da recusa lá em cima.
 */
async function todosOsMentorados(s: ReturnType<typeof criarSupabaseServer>): Promise<string[]> {
  const { data, error } = await s.from("mentorado").select("id").not("perfil_id", "is", null);
  if (error) {
    avisar("todosOsMentorados", (error as { code?: string }).code ?? "sem-codigo");
    return [];
  }
  return ((data ?? []) as Array<{ id?: unknown }>)
    .map((r) => String(r.id ?? ""))
    .filter((id) => id !== "");
}

// ============================================================
// comentar
// ============================================================

export async function comentar(formData: FormData): Promise<void> {
  const caminho = CAMINHO_PORTAL;

  const postId = texto(formData, "postId");
  if (!postId || postId.length > MAX_ID) voltarComCodigo(CODIGO_COMENTARIO);

  const corpo = String(formData.get("corpo") ?? "").trim();
  if (corpo === "" || corpo.length > MAX_CORPO) voltarComCodigo(CODIGO_COMENTARIO);

  try {
    const s = criarSupabaseServer();

    const autor = await idDeQuemEscreve(s);
    if (!autor) voltarComCodigo(CODIGO_COMENTARIO);

    const { error } = await s.from("comentario").insert({
      post_id: postId,
      autor_perfil_id: autor,
      corpo,
    });

    if (error) {
      avisar("comentar", (error as { code?: string }).code ?? "sem-codigo");
      voltarComCodigo(CODIGO_COMENTARIO);
    }
  } catch (excecao) {
    if (ehControleDeFluxoDoNext(excecao)) throw excecao;
    avisar("comentar", excecao instanceof Error ? excecao.name : "excecao");
    voltarComCodigo(CODIGO_COMENTARIO);
  }

  revalidatePath(caminho);
  revalidatePath(CAMINHO_GESTAO);
}

// ============================================================
// arquivar — UPDATE, nunca apagar
// ============================================================
//
// A regra da casa: nada é apagado. Um aviso e um comentário são coisas que
// foram DITAS a um cliente; apagar a linha apagaria a prova de que foram.
// Arquivado some da tela do mentorado (a política de select de 0022 exige
// `arquivado = false` no ramo dele) e continua na da gestão.

export async function arquivarPost(formData: FormData): Promise<void> {
  const caminho = CAMINHO_GESTAO;

  const postId = texto(formData, "postId");
  if (!postId || postId.length > MAX_ID) voltarComErro(caminho, MOTIVO_POST_INVALIDO);

  try {
    const s = criarSupabaseServer();
    const { error } = await s.from("post").update({ arquivado: true }).eq("id", postId);

    if (error) {
      avisar("arquivarPost", (error as { code?: string }).code ?? "sem-codigo");
      voltarComErro(caminho, MOTIVO_ERRO_SALVAR);
    }
  } catch (excecao) {
    if (ehControleDeFluxoDoNext(excecao)) throw excecao;
    avisar("arquivarPost", excecao instanceof Error ? excecao.name : "excecao");
    voltarComErro(caminho, MOTIVO_ERRO_SALVAR);
  }

  revalidatePath(caminho);
  revalidatePath(CAMINHO_PORTAL);
}

export async function arquivarComentario(formData: FormData): Promise<void> {
  const caminho = CAMINHO_GESTAO;

  const comentarioId = texto(formData, "comentarioId");
  if (!comentarioId || comentarioId.length > MAX_ID) voltarComErro(caminho, MOTIVO_COMENTARIO_INVALIDO);

  try {
    const s = criarSupabaseServer();
    const { error } = await s.from("comentario").update({ arquivado: true }).eq("id", comentarioId);

    if (error) {
      avisar("arquivarComentario", (error as { code?: string }).code ?? "sem-codigo");
      voltarComErro(caminho, MOTIVO_ERRO_SALVAR);
    }
  } catch (excecao) {
    if (ehControleDeFluxoDoNext(excecao)) throw excecao;
    avisar("arquivarComentario", excecao instanceof Error ? excecao.name : "excecao");
    voltarComErro(caminho, MOTIVO_ERRO_SALVAR);
  }

  revalidatePath(caminho);
  revalidatePath(CAMINHO_PORTAL);
}

// ============================================================
// marcarPostLido
// ============================================================

/**
 * Marca um aviso como lido — pela FUNÇÃO do banco, ver o cabeçalho.
 *
 * O único argumento que atravessa é o id do post. Data e mentorado não entram
 * na chamada porque `post_marcar_lido` não os aceita: os dois são deduzidos
 * dentro do Postgres, onde ninguém os escolhe.
 */
export async function marcarPostLido(formData: FormData): Promise<void> {
  const caminho = CAMINHO_PORTAL;

  const postId = texto(formData, "postId");
  if (!postId || postId.length > MAX_ID) voltarComCodigo(CODIGO_AVISO);

  try {
    const s = criarSupabaseServer();
    const { error } = await s.rpc("post_marcar_lido", { p_post_id: postId });

    if (error) {
      avisar("marcarPostLido", (error as { code?: string }).code ?? "sem-codigo");
      voltarComCodigo(CODIGO_AVISO);
    }
  } catch (excecao) {
    if (ehControleDeFluxoDoNext(excecao)) throw excecao;
    avisar("marcarPostLido", excecao instanceof Error ? excecao.name : "excecao");
    voltarComCodigo(CODIGO_AVISO);
  }

  revalidatePath(caminho);
}
