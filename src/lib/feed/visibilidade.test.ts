// Testes de `postsVisiveis` e `resumoNaoLidos`.
//
// O QUE ESTA SUÍTE PROVA
// ----------------------
// 1) MENSAGEM DIRETA SÓ CHEGA A QUEM ESTÁ ENDEREÇADO. Sem linha em
//    `post_destinatario`, não aparece; com linha de OUTRA pessoa, não aparece;
// 2) fail-closed em todas as bordas: escopo desconhecido, `mentoradoId` vazio,
//    data ausente, data futura, "agora" inválido — todos escondem, nunca
//    mostram. A lista vazia é a resposta segura; a lista inteira, a errada;
// 3) a contagem de não lidos não conta o mesmo post duas vezes, mesmo com dois
//    destinatários, e ignora arquivado.
//
// Este módulo é conveniência de tela, não a barreira — ver o cabeçalho de
// `visibilidade.ts`. Os testes existem para a tela não mentir, não para
// provar que o dado está protegido: quem protege é a RLS de 0022.

import { describe, expect, it } from "vitest";
import {
  escopoDePost,
  postsVisiveis,
  resumoNaoLidos,
  type Destinatario,
  type PostParaVisibilidade,
} from "./visibilidade";

const AGORA = "2026-08-20T12:00:00Z";
const EU = "ment-eu";
const OUTRO = "ment-outro";

function post(over: Partial<PostParaVisibilidade> = {}): PostParaVisibilidade {
  return {
    id: "p1",
    escopo: "feed",
    arquivado: false,
    publicadoEm: "2026-08-19T10:00:00Z",
    ...over,
  };
}

function dest(over: Partial<Destinatario> = {}): Destinatario {
  return { postId: "p1", mentoradoId: EU, lidoEm: null, ...over };
}

const ids = (lista: PostParaVisibilidade[]) => lista.map((p) => p.id);

describe("escopoDePost — fail-closed", () => {
  it("reconhece os três valores do enum do Postgres", () => {
    expect(escopoDePost("feed")).toBe("feed");
    expect(escopoDePost("broadcast")).toBe("broadcast");
    expect(escopoDePost("dm")).toBe("dm");
  });

  it("qualquer outra coisa vira null, e null nunca é visível", () => {
    for (const valor of ["", "FEED", " dm ", "publico", "todos", null, undefined, 42, ["dm"], {}]) {
      expect([valor, escopoDePost(valor)]).toEqual([valor, null]);
    }
  });
});

describe("postsVisiveis — feed e broadcast", () => {
  it("alcançam qualquer mentorado, sem precisar de destinatário", () => {
    const lista = postsVisiveis(
      [post({ id: "a", escopo: "feed" }), post({ id: "b", escopo: "broadcast" })],
      [],
      EU,
      AGORA,
    );
    expect(ids(lista)).toEqual(["a", "b"]);
  });

  it("preservam a ordem em que chegaram — quem ordena é a leitura", () => {
    const lista = postsVisiveis([post({ id: "b" }), post({ id: "a" })], [], EU, AGORA);
    expect(ids(lista)).toEqual(["b", "a"]);
  });

  it("não mutam a lista recebida", () => {
    const original = [post({ id: "a" }), post({ id: "b", arquivado: true })];
    const copia = [...original];
    postsVisiveis(original, [], EU, AGORA);
    expect(original).toEqual(copia);
  });
});

