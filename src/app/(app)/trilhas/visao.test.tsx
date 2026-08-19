// Testes de render das duas telas de gestão de trilhas: a lista (`TrilhasVisao`)
// e o editor de uma trilha (`TrilhaVisao`).
//
// O QUE ESTA SUÍTE PROVA
// ----------------------
// 1) os estados que NÃO são "deu tudo certo" aparecem como frase humana, e
//    não como tabela vazia fingindo que o banco está vazio — a mesma regra
//    que /mentoria e /portal já seguem;
// 2) o aviso sobre vídeo "não listado" existe, é literal e diz a consequência
//    prática (quem tiver o link assiste, matriculado ou não). O mentor está
//    prestes a subir aula paga para o YouTube: a frase é a diferença entre
//    ele escolher a opção certa e descobrir depois;
// 3) endereço que não é do YouTube NÃO vira `<iframe>` — a tela nunca embute
//    página de terceiro escolhida por texto digitado;
// 4) a ordem das aulas na tela é a de `ordem`, com empate estável;
// 5) zero emoji.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ListaTrilhas, Trilha, TrilhaAula } from "@/lib/conteudo/dados-trilha";

vi.mock("@/lib/conteudo/acoes-gestao-trilha", () => ({
  salvarTrilhaDaGestao: vi.fn(),
  salvarAulaDaGestao: vi.fn(),
  matricularNaTrilhaDaGestao: vi.fn(),
}));

const { TrilhasVisao } = await import("./visao");
const { TrilhaVisao } = await import("./[id]/visao");

const ID_TRILHA = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const VIDEO = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

function trilha(over: Partial<Trilha> = {}): Trilha {
  return {
    id: ID_TRILHA,
    workspaceId: "ws-1",
    nome: "Fundamentos do negócio",
    descricao: "A base para quem está começando",
    programaId: null,
    ativa: true,
    criadoEm: "2026-08-01T10:00:00Z",
    ...over,
  };
}

function aula(over: Partial<TrilhaAula> = {}): TrilhaAula {
  return {
    id: "aula-1",
    workspaceId: "ws-1",
    trilhaId: ID_TRILHA,
    ordem: 1,
    titulo: "Aula 1",
    tipo: "video",
    urlVideo: VIDEO,
    texto: "",
    duracaoMin: 12,
    liberaEmDias: 0,
    criadoEm: "2026-08-01T10:00:00Z",
    ...over,
  };
}

function lista(over: Partial<ListaTrilhas> = {}): ListaTrilhas {
  return { conectado: true, motivo: "", parcial: false, trilhas: [], ...over };
}

function renderLista(l: ListaTrilhas, erro = ""): string {
  return renderToStaticMarkup(<TrilhasVisao lista={l} erro={erro} />);
}

function renderEditor(
  args: { trilha?: Trilha | null; aulas?: TrilhaAula[]; conectado?: boolean; motivo?: string; erro?: string } = {},
): string {
  return renderToStaticMarkup(
    <TrilhaVisao
      conectado={args.conectado ?? true}
      motivo={args.motivo ?? ""}
      trilha={args.trilha === undefined ? trilha() : args.trilha}
      aulas={args.aulas ?? []}
      erro={args.erro ?? ""}
    />,
  );
}

