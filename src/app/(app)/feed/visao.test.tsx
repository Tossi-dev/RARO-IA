// Testes de render das duas telas de avisos: a da gestão (`FeedVisao`) e o
// card do portal (`AvisosDoPortal`).
//
// O QUE ESTA SUÍTE PROVA
// ----------------------
// 1) O CORPO DO POST É TEXTO, NUNCA HTML. Uma entrada com `<script>` sai
//    escapada. A escrita grava o texto como veio (decisão da tarefa 35), o
//    que só é seguro porque a leitura o desenha como texto — as duas pontas
//    combinam, e este teste é a prova do lado que desenha;
// 2) contador zero não vira badge (`badgeValido`, de `apps.ts`, já recusa 0 e
//    NaN — a tela usa aquela função em vez de escrever `> 0` de novo);
// 3) o formulário de aviso de mural NÃO tem campo de destinatários: a ação
//    recusaria, e oferecer o campo seria convidar para um erro — além de
//    colocar a carteira de clientes dentro do formulário;
// 4) feed vazio diz isso com uma frase, nunca com uma lista em branco;
// 5) zero emoji.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { FeedDoTime, MeuFeed, Post } from "@/lib/feed/dados";

vi.mock("@/lib/feed/acoes-form", () => ({
  publicarPostDoForm: vi.fn(),
  comentarDoForm: vi.fn(),
  arquivarPostDoForm: vi.fn(),
  arquivarComentarioDoForm: vi.fn(),
  marcarPostLidoDoForm: vi.fn(),
}));

const { FeedVisao } = await import("./visao");
const { AvisosDoPortal } = await import("../portal/avisos");

const XSS = '<script>alert("xss")</script>';

function post(over: Partial<Post> = {}): Post {
  return {
    id: "p1",
    workspaceId: "ws-1",
    autorPerfilId: "perfil-1",
    escopo: "feed",
    titulo: "Aviso de hoje",
    corpo: "Corpo do aviso",
    publicadoEm: "2026-08-19T10:00:00Z",
    arquivado: false,
    criadoEm: "2026-08-19T09:00:00Z",
    ...over,
  };
}

function feedDoTime(over: Partial<FeedDoTime> = {}): FeedDoTime {
  return { conectado: true, motivo: "", posts: [], ...over };
}

function meuFeed(over: Partial<MeuFeed> = {}): MeuFeed {
  return {
    conectado: true,
    motivo: "",
    ehMentorado: true,
    itens: [],
    naoLidos: { total: 0, porEscopo: { feed: 0, broadcast: 0, dm: 0 } },
    ...over,
  };
}

const renderGestao = (f: FeedDoTime, erro = "") => renderToStaticMarkup(<FeedVisao feed={f} erro={erro} />);
const renderPortal = (f: MeuFeed) => renderToStaticMarkup(<AvisosDoPortal feed={f} />);