describe("postsVisiveis — mensagem direta", () => {
  it("sem linha em post_destinatario, NÃO aparece", () => {
    expect(postsVisiveis([post({ escopo: "dm" })], [], EU, AGORA)).toEqual([]);
  });

  it("com destinatário de OUTRO mentorado, NÃO aparece", () => {
    const lista = postsVisiveis([post({ escopo: "dm" })], [dest({ mentoradoId: OUTRO })], EU, AGORA);
    expect(lista).toEqual([]);
  });

  it("com destinatário de outro POST, NÃO aparece", () => {
    // O par tem que casar nos DOIS campos. Casar só o mentorado entregaria a
    // dm de um post para quem foi endereçado em outro.
    const lista = postsVisiveis([post({ id: "p1", escopo: "dm" })], [dest({ postId: "p2" })], EU, AGORA);
    expect(lista).toEqual([]);
  });

  it("com o destinatário certo, aparece", () => {
    const lista = postsVisiveis([post({ escopo: "dm" })], [dest()], EU, AGORA);
    expect(ids(lista)).toEqual(["p1"]);
  });

  it("uma dm no meio de posts públicos não vaza junto", () => {
    const lista = postsVisiveis(
      [
        post({ id: "publico", escopo: "feed" }),
        post({ id: "minha", escopo: "dm" }),
        post({ id: "alheia", escopo: "dm" }),
      ],
      [dest({ postId: "minha" }), dest({ postId: "alheia", mentoradoId: OUTRO })],
      EU,
      AGORA,
    );
    expect(ids(lista)).toEqual(["publico", "minha"]);
  });
});

describe("postsVisiveis — as bordas, todas fechadas", () => {
  it("escopo desconhecido não aparece, nem para quem tem destinatário", () => {
    const lista = postsVisiveis([post({ escopo: "interno" })], [dest()], EU, AGORA);
    expect(lista).toEqual([]);
  });

  it("arquivado não aparece", () => {
    expect(postsVisiveis([post({ arquivado: true })], [], EU, AGORA)).toEqual([]);
    expect(postsVisiveis([post({ escopo: "dm", arquivado: true })], [dest()], EU, AGORA)).toEqual([]);
  });

  it("rascunho (sem data de publicação) não aparece", () => {
    expect(postsVisiveis([post({ publicadoEm: null })], [], EU, AGORA)).toEqual([]);
    expect(postsVisiveis([post({ publicadoEm: "" })], [], EU, AGORA)).toEqual([]);
  });

  it("agendado para o futuro não aparece — e no instante exato, aparece", () => {
    expect(postsVisiveis([post({ publicadoEm: "2026-08-20T12:00:01Z" })], [], EU, AGORA)).toEqual([]);
    expect(ids(postsVisiveis([post({ publicadoEm: AGORA })], [], EU, AGORA))).toEqual(["p1"]);
  });

  it("data de publicação ilegível não aparece", () => {
    // Uma data que não dá para ler é uma data que não dá para comparar. Na
    // dúvida, esconde.
    expect(postsVisiveis([post({ publicadoEm: "ontem" })], [], EU, AGORA)).toEqual([]);
  });

  it("`agora` ilegível esconde TUDO, em vez de mostrar tudo", () => {
    // O erro tentador aqui é ignorar a comparação quando o relógio não veio.
    // Isso publicaria todo rascunho e todo agendamento de uma vez.
    for (const agora of ["", "amanhã", null, undefined, 42]) {
      expect([agora, postsVisiveis([post()], [], EU, agora as never)]).toEqual([agora, []]);
    }
  });

  it("mentoradoId vazio devolve lista VAZIA, nunca a lista inteira", () => {
    for (const quem of ["", "   ", null, undefined, 42, {}]) {
      expect([quem, postsVisiveis([post(), post({ id: "p2" })], [dest()], quem as never, AGORA)]).toEqual([
        quem,
        [],
      ]);
    }
  });

  it("entrada que não é lista não quebra e não mostra nada", () => {
    expect(postsVisiveis(null as never, [], EU, AGORA)).toEqual([]);
    expect(postsVisiveis([post()], null as never, EU, AGORA)).toEqual([]);
  });

  it("a assinatura tem quatro parâmetros obrigatórios, e o quarto é o relógio", () => {
    // `Function.length` não conta parâmetro com valor padrão. Deixar `agora`
    // opcional seria o mesmo que deixar o módulo perguntar as horas sozinho
    // — e um módulo puro que lê o relógio não é testável nem reproduzível.
    expect(postsVisiveis.length).toBe(4);
  });
});

