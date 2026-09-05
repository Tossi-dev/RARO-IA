import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ListaTrilhas, Trilha, TrilhaAula } from "@/lib/conteudo/dados-trilha";

vi.mock("@/lib/conteudo/acoes-gestao-trilha", () => ({ salvarTrilhaDaGestao: vi.fn() }));

const { TrilhasVisao } = await import("./visao");

function trilha(id: string, nome: string, ativa = true): Trilha {
  return { id, workspaceId: "ws", nome, descricao: `${nome} em desenvolvimento`, programaId: null, ativa, criadoEm: "2026-09-01T12:00:00Z" };
}

function aula(trilhaId: string, id: string): TrilhaAula {
  return { id, workspaceId: "ws", trilhaId, ordem: 1, titulo: `Aula ${id}`, tipo: "texto", urlVideo: "", texto: "", duracaoMin: 10, liberaEmDias: 0, criadoEm: "2026-09-01T12:00:00Z" };
}

const lista: ListaTrilhas = {
  conectado: true,
  motivo: "",
  parcial: false,
  trilhas: [
    { trilha: trilha("t1", "Liderança consciente"), aulas: [aula("t1", "a1"), aula("t1", "a2")] },
    { trilha: trilha("t2", "Equilíbrio e propósito", false), aulas: [aula("t2", "a3")] },
  ],
};

describe("TrilhasVisao — referência visual aprovada", () => {
  it("estrutura a página com cabeçalho, indicadores factuais, lista principal e orientação lateral", () => {
    const html = renderToStaticMarkup(<TrilhasVisao lista={lista} />);

    expect(html).toContain('data-trilhas-visual="referencia-aprovada"');
    expect(html).toContain("Jornadas e trilhas");
    expect(html).toContain("Trilhas de desenvolvimento");
    expect(html).toContain("Como funciona");
    expect(html).toContain("O mentor faz perguntas; o cliente constrói o próprio caminho.");
    expect(html).toContain('href="#nova-trilha"');
  });

  it("calcula somente indicadores suportados pelos dados recebidos", () => {
    const html = renderToStaticMarkup(<TrilhasVisao lista={lista} />);

    expect(html).toContain("Trilhas cadastradas");
    expect(html).toContain("Trilhas ativas");
    expect(html).toContain("Aulas planejadas");
    expect(html).toContain("Trilhas inativas");
    expect(html).not.toContain("Mentorados em jornada");
    expect(html).not.toContain("Conclusão média");
    expect(html).not.toContain("Ações em atraso");
  });

  it("mantém cada trilha navegável, com quantidade real de aulas e situação", () => {
    const html = renderToStaticMarkup(<TrilhasVisao lista={lista} />);

    expect(html).toContain('href="/trilhas/t1"');
    expect(html).toContain('href="/trilhas/t2"');
    expect(html).toContain("2 aulas");
    expect(html).toContain("1 aula");
    expect(html).toContain("Ativa");
    expect(html).toContain("Inativa");
  });

  it("falha fechado quando a leitura das aulas é parcial", () => {
    const html = renderToStaticMarkup(
      <TrilhasVisao lista={{ ...lista, parcial: true, motivo: "Não foi possível carregar as aulas.", trilhas: lista.trilhas.map(({ trilha }) => ({ trilha, aulas: [] })) }} />,
    );

    expect(html).toContain("Aulas indisponíveis");
    expect(html).not.toContain("0 aulas");
    expect(html).not.toContain("Adicionar a primeira aula");
    expect(html).toContain("Revisar trilha inativa");
  });

  it("aplica busca e situação sem esconder a existência dos filtros", () => {
    const html = renderToStaticMarkup(<TrilhasVisao lista={lista} busca="equilíbrio" situacao="inativas" />);

    expect(html).toContain("Equilíbrio e propósito");
    expect(html).not.toContain("Liderança consciente em desenvolvimento");
    expect(html).toContain('name="q"');
    expect(html).toContain('name="situacao"');
  });

  it("o CTA aponta para um formulário já aberto", () => {
    const html = renderToStaticMarkup(<TrilhasVisao lista={lista} />);

    expect(html).toContain('href="#nova-trilha"');
    expect(html).toMatch(/<details[^>]*id="nova-trilha"[^>]*open/);
    expect(html).toContain('name="nome"');
  });
});
