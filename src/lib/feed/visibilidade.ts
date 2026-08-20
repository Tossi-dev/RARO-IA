// Quem vê o quê no feed — módulo PURO. Sem Next, sem banco, sem relógio
// próprio: tudo o que ele sabe entra por parâmetro.
//
// ============================================================
// ISTO É CONVENIÊNCIA DE TELA, NÃO É SEGURANÇA
// ============================================================
//
// A garantia de que um mentorado não lê a mensagem direta de outro é a RLS
// da migração 0022 — a política de select de `post`, que delega a
// `public.post_visivel(uuid)`. Se este arquivo inteiro sumisse do
// repositório, nada mudaria para quem tenta ler o que não é dele: um `curl`
// com a chave anônima continuaria voltando vazio, porque quem responde não é
// este código, é o Postgres.
//
// O que este módulo faz é outra coisa: permitir que a TELA decida o que
// desenhar sem fazer uma consulta por post, e que o contador de não lidos
// exista sem uma segunda ida ao banco. É a mesma divisão que o cabeçalho de
// `mentoria/portal.ts` descreve, e o mesmo aviso que `acoes-trilha.ts`
// carrega sobre a checagem de liberação: se esta fosse a única barreira, não
// seria barreira nenhuma.
//
// POR QUE ENTÃO ELE REPETE A REGRA DO BANCO
// ------------------------------------------
// Porque as duas perguntas são diferentes: o banco responde "esta linha pode
// sair?" e a tela responde "esta linha eu desenho?". Manter as duas iguais é
// trabalho — e é por isso que a regra está escrita aqui na MESMA ordem da
// função `post_visivel`, com os mesmos nomes, para quem comparar os dois
// arquivos conseguir fazer isso de relance. Divergir não abre buraco de
// segurança; abre um bug de tela (item que some ao clicar, contador que não
// bate), que é ruim de outro jeito.
//
// ============================================================
// A REGRA DE BORDA: NA DÚVIDA, ESCONDE
// ============================================================
//
// Escopo desconhecido, data ilegível, relógio ausente, `mentoradoId` vazio —
// tudo devolve lista vazia. O erro tentador em cada um desses casos é o
// mesmo: "não consegui avaliar, então não filtro". Isso transforma qualquer
// entrada estranha em "mostra tudo", que é exatamente o contrário do que se
// quer numa tela que carrega mensagem direta.

/** Os três valores do enum `escopo_post` (migração 0022). */
export type EscopoPost = "feed" | "broadcast" | "dm";

const ESCOPOS: readonly EscopoPost[] = ["feed", "broadcast", "dm"];

/** O post como esta função precisa vê-lo. A leitura entrega mais campos; o
 *  tipo pede só o que decide visibilidade, e `postsVisiveis` devolve os
 *  objetos ORIGINAIS, com tudo que vieram carregando. */
export interface PostParaVisibilidade {
  id: string;
  /** Vem do banco como texto; pode ser qualquer coisa em runtime. */
  escopo: string;
  arquivado: boolean;
  /** Nulo ou vazio = rascunho. Futuro = agendado. */
  publicadoEm: string | null;
}

export interface Destinatario {
  postId: string;
  mentoradoId: string;
  /** Nulo = ainda não lido. */
  lidoEm: string | null;
}

export interface ResumoNaoLidos {
  total: number;
  porEscopo: Record<EscopoPost, number>;
}

/**
 * O escopo, ou `null`.
 *
 * Sem normalização de caixa nem de espaço, de propósito — diferente de
 * `papelDe` (papeis.ts), que aceita " GESTOR ". Lá o valor pode ter sido
 * digitado à mão numa configuração; aqui ele vem de uma coluna com tipo
 * `enum` do Postgres, que só admite os três exatos. Qualquer variação é
 * sinal de que o dado não veio de onde deveria.
 */
export function escopoDePost(valor: unknown): EscopoPost | null {
  if (typeof valor !== "string") return null;
  return (ESCOPOS as readonly string[]).includes(valor) ? (valor as EscopoPost) : null;
}