describe("resumoNaoLidos", () => {
  it("conta só o que tem destinatário SEU e ainda não foi lido", () => {
    const resumo = resumoNaoLidos(
      [post({ id: "a", escopo: "broadcast" }), post({ id: "b", escopo: "dm" })],
      [dest({ postId: "a" }), dest({ postId: "b" })],
      EU,
      AGORA,
    );
    expect(resumo.total).toBe(2);
    expect(resumo.porEscopo).toEqual({ feed: 0, broadcast: 1, dm: 1 });
  });

  it("lido não conta", () => {
    const resumo = resumoNaoLidos(
      [post({ id: "a" })],
      [dest({ postId: "a", lidoEm: "2026-08-19T23:00:00Z" })],
      EU,
      AGORA,
    );
    expect(resumo.total).toBe(0);
  });

  it("post sem destinatário nenhum não conta — não há como marcar como lido", () => {
    // Contar aqui deixaria o badge aceso para sempre: sem linha em
    // `post_destinatario`, não existe onde gravar a leitura.
    const resumo = resumoNaoLidos([post({ id: "a", escopo: "feed" })], [], EU, AGORA);
    expect(resumo.total).toBe(0);
  });

  it("o mesmo post com DOIS destinatários conta uma vez só", () => {
    const resumo = resumoNaoLidos(
      [post({ id: "a" })],
      [dest({ postId: "a" }), dest({ postId: "a", mentoradoId: OUTRO })],
      EU,
      AGORA,
    );
    expect(resumo.total).toBe(1);
  });

  it("nem duas linhas do MESMO mentorado no mesmo post contam duas vezes", () => {
    // O banco tem `unique (post_id, mentorado_id)`; isto é a rede para o dado
    // que chegar de outro caminho.
    const resumo = resumoNaoLidos([post({ id: "a" })], [dest({ postId: "a" }), dest({ postId: "a" })], EU, AGORA);
    expect(resumo.total).toBe(1);
  });

  it("ignora arquivado, rascunho, agendado e dm alheia", () => {
    const resumo = resumoNaoLidos(
      [
        post({ id: "arquivado", arquivado: true }),
        post({ id: "rascunho", publicadoEm: null }),
        post({ id: "agendado", publicadoEm: "2026-09-01T10:00:00Z" }),
        post({ id: "alheia", escopo: "dm" }),
        post({ id: "vale" }),
      ],
      [
        dest({ postId: "arquivado" }),
        dest({ postId: "rascunho" }),
        dest({ postId: "agendado" }),
        dest({ postId: "alheia", mentoradoId: OUTRO }),
        dest({ postId: "vale" }),
      ],
      EU,
      AGORA,
    );
    expect(resumo.total).toBe(1);
    expect(resumo.porEscopo.feed).toBe(1);
  });

  it("destinatário de OUTRA pessoa num post público não conta para mim", () => {
    // A armadilha: o post é de feed, então ele É visível para mim. O que não
    // é meu é a linha de leitura. Sem o filtro por mentorado, o badge de uma
    // pessoa acenderia com o não-lido da outra.
    const resumo = resumoNaoLidos(
      [post({ id: "a", escopo: "feed" })],
      [dest({ postId: "a", mentoradoId: OUTRO })],
      EU,
      AGORA,
    );
    expect(resumo.total).toBe(0);
  });

  it("o que o OUTRO já leu não apaga o meu não-lido", () => {
    const resumo = resumoNaoLidos(
      [post({ id: "a", escopo: "feed" })],
      [dest({ postId: "a", mentoradoId: OUTRO, lidoEm: "2026-08-19T23:00:00Z" }), dest({ postId: "a" })],
      EU,
      AGORA,
    );
    expect(resumo.total).toBe(1);
  });

  it("destinatário órfão (post que não veio na lista) não conta", () => {
    // Contar um post que a leitura não trouxe é acender um badge que não
    // leva a lugar nenhum quando a pessoa clica.
    const resumo = resumoNaoLidos([post({ id: "a" })], [dest({ postId: "fantasma" })], EU, AGORA);
    expect(resumo.total).toBe(0);
  });

  it("mentoradoId vazio conta zero", () => {
    const resumo = resumoNaoLidos([post({ id: "a" })], [dest({ postId: "a" })], "", AGORA);
    expect(resumo.total).toBe(0);
    expect(resumo.porEscopo).toEqual({ feed: 0, broadcast: 0, dm: 0 });
  });
});