function textoDe(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

describe("TrilhasVisao — os estados da lista", () => {
  it("sem conexão, mostra o motivo e nenhuma tabela", () => {
    const html = renderLista(lista({ conectado: false, motivo: "Nenhuma conexão com o banco de dados configurada." }));

    expect(textoDe(html)).toContain("Nenhuma conexão com o banco de dados configurada");
    expect(html).not.toContain("<table");
    // Nem o formulário: oferecer "criar trilha" sem banco é prometer o que
    // não vai acontecer.
    expect(html).not.toContain('name="nome"');
  });

  it("conectado e sem trilha nenhuma, diz isso com uma frase — não com uma tabela de zero linhas", () => {
    const html = renderLista(lista());

    expect(textoDe(html)).toContain("Nenhuma trilha criada ainda");
    expect(html).not.toContain("<table");
    // O formulário APARECE: aqui o vazio é um convite, não um defeito.
    expect(html).toContain('name="nome"');
  });

  it("leitura parcial é DITA, e a lista continua de pé", () => {
    const html = renderLista(
      lista({ parcial: true, motivo: "As trilhas foram lidas, mas não foi possível carregar as aulas.", trilhas: [{ trilha: trilha(), aulas: [] }] }),
    );

    expect(textoDe(html)).toContain("não foi possível carregar as aulas");
    expect(textoDe(html)).toContain("Fundamentos do negócio");
  });

  it("cada trilha vira um link para o próprio editor, e a contagem de aulas é a de verdade", () => {
    const html = renderLista(lista({ trilhas: [{ trilha: trilha(), aulas: [aula(), aula({ id: "a2", ordem: 2 })] }] }));

    expect(html).toContain(`href="/trilhas/${ID_TRILHA}"`);
    expect(textoDe(html)).toContain("2");
  });

  it("erro vindo de ?erro= aparece na tela", () => {
    const html = renderLista(lista(), "Escreva um nome para a trilha.");
    expect(textoDe(html)).toContain("Escreva um nome para a trilha");
  });
});

describe("TrilhaVisao — o editor de uma trilha", () => {
  it("trilha que não existe: diz que não encontrou, sem contar quantas existem", () => {
    const html = renderEditor({ trilha: null });
    const t = textoDe(html);

    expect(t).toContain("Não encontrei esta trilha");
    expect(t).not.toMatch(/\d+ trilhas?/);
    expect(html).not.toContain('name="titulo"');
  });

  it("sem conexão, mostra o motivo e não oferece formulário", () => {
    const html = renderEditor({ conectado: false, motivo: "Não foi possível carregar as trilhas agora." });

    expect(textoDe(html)).toContain("Não foi possível carregar as trilhas agora");
    expect(html).not.toContain('name="titulo"');
  });

  it("trilha sem aula mostra o vazio com frase honesta, e o formulário de criar aula", () => {
    const html = renderEditor({ aulas: [] });

    expect(textoDe(html)).toContain("Nenhuma aula nesta trilha ainda");
    expect(html).toContain('name="titulo"');
    expect(html).toContain(`value="${ID_TRILHA}"`);
  });

  it("as aulas saem na ordem de `ordem`, e o empate é resolvido pelo título", () => {
    const html = renderEditor({
      aulas: [
        aula({ id: "c", ordem: 2, titulo: "Zebra" }),
        aula({ id: "a", ordem: 1, titulo: "Bacia" }),
        aula({ id: "b", ordem: 1, titulo: "Arara" }),
      ],
    });
    const t = textoDe(html);

    expect(t.indexOf("Arara")).toBeLessThan(t.indexOf("Bacia"));
    expect(t.indexOf("Bacia")).toBeLessThan(t.indexOf("Zebra"));
  });

  it("dias de liberação viram frase, não número solto", () => {
    const html = renderEditor({
      aulas: [aula({ id: "a", liberaEmDias: 0 }), aula({ id: "b", ordem: 2, liberaEmDias: 7 })],
    });
    const t = textoDe(html);

    expect(t).toContain("Abre junto com a trilha");
    expect(t).toContain("Abre 7 dias depois do início");
  });
});

describe("TrilhaVisao — o vídeo", () => {
  it("o aviso sobre 'não listado' existe, é literal e diz a consequência", () => {
    const html = renderEditor();
    const t = textoDe(html);

    expect(t).toContain("não listado");
    // A consequência prática, sem eufemismo: "não listado" não é privado.
    expect(t).toContain("Quem tiver o link assiste, mesmo sem estar matriculado");
  });

  it("endereço do YouTube vira iframe, no domínio sem cookie", () => {
    const html = renderEditor({ aulas: [aula()] });

    expect(html).toContain("<iframe");
    expect(html).toContain("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  });

  it("endereço que NÃO é do YouTube nunca vira iframe", () => {
    for (const url of [
      "https://exemplo.com/video.mp4",
      "https://youtube.com.exemplo.com/watch?v=dQw4w9WgXcQ",
      "javascript:alert(1)",
      "https://vimeo.com/123456",
    ]) {
      const html = renderEditor({ aulas: [aula({ urlVideo: url })] });
      expect([url, html.includes("<iframe")]).toEqual([url, false]);
      // O endereço recusado continua VISÍVEL como texto (é o que a gestão
      // precisa conferir), mas nunca em um atributo que navega: nada de
      // `src="javascript:…"` nem `href="javascript:…"`. É essa a diferença
      // entre mostrar o que está gravado e executar o que está gravado.
      expect([url, /(?:src|href)="javascript:/i.test(html)]).toEqual([url, false]);
    }
  });

  it("endereço recusado ainda é MOSTRADO como texto — a gestão precisa ver o que está gravado", () => {
    // Sumir com o campo esconderia de quem opera um endereço que o mentorado
    // talvez esteja recebendo. Aparece, e aparece dizendo que não foi
    // reconhecido.
    const html = renderEditor({ aulas: [aula({ urlVideo: "https://vimeo.com/123456" })] });
    const t = textoDe(html);

    expect(t).toContain("https://vimeo.com/123456");
    expect(t).toContain("Não reconheci como vídeo do YouTube");
  });

  it("aula de texto não desenha iframe nem promete vídeo", () => {
    const html = renderEditor({ aulas: [aula({ tipo: "texto", urlVideo: "", texto: "Leia isto" })] });

    expect(html).not.toContain("<iframe");
  });
});

describe("as duas telas — zero emoji", () => {
  const permitidos = new Set(["▲", "▼", "▬", "—", "·", "•", "→"]);

  function semEmoji(html: string): string[] {
    const achados: string[] = [];
    for (const ch of html) {
      if (permitidos.has(ch)) continue;
      if (/\p{Extended_Pictographic}/u.test(ch)) achados.push(ch);
    }
    return achados;
  }

  it("na lista, nos três estados", () => {
    expect(semEmoji(renderLista(lista({ conectado: false, motivo: "x" })))).toEqual([]);
    expect(semEmoji(renderLista(lista()))).toEqual([]);
    expect(semEmoji(renderLista(lista({ trilhas: [{ trilha: trilha(), aulas: [aula()] }] })))).toEqual([]);
  });

  it("no editor, com aula de vídeo, aula de texto e endereço recusado", () => {
    const html = renderEditor({
      aulas: [aula(), aula({ id: "b", ordem: 2, tipo: "texto", urlVideo: "" }), aula({ id: "c", ordem: 3, urlVideo: "https://vimeo.com/1" })],
    });
    expect(semEmoji(html)).toEqual([]);
  });
});
