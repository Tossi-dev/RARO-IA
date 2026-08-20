// A parte PURA de apresentação da tela de avisos da GESTÃO — recebe o
// `FeedDoTime` já resolvido e só desenha. `page.tsx` cuida da busca.
//
// ============================================================
// O CORPO É DESENHADO COMO TEXTO
// ============================================================
//
// `{post.corpo}` dentro de JSX é escapado pelo React sozinho: um `<script>`
// digitado por alguém sai como texto na tela, nunca como tag. Isso é o que
// torna segura a decisão da escrita (tarefa 35) de gravar o corpo exatamente
// como veio, sem sanitizar — as duas pontas combinam, e mexer numa sem a
// outra quebra o par. `dangerouslySetInnerHTML` não aparece neste arquivo, e
// não é para aparecer.
//
// `whitespace-pre-line` preserva as quebras de linha que a pessoa digitou sem
// interpretar nada — é o mais perto de "markdown" que esta tela chega, de
// propósito.
//
// ============================================================
// O FORMULÁRIO NÃO TEM CAMPO DE DESTINATÁRIOS
// ============================================================
//
// `publicarPost` recusa `feed`/`broadcast` com lista, e recusa `dm` sem
// lista. Esta tela publica só aviso de mural — a mensagem direta pede uma
// escolha de destinatário que ainda não existe aqui, e oferecer meio caminho
// (o campo sem a lista de gente) produziria um formulário que só sabe dar
// erro. A carteira de clientes também não pode viajar dentro do formulário,
// que é a razão inteira daquela recusa.

import {
  Badge,
  Botao,
  Campo,
  Card,
  Input,
  PageHeader,
  Select,
  TextArea,
  Vazio,
  type Tom,
} from "@/components/ui";
import { arquivarPostDoForm, publicarPostDoForm } from "@/lib/feed/acoes-form";
import type { FeedDoTime, Post } from "@/lib/feed/dados";
import { dataHoraBr } from "../mentoria/textos";

const ROTULO_ESCOPO: Record<string, string> = {
  feed: "Mural",
  broadcast: "Destaque",
  dm: "Mensagem direta",
};

const TOM_ESCOPO: Record<string, Tom> = {
  feed: "azul",
  broadcast: "ouro",
  dm: "violeta",
};

function LinhaDoPost({
  post,
  quantosDestinatarios,
  quantosComentarios,
}: {
  post: Post;
  quantosDestinatarios: number;
  quantosComentarios: number;
}) {
  const publicado = dataHoraBr(post.publicadoEm ?? "");

  return (
    <li className="border-b border-borda-sutil pb-4 last:border-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">
          {post.titulo || "Sem título"}
          {post.arquivado ? <span className="ml-2 text-xs text-texto-3">arquivado</span> : null}
        </span>
        <span className="flex items-center gap-2 text-xs text-texto-3">
          <Badge tom={TOM_ESCOPO[post.escopo] ?? "cinza"}>{ROTULO_ESCOPO[post.escopo] ?? "Aviso"}</Badge>
          {/* Rascunho é DITO, não deduzido de uma data em branco. */}
          {publicado ? publicado : "Não publicado"}
        </span>
      </div>

      {/* Texto, sempre. Ver o cabeçalho. */}
      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-texto-2">{post.corpo}</p>

      <p className="mt-2 text-xs text-texto-3">
        {quantosDestinatarios} {quantosDestinatarios === 1 ? "destinatário" : "destinatários"} ·{" "}
        {quantosComentarios} {quantosComentarios === 1 ? "comentário" : "comentários"}
      </p>

      {!post.arquivado ? (
        <form action={arquivarPostDoForm} className="mt-2">
          <input type="hidden" name="postId" value={post.id} />
          {/* Arquivar tira da tela do mentorado e mantém aqui — nada é
              apagado. O rótulo diz isso para quem clica. */}
          <Botao tipo="fantasma">Arquivar</Botao>
        </form>
      ) : null}
    </li>
  );
}

export function FeedVisao({ feed, erro = "" }: { feed: FeedDoTime; erro?: string }) {
  return (
    <>
      <PageHeader titulo="Avisos" sub="O mural dos mentorados — o que foi dito, e para quem" />

      {erro ? (
        <p className="mb-4 rounded-xl border border-negativo/40 bg-negativo/10 px-4 py-3 text-sm text-negativo">
          {erro}
        </p>
      ) : null}

      {!feed.conectado ? (
        <Card>
          <p className="text-sm text-texto-2">{feed.motivo}</p>
        </Card>
      ) : (
        <>
          <Card titulo={`Avisos (${feed.posts.length})`}>
            {feed.posts.length === 0 ? (
              <Vazio>
                Nenhum aviso publicado ainda. Um aviso aparece no portal de todos os mentorados assim que
                você publica — antes disso, fica guardado como rascunho.
              </Vazio>
            ) : (
              <ul className="space-y-4">
                {feed.posts.map(({ post, destinatarios, comentarios }) => (
                  <LinhaDoPost
                    key={post.id}
                    post={post}
                    quantosDestinatarios={destinatarios.length}
                    quantosComentarios={comentarios.length}
                  />
                ))}
              </ul>
            )}
          </Card>

          <details className="mt-4 rounded-2xl border border-borda-sutil bg-poco px-4 py-3">
            <summary className="trans list-none cursor-pointer text-sm font-medium text-primaria-2 [&::-webkit-details-marker]:hidden">
              + Novo aviso
            </summary>
            <form action={publicarPostDoForm} className="mt-3 grid gap-3">
              <Campo label="Título (opcional)">
                <Input name="titulo" maxLength={200} placeholder="Uma linha que resume o aviso" />
              </Campo>
              <Campo label="Tipo">
                <Select name="escopo" defaultValue="feed">
                  <option value="feed">Mural</option>
                  <option value="broadcast">Destaque</option>
                </Select>
              </Campo>
              <Campo label="Texto">
                <TextArea name="corpo" required rows={5} maxLength={20000} />
              </Campo>
              <div>
                <label className="flex items-center gap-2 text-sm text-texto-2">
                  <input type="checkbox" name="publicar" value="1" className="h-4 w-4" />
                  Publicar agora
                </label>
                <p className="mt-1.5 text-xs text-texto-2">
                  Todos os mentorados com acesso ao portal recebem este aviso. Sem marcar, ele fica salvo
                  como rascunho e ninguém vê.
                </p>
              </div>
              <div>
                <Botao>Salvar aviso</Botao>
              </div>
            </form>
          </details>
        </>
      )}
    </>
  );
}
