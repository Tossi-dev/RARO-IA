// O card de AVISOS do portal — o feed como o mentorado o vê.
//
// Componente puro: recebe o `MeuFeed` já resolvido por `lerMeuFeed` e só
// desenha. Mora em arquivo próprio, e não dentro de `visao.tsx`, por dois
// motivos: `visao.tsx` já é grande, e este bloco tem uma suíte de testes
// própria (`../feed/visao.test.tsx`) que precisa importá-lo sozinho.
//
// ============================================================
// O CARD SOME INTEIRO EM DOIS ESTADOS
// ============================================================
//
// Sem ficha de mentorado, o card não existe — quem chega ao portal sem
// acompanhamento já vê a tela de "ainda não há nada por aqui", e um card
// vazio embaixo não acrescenta nada.
//
// Sem conexão, ele também não existe: o portal inteiro já mostra o motivo
// naquele caso, e dois avisos de erro na mesma tela dizendo a mesma coisa é
// ruído. O que NÃO acontece é o card aparecer vazio fingindo que não há
// avisos quando o que houve foi uma falha de leitura.
//
// ============================================================
// O CONTADOR PASSA POR `badgeValido`
// ============================================================
//
// `badgeValido` (src/lib/apps.ts) já decide o que vira badge: zero, negativo,
// NaN e ausente não desenham nada. Escrever `total > 0` aqui seria uma
// segunda opinião sobre a mesma pergunta — e a segunda é sempre a que ninguém
// lembra de consertar.
//
// O corpo é desenhado como TEXTO (React escapa sozinho), pelo mesmo par de
// decisões descrito em `../feed/visao.tsx`.

import { Badge, Botao, Card, Vazio } from "@/components/ui";
import { badgeValido } from "@/lib/apps";
import { marcarPostLidoDoForm } from "@/lib/feed/acoes-form";
import type { Comentario, MeuFeed, Post } from "@/lib/feed/dados";
import { dataHoraBr } from "../mentoria/textos";

function Aviso({ post, comentarios, lido }: { post: Post; comentarios: Comentario[]; lido: boolean }) {
  const quando = dataHoraBr(post.publicadoEm ?? "");

  return (
    <li className="border-b border-borda-sutil pb-4 last:border-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">
          {post.titulo || "Aviso"}
          {!lido ? (
            <span className="ml-2 align-middle">
              <Badge tom="azul">Novo</Badge>
            </span>
          ) : null}
        </span>
        {quando ? <span className="text-xs text-texto-3">{quando}</span> : null}
      </div>

      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-texto-2">{post.corpo}</p>

      {comentarios.length > 0 ? (
        <ul className="mt-2.5 space-y-1.5 border-l-2 border-borda-sutil pl-3">
          {comentarios.map((comentario) => (
            <li key={comentario.id} className="whitespace-pre-line text-xs text-texto-2">
              {comentario.corpo}
            </li>
          ))}
        </ul>
      ) : null}

      {/* O botão só existe enquanto há o que marcar. Oferecer "marcar como
          lido" no que já foi lido é oferecer um clique que não faz nada — e
          `post_marcar_lido` ignora a segunda chamada de propósito, porque a
          primeira leitura é a que conta. */}
      {!lido ? (
        <form action={marcarPostLidoDoForm} className="mt-2.5">
          <input type="hidden" name="postId" value={post.id} />
          <Botao tipo="fantasma">Marcar como lido</Botao>
        </form>
      ) : null}
    </li>
  );
}

export function AvisosDoPortal({ feed }: { feed: MeuFeed }) {
  // Ver o cabeçalho: nos dois casos o portal já diz o que precisa ser dito.
  if (!feed.conectado || !feed.ehMentorado) return null;

  const badge = badgeValido(feed.naoLidos.total);

  return (
    <Card titulo="Avisos">
      {badge !== undefined ? (
        <p data-badge={String(badge)} className="mb-3 text-xs font-medium text-primaria-2">
          {badge} {badge === 1 ? "aviso novo" : "avisos novos"}
        </p>
      ) : null}

      {feed.itens.length === 0 ? (
        <Vazio>
          Nenhum aviso por aqui ainda. Quando seu mentor publicar algo, aparece nesta lista.
        </Vazio>
      ) : (
        <ul className="space-y-4">
          {feed.itens.map(({ post, comentarios, lido }) => (
            <Aviso key={post.id} post={post} comentarios={comentarios} lido={lido} />
          ))}
        </ul>
      )}
    </Card>
  );
}
