// Testes de render de `ConteudosLiberados` — o bloco da ficha que libera e
// revoga material para UM mentorado.
//
// O QUE ESTA SUÍTE PROVA
// ----------------------
// 1) revogado SAI da lista principal e NÃO some da tela: a ficha da gestão
//    continua mostrando o que foi prometido um dia, marcado como revogado;
// 2) a contagem do título conta o ATIVO — contar tudo diria ao mentor que o
//    mentorado tem acesso a mais material do que tem;
// 3) endereço que não passa em `linkGravacaoValido` não vira `<a href>`;
// 4) o botão de revogar carrega o id daquele item, e não o de outro;
// 5) zero emoji.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ConteudoLiberado } from "@/lib/mentoria/tipos";

vi.mock("@/lib/mentoria/acoes-ficha", () => ({
  liberarConteudoDaFicha: vi.fn(),
  revogarConteudoDaFicha: vi.fn(),
}));

const { ConteudosLiberados } = await import("./liberados");

function conteudo(over: Partial<ConteudoLiberado> = {}): ConteudoLiberado {
  return {
    id: "cont-1",
    workspaceId: "ws-1",
    mentoradoId: "ment-1",
    titulo: "Aula 1 — fundamentos",
    url: "https://exemplo.com/aula-1",
    liberadoEm: "2026-08-01T10:00:00Z",
    arquivado: false,
    criadoEm: "2026-08-01T10:00:00Z",
    ...over,
  };
}

function render(conteudos: ConteudoLiberado[]): string {
  return renderToStaticMarkup(<ConteudosLiberados mentoradoId="ment-1" conteudos={conteudos} />);
}

function textoDe(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
}

describe("ConteudosLiberados", () => {
  it("lista vazia diz que não há nada, e ainda oferece o formulário", () => {
    const html = render([]);

    expect(textoDe(html)).toContain("Nenhum conteúdo liberado para este mentorado ainda");
    expect(textoDe(html)).toContain("Liberar conteúdo");
    expect(html).toContain('name="titulo"');
    expect(html).toContain('name="url"');
  });

  it("item ativo com endereço válido vira link clicável e seguro", () => {
    const html = render([conteudo()]);

    expect(html).toContain('href="https://exemplo.com/aula-1"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(textoDe(html)).toContain("Aula 1 — fundamentos");
    expect(textoDe(html)).toContain("liberado em");
  });

  it.each([
    ["javascript:alert(1)"],
    ["data:text/html,<script>alert(1)</script>"],
    ["exemplo.com/sem-esquema"],
    [""],
  ])("endereço %j não vira âncora, mas o título continua visível", (url) => {
    const html = render([conteudo({ url })]);

    expect(textoDe(html)).toContain("Aula 1 — fundamentos");
    expect(html).not.toContain(`href="${url}"`);
    expect(html.toLowerCase()).not.toContain("javascript:alert");
    expect(html).not.toContain("data:text/html");
  });

  it("revogado sai da lista principal, entra no bloco de revogados e não some", () => {
    const html = render([
      conteudo({ id: "ativo-1", titulo: "Material ativo" }),
      conteudo({ id: "revog-1", titulo: "Material revogado", arquivado: true }),
    ]);
    const texto = textoDe(html);

    // Continua na tela da gestão — "não é mais oferecido a ele" não é "nunca
    // aconteceu".
    expect(texto).toContain("Material revogado");
    expect(texto).toContain("1 revogado");
    // Mas não ganha botão de revogar de novo: só o ativo tem.
    const botoes = html.match(/Revogar/g) ?? [];
    expect(botoes).toHaveLength(1);
  });

  it("a contagem do título conta o ATIVO, nunca o total", () => {
    const html = render([
      conteudo({ id: "a1", arquivado: false }),
      conteudo({ id: "a2", arquivado: false }),
      conteudo({ id: "r1", arquivado: true }),
      conteudo({ id: "r2", arquivado: true }),
    ]);

    // Contar tudo diria ao mentor que a pessoa tem acesso a 4 materiais
    // quando ela tem acesso a 2.
    expect(textoDe(html)).toContain("Conteúdos liberados (2)");
    expect(textoDe(html)).not.toContain("Conteúdos liberados (4)");
  });

  it("o botão de revogar carrega o id daquele item", () => {
    const html = render([
      conteudo({ id: "cont-aaa", titulo: "Primeiro" }),
      conteudo({ id: "cont-bbb", titulo: "Segundo" }),
    ]);

    expect(html).toContain('name="conteudoId" value="cont-aaa"');
    expect(html).toContain('name="conteudoId" value="cont-bbb"');
    expect(html).toContain('name="mentoradoId" value="ment-1"');
  });

  it("data inválida não vira data inventada", () => {
    const html = render([conteudo({ liberadoEm: "ontem" })]);

    expect(textoDe(html)).toContain("Aula 1 — fundamentos");
    expect(textoDe(html)).not.toContain("liberado em ontem");
    expect(html).not.toContain("Invalid Date");
    expect(html).not.toContain("NaN");
  });

  it("zero emoji", () => {
    const html = render([conteudo(), conteudo({ id: "r", arquivado: true })]);
    const permitidos = new Set(["▲", "▼", "▬", "—", "·", "•", "→"]);
    const achados: string[] = [];
    for (const ch of html) {
      if (permitidos.has(ch)) continue;
      if (/\p{Extended_Pictographic}/u.test(ch)) achados.push(ch);
    }
    expect(achados).toEqual([]);
  });
});