function textoDe(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

describe("FeedVisao — os estados", () => {
  it("sem conexão, mostra o motivo e não oferece formulário", () => {
    const html = renderGestao(feedDoTime({ conectado: false, motivo: "Não foi possível carregar os avisos agora." }));

    expect(textoDe(html)).toContain("Não foi possível carregar os avisos agora");
    expect(html).not.toContain('name="corpo"');
  });

  it("sem aviso nenhum, diz isso com uma frase — e o formulário aparece", () => {
    const html = renderGestao(feedDoTime());

    expect(textoDe(html)).toContain("Nenhum aviso publicado ainda");
    expect(html).toContain('name="corpo"');
  });

  it("erro vindo de ?erro= aparece", () => {
    const html = renderGestao(feedDoTime(), "Uma mensagem direta precisa de pelo menos um destinatário.");
    expect(textoDe(html)).toContain("precisa de pelo menos um destinatário");
  });

  it("rascunho e arquivado aparecem para a gestão, marcados como tais", () => {
    const html = renderGestao(
      feedDoTime({
        posts: [
          { post: post({ id: "r", titulo: "Rascunho", publicadoEm: null }), destinatarios: [], comentarios: [] },
          { post: post({ id: "a", titulo: "Arquivado", arquivado: true }), destinatarios: [], comentarios: [] },
        ],
      }),
    );
    const t = textoDe(html);

    expect(t).toContain("Rascunho");
    expect(t).toContain("Arquivado");
    expect(t).toContain("Não publicado");
  });
});

describe("FeedVisao — o formulário", () => {
  it("NÃO tem campo de destinatários para aviso de mural", () => {
    // A ação recusa `feed`/`broadcast` com lista (tarefa 35). Oferecer o
    // campo seria convidar para um erro — e colocar a carteira de clientes
    // dentro do formulário, que é o que aquela recusa existe para impedir.
    const html = renderGestao(feedDoTime());
    expect(html).not.toContain('name="destinatarios"');
  });

  it("diz para quem o aviso vai, em vez de deixar a pessoa adivinhar", () => {
    expect(textoDe(renderGestao(feedDoTime()))).toContain("Todos os mentorados");
  });

  it("publicar é uma escolha explícita, não o padrão", () => {
    // O campo existe e vale "1" — a ação só publica com esse literal.
    const html = renderGestao(feedDoTime());
    expect(html).toContain('name="publicar"');
    expect(html).toContain('value="1"');
  });
});

describe("o corpo é TEXTO, nunca HTML", () => {
  it("na tela da gestão, uma entrada com script sai escapada", () => {
    const html = renderGestao(
      feedDoTime({ posts: [{ post: post({ corpo: XSS, titulo: XSS }), destinatarios: [], comentarios: [] }] }),
    );

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("no card do portal também", () => {
    const html = renderPortal(
      meuFeed({ itens: [{ post: post({ corpo: XSS }), comentarios: [], lido: false }] }),
    );

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("nem em comentário", () => {
    const html = renderPortal(
      meuFeed({
        itens: [
          {
            post: post(),
            comentarios: [
              {
                id: "c1",
                workspaceId: "ws-1",
                postId: "p1",
                autorPerfilId: "perfil-2",
                corpo: XSS,
                arquivado: false,
                criadoEm: "2026-08-19T11:00:00Z",
              },
            ],
            lido: false,
          },
        ],
      }),
    );

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("AvisosDoPortal — o contador", () => {
  it("zero não desenha badge", () => {
    // `badgeValido` (apps.ts) já recusa 0, negativo e NaN — a tela usa
    // aquela função em vez de escrever `> 0` de novo, que seria uma segunda
    // opinião sobre a mesma pergunta.
    const html = renderPortal(meuFeed({ itens: [{ post: post(), comentarios: [], lido: true }] }));
    expect(textoDe(html)).not.toMatch(/\b0 (não lidos?|novos?)\b/i);
    expect(html).not.toContain('data-badge="0"');
  });

  it("um ou mais desenha o badge com o número", () => {
    const html = renderPortal(
      meuFeed({
        itens: [{ post: post(), comentarios: [], lido: false }],
        naoLidos: { total: 3, porEscopo: { feed: 2, broadcast: 1, dm: 0 } },
      }),
    );
    expect(html).toContain('data-badge="3"');
  });

  it("número quebrado não vira badge", () => {
    for (const total of [0, -1, Number.NaN]) {
      const html = renderPortal(
        meuFeed({
          itens: [{ post: post(), comentarios: [], lido: false }],
          naoLidos: { total, porEscopo: { feed: 0, broadcast: 0, dm: 0 } },
        }),
      );
      expect([total, html.includes("data-badge=")]).toEqual([total, false]);
    }
  });
});

describe("AvisosDoPortal — os estados", () => {
  it("quem não é mentorado não vê o card", () => {
    expect(renderPortal(meuFeed({ ehMentorado: false }))).toBe("");
  });

  it("sem conexão, o card também não aparece — o portal já avisa por ele", () => {
    // Dois avisos de erro na mesma tela dizendo a mesma coisa é ruído; o
    // estado desconectado do portal inteiro já cobre.
    expect(renderPortal(meuFeed({ conectado: false, motivo: "x" }))).toBe("");
  });

  it("mentorado sem aviso nenhum vê uma frase honesta", () => {
    expect(textoDe(renderPortal(meuFeed()))).toContain("Nenhum aviso por aqui ainda");
  });

  it("aviso não lido oferece o botão de marcar; lido não oferece de novo", () => {
    const naoLido = renderPortal(meuFeed({ itens: [{ post: post(), comentarios: [], lido: false }] }));
    const lido = renderPortal(meuFeed({ itens: [{ post: post(), comentarios: [], lido: true }] }));

    expect(naoLido).toContain('name="postId"');
    expect(lido).not.toContain('name="postId"');
  });
});

describe("as duas telas — zero emoji", () => {
  const permitidos = new Set(["▲", "▼", "▬", "—", "·", "•", "→"]);

  function achados(html: string): string[] {
    const fora: string[] = [];
    for (const ch of html) {
      if (permitidos.has(ch)) continue;
      if (/\p{Extended_Pictographic}/u.test(ch)) fora.push(ch);
    }
    return fora;
  }

  it("na gestão, vazia e cheia", () => {
    expect(achados(renderGestao(feedDoTime()))).toEqual([]);
    expect(
      achados(
        renderGestao(
          feedDoTime({
            posts: [
              { post: post({ escopo: "dm" }), destinatarios: [], comentarios: [] },
              { post: post({ id: "b", escopo: "broadcast", publicadoEm: null }), destinatarios: [], comentarios: [] },
            ],
          }),
        ),
      ),
    ).toEqual([]);
  });

  it("no portal, vazio e cheio", () => {
    expect(achados(renderPortal(meuFeed()))).toEqual([]);
    expect(
      achados(
        renderPortal(
          meuFeed({
            itens: [{ post: post(), comentarios: [], lido: false }],
            naoLidos: { total: 2, porEscopo: { feed: 1, broadcast: 1, dm: 0 } },
          }),
        ),
      ),
    ).toEqual([]);
  });
});
