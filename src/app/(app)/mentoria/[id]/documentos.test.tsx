// Testes de render de `DocumentosDoMentorado` — o bloco de arquivos da ficha.
//
// O QUE ESTA SUÍTE PROVA (Tarefa 12 da Fase 2, "documentos na ficha")
// -------------------------------------------------------------------
// 1) PUBLICAR É ATO EXPLÍCITO. O interruptor "visível no portal" do
//    formulário de anexo NASCE DESMARCADO — é a mesma escolha do default
//    `false` da coluna em 0015, repetida na tela. Se ele nascesse marcado,
//    todo contrato em rascunho e toda anamnese com anotação do mentor
//    apareceriam no portal no instante do upload, e liberar viraria a decisão
//    de ESCONDER (o inverso do combinado);
// 2) O AVISO DIZ QUEM PASSA A VER. Ao lado do interruptor existe uma frase
//    que nomeia o `mentorado` desta ficha — um interruptor cujo efeito não
//    está escrito é um interruptor que alguém liga sem saber o que publicou;
// 3) ARQUIVADO SAI DA LISTA PADRÃO, MAS NÃO SOME DA TELA. A regra da casa é
//    "status muda, linha fica": o arquivado não é listado, e mesmo assim a
//    tela CONTA quantos existem. Sumir em silêncio seria apagar aos olhos de
//    quem lê;
// 4) LISTA VAZIA É FRASE, NÃO TABELA VAZIA. Sem arquivo, a tela escreve o que
//    sabe — nunca um cabeçalho de tabela sem nenhuma linha embaixo, que
//    parece dado carregando e não é;
// 5) `caminho_storage` NUNCA VAI PARA A MARCAÇÃO. É o caminho interno do
//    objeto no bucket (`<workspace_id>/<categoria>/<arquivo>`): não interessa
//    a quem lê a ficha, desenha a organização do Storage e carrega o
//    `workspace_id` do inquilino de graça em cada linha da lista;
// 6) leitura que falhou não vira "não há arquivo" (as duas frases são
//    diferentes, e confundi-las é afirmar ausência a partir de um erro);
// 7) zero emoji, e nenhum glifo de enfeite fora dos três que a casa permite.
//
// MÉTODO: `DocumentosDoMentorado` é função sync pura (recebe a
// `ListaDocumentos` já resolvida por `lerDocumentosDoMentorado`) — dá para
// chamar direto com `renderToStaticMarkup`. As asserções leem a MARCAÇÃO, e
// não uma função exportada, pelo mesmo motivo escrito em `visao.test.tsx`: é
// o que a pessoa vê, e morre se algum passo posterior da tela desfizer.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Documento, ListaDocumentos } from "@/lib/documentos/dados";

// O componente só REFERENCIA as três Server Actions como `action={...}` de
// formulário — nunca chama. Ainda assim o módulo real importa
// `next/cache`/`next/navigation`, que não resolvem fora do Next (mesma tática
// de `visao.test.tsx`).
vi.mock("@/lib/documentos/acoes", () => ({
  anexarDocumento: vi.fn(),
  arquivarDocumento: vi.fn(),
  alternarVisivelPortal: vi.fn(),
}));

const { DocumentosDoMentorado } = await import("./documentos");

// ============================================================
// Fábricas
// ============================================================

function documento(over: Partial<Documento> = {}): Documento {
  return {
    id: "doc-1",
    workspaceId: "ws-1",
    mentoradoId: "ment-1",
    alunoId: null,
    titulo: "Contrato assinado.pdf",
    // O caminho real tem a forma que o 0015 exige (`<workspace_id>/…`) — é
    // exatamente esta string que o bloco 5 procura na marcação.
    caminhoStorage: "ws-1/contrato/contrato-assinado.pdf",
    mime: "application/pdf",
    bytes: 204800,
    categoria: "contrato",
    visivelPortal: false,
    enviadoPor: "perfil-1",
    criadoEm: "2026-08-10T13:00:00Z",
    arquivado: false,
    ...over,
  };
}