/** O instante em milissegundos, ou `null` quando não dá para ler. */
function instante(iso: unknown): number | null {
  if (typeof iso !== "string" || iso.trim() === "") return null;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function identidadeValida(mentoradoId: unknown): mentoradoId is string {
  return typeof mentoradoId === "string" && mentoradoId.trim() !== "";
}

/**
 * Os posts que ESTE mentorado enxerga, na ordem em que chegaram.
 *
 * Quatro parâmetros, e o quarto é obrigatório: um módulo puro não pergunta as
 * horas. Deixar `agoraIso` com valor padrão faria `Function.length` valer 3 e
 * o teste de aridade passar sem morder — foi assim que uma checagem parecida
 * não pegou nada antes, no código do certificado.
 */
export function postsVisiveis<T extends PostParaVisibilidade>(
  posts: readonly T[],
  destinatarios: readonly Destinatario[],
  mentoradoId: string,
  agoraIso: string,
): T[] {
  if (!Array.isArray(posts) || !Array.isArray(destinatarios)) return [];
  if (!identidadeValida(mentoradoId)) return [];

  const agora = instante(agoraIso);
  // Sem relógio legível não dá para separar publicado de agendado. Esconder
  // tudo é chato; publicar o rascunho de todo mundo de uma vez é pior.
  if (agora === null) return [];

  // Só os ids de post — e NÃO um par "post+mentorado", que foi a primeira
  // versão disto. O par parecia mais seguro e era só cerimônia: a lista já
  // foi filtrada por ESTA pessoa uma linha acima, então o segundo componente
  // da chave seria constante e nunca poderia distinguir nada. Um mutante que
  // tirava o separador da chave sobreviveu à suíte inteira, e foi assim que
  // a inutilidade apareceu — código defensivo que nenhum teste consegue
  // derrubar costuma ser código que não defende de nada.
  const meusPosts = new Set(
    destinatarios.filter((d) => d && d.mentoradoId === mentoradoId).map((d) => String(d.postId)),
  );

  return posts.filter((post) => {
    if (!post || post.arquivado) return false;

    const escopo = escopoDePost(post.escopo);
    if (escopo === null) return false;

    const publicado = instante(post.publicadoEm);
    if (publicado === null || publicado > agora) return false;

    if (escopo === "dm") return meusPosts.has(post.id);
    return true;
  });
}

/**
 * Quantos posts visíveis ainda não foram lidos por esta pessoa.
 *
 * DUAS DECISÕES QUE MUDAM O NÚMERO:
 *
 * 1. Só conta post que tem linha em `post_destinatario` para ela. Um post de
 *    feed sem destinatário nenhum não entra — e não é omissão: sem essa
 *    linha não existe onde gravar a leitura, então contá-lo acenderia um
 *    badge que nunca apaga.
 * 2. Conta POSTS, não linhas. O mesmo post endereçado a dez pessoas é um
 *    aviso, não dez — e a contagem é por post mesmo que o dado chegue com a
 *    linha repetida (o `unique (post_id, mentorado_id)` de 0022 impede isso
 *    no banco; aqui é a rede para o que vier por outro caminho).
 */
export function resumoNaoLidos(
  posts: readonly PostParaVisibilidade[],
  destinatarios: readonly Destinatario[],
  mentoradoId: string,
  agoraIso: string,
): ResumoNaoLidos {
  const vazio: ResumoNaoLidos = { total: 0, porEscopo: { feed: 0, broadcast: 0, dm: 0 } };

  const visiveis = postsVisiveis(posts, destinatarios, mentoradoId, agoraIso);
  if (visiveis.length === 0) return vazio;

  // Um post entra se existe pelo menos uma linha dele para esta pessoa e
  // NENHUMA delas está lida — dado repetido não pode virar contagem dobrada,
  // e uma linha lida entre duas significa que a pessoa leu.
  const naoLidos = new Set<string>();
  const lidos = new Set<string>();
  for (const d of destinatarios) {
    if (!d || d.mentoradoId !== mentoradoId) continue;
    const id = String(d.postId);
    if (d.lidoEm === null || d.lidoEm === undefined || d.lidoEm === "") naoLidos.add(id);
    else lidos.add(id);
  }

  const porEscopo: Record<EscopoPost, number> = { feed: 0, broadcast: 0, dm: 0 };
  let total = 0;

  for (const post of visiveis) {
    if (!naoLidos.has(post.id) || lidos.has(post.id)) continue;
    const escopo = escopoDePost(post.escopo);
    // `visiveis` já garante escopo válido; o `if` existe para o TypeScript
    // não precisar de um `!` de aposta na linha seguinte.
    if (escopo === null) continue;
    porEscopo[escopo] += 1;
    total += 1;
  }

  return { total, porEscopo };
}