function lista(over: Partial<ListaDocumentos> = {}): ListaDocumentos {
  return { conectado: true, motivo: "", documentos: [], ...over };
}

function render(l: ListaDocumentos = lista()): string {
  return renderToStaticMarkup(<DocumentosDoMentorado mentoradoId="ment-1" lista={l} />);
}

// ============================================================
// Leitores da marcação
// ============================================================

/** A tag `<input>` inteira do interruptor de publicação do formulário de anexo. */
function tagDoInterruptor(html: string): string {
  const achado = /<input[^>]*name="visivelPortal"[^>]*>/.exec(html);
  expect(achado, "o formulário de anexo não desenhou o interruptor 'visível no portal'").not.toBeNull();
  return achado![0];
}

/** O texto que a pessoa lê, sem as tags — para conferir FRASE, e não fragmento. */
function textoDe(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

// Mesma varredura de `visao.test.tsx`: "glifo" aqui é pictograma (emoji) e
// forma geométrica/dingbat usada como enfeite. Pontuação tipográfica que o
// repositório já usa como TEXTO (— travessão, · ponto médio) fica de fora.
const GLIFOS_PERMITIDOS = new Set(["▲", "▼", "▬"]);

function glifosForaDoPermitido(html: string): string[] {
  const achados = new Set<string>();
  for (const char of html) {
    if (GLIFOS_PERMITIDOS.has(char)) continue;
    const enfeite = /[←-⇿─-➿⬀-⯿]/.test(char) || /\p{Extended_Pictographic}/u.test(char);
    if (enfeite) achados.add(char);
  }
  return [...achados];
}

// ============================================================
// 1. O interruptor de publicação nasce desligado
// ============================================================

describe("formulário de anexo — publicar é ato explícito", () => {
  it("deixa o React definir o multipart da Server Action sem encType manual", () => {
    const html = render();

    expect(html).not.toContain('encType="multipart/form-data"');
    expect(html).not.toContain('enctype="multipart/form-data"');
    expect(html).toContain('name="arquivo"');
  });

  it("o interruptor 'visível no portal' nasce DESMARCADO", () => {
    const html = render();
    const tag = tagDoInterruptor(html);

    expect(tag).toContain('type="checkbox"');
    // `checked` ausente da tag — e não "checked=false", que o React nem
    // imprime. Qualquer forma de vir marcado (checked, defaultChecked)
    // aparece aqui como o atributo presente na marcação final.
    expect(tag).not.toContain("checked");
  });

  it("o interruptor continua desmarcado mesmo com a ficha já cheia de arquivos publicados", () => {
    // A rede do teste acima: um formulário que copiasse o estado da lista
    // (por exemplo, "já tem publicado, então marca") nasceria ligado aqui.
    const html = render(
      lista({
        documentos: [
          documento({ id: "doc-1", visivelPortal: true }),
          documento({ id: "doc-2", titulo: "Material da aula 3.pdf", categoria: "material", visivelPortal: true }),
        ],
      })
    );

    expect(tagDoInterruptor(html)).not.toContain("checked");
  });
});

// ============================================================
// 2. O aviso ao lado do interruptor diz quem passa a ver
// ============================================================

describe("formulário de anexo — o aviso ao lado do interruptor", () => {
  it("existe, cita o mentorado e diz o que acontece se for ligado", () => {
    const texto = textoDe(render());

    // A palavra que a tarefa exige: quem passa a ver o arquivo é o MENTORADO
    // desta ficha — nem "o cliente", nem "o usuário", nem "todo mundo".
    expect(texto).toContain("mentorado");
    // E a frase inteira, não um pedaço: cada parte dela é uma afirmação
    // diferente sobre o efeito de ligar o interruptor.
    expect(texto).toContain(
      "Ligado, o arquivo passa a aparecer no portal do mentorado desta ficha — só dele, mais ninguém." +
        " Desligado, ele fica visível apenas para a gestão."
    );
  });

  it("o aviso está no mesmo campo do interruptor, e não perdido no rodapé do card", () => {
    // Aviso que mora longe do interruptor não avisa: quem clica não lê. O
    // teste confere a VIZINHANÇA — a frase começa dentro dos 400 caracteres
    // seguintes à tag do checkbox.
    const html = render();
    const posicaoInterruptor = html.indexOf('name="visivelPortal"');
    const posicaoAviso = html.indexOf("Ligado, o arquivo passa a aparecer no portal do mentorado");

    expect(posicaoAviso, "o aviso não foi escrito").toBeGreaterThan(-1);
    expect(posicaoAviso - posicaoInterruptor).toBeGreaterThan(0);
    expect(posicaoAviso - posicaoInterruptor).toBeLessThan(400);
  });
});

// ============================================================
// 3. Arquivado sai da lista padrão — e não some em silêncio
// ============================================================

describe("lista — documento arquivado", () => {
  it("não aparece na lista padrão", () => {
    const html = render(
      lista({
        documentos: [
          documento({ id: "doc-1", titulo: "Anamnese inicial.pdf", categoria: "anamnese" }),
          documento({ id: "doc-2", titulo: "Proposta recusada.pdf", arquivado: true }),
        ],
      })
    );

    expect(html).toContain("Anamnese inicial.pdf");
    expect(html).not.toContain("Proposta recusada.pdf");
  });

  it("mas a tela CONTA quantos existem — status muda, linha fica", () => {
    const html = render(
      lista({
        documentos: [
          documento({ id: "doc-1", titulo: "Anamnese inicial.pdf" }),
          documento({ id: "doc-2", titulo: "Proposta recusada.pdf", arquivado: true }),
          documento({ id: "doc-3", titulo: "Contrato antigo.pdf", arquivado: true }),
        ],
      })
    );

    // O número é CONTADO da lista recebida, nunca estimado: dois arquivados.
    expect(textoDe(html)).toContain("2 arquivos arquivados não estão nesta lista.");
  });

  it("sem nenhum arquivado, a frase de contagem NÃO aparece", () => {
    // Um aviso que aparece sempre não avisa nada — e "0 arquivos arquivados"
    // seria zero desenhado com cara de dado.
    const html = render(lista({ documentos: [documento()] }));

    expect(html).not.toContain("arquivados não estão nesta lista");
    expect(html).not.toContain(">0<");
  });

  it("com TODOS arquivados, a tela diz que a lista está vazia e conta os que saíram", () => {
    // O caso que mais engana: a lista tem linhas, e mesmo assim não há nada a
    // mostrar. Sem esta distinção, a tela desenharia uma tabela sem corpo.
    const html = render(lista({ documentos: [documento({ arquivado: true })] }));
    const texto = textoDe(html);

    expect(texto).toContain("Nenhum arquivo anexado a este mentorado ainda.");
    expect(texto).toContain("1 arquivo arquivado não está nesta lista.");
    expect(html).not.toContain("<table");
  });
});

// ============================================================
// 4. Lista vazia é frase honesta, não tabela de cabeçalho sem linha
// ============================================================

describe("lista vazia", () => {
  it("mostra a frase honesta dentro do bloco de vazio, e nenhuma tabela", () => {
    const html = render(lista({ documentos: [] }));

    // `Vazio` (src/components/ui.tsx) é o bloco tracejado da casa — é ele que
    // diz "isto está vazio de propósito", e não uma linha de tabela em branco.
    expect(html).toContain("border-dashed");
    expect(textoDe(html)).toContain(
      "Nenhum arquivo anexado a este mentorado ainda. Use o formulário abaixo para anexar o primeiro."
    );
    // Nenhum cabeçalho de tabela sem corpo: uma `<table>` com `<th>` e nenhum
    // `<td>` parece carregamento eterno para quem olha.
    expect(html).not.toContain("<table");
    expect(html).not.toContain("<th");
  });

  it("com arquivo, a tabela existe de verdade — o teste acima não passa por a tela estar quebrada", () => {
    const html = render(lista({ documentos: [documento()] }));

    expect(html).toContain("<table");
    expect(html).toContain("Contrato assinado.pdf");
    expect(html).not.toContain("Nenhum arquivo anexado");
  });
});

// ============================================================
// 5. `caminho_storage` nunca chega à marcação
// ============================================================

describe("lista — o caminho interno do objeto no bucket não vai para a tela", () => {
  it("nem o caminho inteiro, nem o `workspace_id` que ele carrega no primeiro segmento", () => {
    const doc = documento({ caminhoStorage: "ws-1/contrato/9f-contrato-assinado.pdf" });
    const html = render(lista({ documentos: [doc] }));

    expect(html).not.toContain(doc.caminhoStorage);
    // O caminho começa pelo `workspace_id` (constraint
    // `documento_caminho_no_workspace`, 0015): imprimi-lo entregaria o id do
    // inquilino em cada linha da lista, de graça.
    expect(html).not.toContain("ws-1/");
    // E nem em pedaços: o nome do objeto dentro do bucket também é interno —
    // o que a pessoa lê é o TÍTULO, que ela mesma escreveu.
    expect(html).not.toContain("9f-contrato-assinado.pdf");
    expect(html).toContain("Contrato assinado.pdf");
  });

  it("o `documentoId` das ações continua na marcação — ele é o que a Server Action precisa", () => {
    // A rede do teste acima: uma tela que escondesse TUDO não teria como
    // arquivar nem publicar. O id da linha é referência, não caminho de
    // arquivo — e sem ele os dois formulários não funcionam.
    const html = render(lista({ documentos: [documento({ id: "doc-9" })] }));

    expect(html).toContain('name="documentoId"');
    expect(html).toContain('value="doc-9"');
  });
});

// ============================================================
// 6. Leitura que falhou não vira "não há arquivo"
// ============================================================

describe("bloco de documentos — falha de leitura e lista vazia são telas diferentes", () => {
  it("`conectado: false` mostra o motivo e NUNCA 'nenhum arquivo anexado'", () => {
    const html = render(
      lista({ conectado: false, motivo: "Não foi possível carregar os arquivos anexados agora." })
    );

    expect(html).toContain("Não foi possível carregar os arquivos anexados agora.");
    expect(html).not.toContain("Nenhum arquivo anexado");
    // E nem o formulário de anexo: sem banco lido, o upload iria para o vazio
    // e o erro só apareceria depois de a pessoa escolher o arquivo.
    expect(html).not.toContain('name="visivelPortal"');
  });
});

// ============================================================
// 7. Zero emoji, nenhum glifo de enfeite novo
// ============================================================

describe("bloco de documentos — zero emoji e nenhum glifo fora dos três permitidos", () => {
  it("com lista cheia, formulário e contagem de arquivados, nada de pictograma", () => {
    const html = render(
      lista({
        documentos: [
          documento({ id: "doc-1", categoria: "contrato" }),
          documento({ id: "doc-2", titulo: "Anamnese.pdf", categoria: "anamnese", bytes: null, visivelPortal: true }),
          documento({ id: "doc-3", titulo: "Aula 3.pdf", categoria: "material", arquivado: true }),
        ],
      })
    );

    expect(glifosForaDoPermitido(html)).toEqual([]);
  });
});

// ============================================================
// 8. Tamanho desconhecido é dito, nunca virado zero
// ============================================================

describe("lista — tamanho do arquivo", () => {
  it("`bytes: null` vira frase, e nunca '0 KB'", () => {
    // `bytesDe` (documentos/dados.ts) devolve `null` de propósito quando não
    // dá para afirmar o tamanho. A tela não pode desfazer isso com um zero.
    const html = render(lista({ documentos: [documento({ bytes: null })] }));
    const texto = textoDe(html);

    expect(texto).toContain("tamanho não registrado");
    expect(texto).not.toContain("0 KB");
    expect(texto).not.toContain("0 B");
  });

  it("com `bytes`, o tamanho aparece medido — o teste acima não passa por a coluna não existir", () => {
    const html = render(lista({ documentos: [documento({ bytes: 204800 })] }));

    expect(textoDe(html)).toContain("200 KB");
  });
});
