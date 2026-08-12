// Testes do catálogo de apps da tela inicial — vitest.

import { describe, expect, it } from "vitest";
import {
  acharAppPorRota,
  badgeValido,
  CATALOGO_APPS,
  contarAppsComBadge,
  ordenarApps,
  type AppCatalogo,
} from "./apps";

describe("CATALOGO_APPS — não inventa rota", () => {
  it("todo href de app e de sub-app começa com barra", () => {
    for (const app of CATALOGO_APPS) {
      expect(app.href.startsWith("/")).toBe(true);
      for (const sub of app.subApps ?? []) {
        expect(sub.href.startsWith("/")).toBe(true);
      }
    }
  });

  it("Financeiro, Lançamentos e Conteúdo têm sub-apps; os demais não", () => {
    const comPasta = CATALOGO_APPS.filter((a) => (a.subApps?.length ?? 0) > 0).map((a) => a.id);
    expect(comPasta.sort()).toEqual(["conteudo", "financeiro", "lancamentos"].sort());
  });

  it("Financeiro tem exatamente as sete telas de fin-rotas.ts, na mesma ordem", () => {
    const financeiro = CATALOGO_APPS.find((a) => a.id === "financeiro")!;
    expect(financeiro.subApps?.map((s) => s.href)).toEqual([
      "/financeiro",
      "/financeiro/caixa",
      "/financeiro/projecao",
      "/financeiro/dre",
      "/financeiro/capital-de-giro",
      "/financeiro/reembolsos",
      "/financeiro/comissoes",
    ]);
  });

  it("nenhum id de app ou sub-app se repete", () => {
    const ids = CATALOGO_APPS.flatMap((a) => [a.id, ...(a.subApps ?? []).map((s) => s.id)]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("acharAppPorRota", () => {
  it("a raiz não é app nenhum — é a própria tela inicial", () => {
    // "/" deixou de ser o Dashboard: virou a área de trabalho com os ícones,
    // e o Dashboard passou a morar em "/painel" como mais um aplicativo. A
    // raiz não pode resolver para app nenhum, senão a topbar anunciaria um
    // lugar aberto justamente na tela que serve para escolher o lugar.
    expect(acharAppPorRota("/")).toBeNull();
    expect(acharAppPorRota("/painel")?.app.id).toBe("dashboard");
    // "/" não é prefixo de tudo — "/agenda" não pode cair no Dashboard
    expect(acharAppPorRota("/agenda")?.app.id).toBe("agenda");
  });

  it("acha o sub-app certo dentro de Financeiro por rota filha", () => {
    const achado = acharAppPorRota("/financeiro/dre");
    expect(achado?.app.id).toBe("financeiro");
    expect(achado?.subApp?.id).toBe("financeiro-dre");
  });

  it("uma rota mais funda que qualquer sub-app ainda resolve para o app-pai, sem sub-app", () => {
    const achado = acharAppPorRota("/financeiro/comissoes/detalhe/xyz");
    expect(achado?.app.id).toBe("financeiro");
    expect(achado?.subApp?.id).toBe("financeiro-comissoes");
  });

  it("em empate (a rota do app É a rota de um sub-app), o app-nível vence", () => {
    const achado = acharAppPorRota("/financeiro");
    expect(achado?.app.id).toBe("financeiro");
    expect(achado?.subApp).toBeNull();
  });

  it("rota que não bate com nada devolve null", () => {
    expect(acharAppPorRota("/rota-que-nao-existe")).toBeNull();
  });

  it("não confunde prefixo textual sem barra (\"/agenda\" não é pai de \"/agendamento\")", () => {
    expect(acharAppPorRota("/agendamento")).toBeNull();
  });
});

describe("badgeValido", () => {
  it("número inteiro positivo passa", () => {
    expect(badgeValido(3)).toBe(3);
  });

  it("trunca fração (contagem é sempre inteira)", () => {
    expect(badgeValido(2.9)).toBe(2);
  });

  it("zero, negativo, NaN, null e undefined não viram badge", () => {
    expect(badgeValido(0)).toBeUndefined();
    expect(badgeValido(-1)).toBeUndefined();
    expect(badgeValido(NaN)).toBeUndefined();
    expect(badgeValido(Infinity)).toBeUndefined();
    expect(badgeValido(null)).toBeUndefined();
    expect(badgeValido(undefined)).toBeUndefined();
  });
});

describe("contarAppsComBadge", () => {
  it("conta só os apps com badge de verdade", () => {
    const total = contarAppsComBadge(CATALOGO_APPS, {
      agenda: 3,
      financeiro: 0, // zero não conta
      crm: undefined,
      dashboard: -5, // negativo não conta
    });
    expect(total).toBe(1);
  });

  it("sem nenhum badge, conta zero", () => {
    expect(contarAppsComBadge(CATALOGO_APPS, {})).toBe(0);
  });
});

describe("ordenarApps", () => {
  it("ordena por nome, alfabeto pt-BR", () => {
    const itens: AppCatalogo[] = [
      { id: "b", nome: "Conteúdo", href: "/b", icone: "Film", cor: "#000", frase: "" },
      { id: "a", nome: "Agenda", href: "/a", icone: "CalendarDays", cor: "#000", frase: "" },
      { id: "c", nome: "Éter", href: "/c", icone: "Layers", cor: "#000", frase: "" },
    ];
    expect(ordenarApps(itens).map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("não muta a lista original", () => {
    const itens = CATALOGO_APPS.slice();
    const copia = [...itens];
    ordenarApps(itens);
    expect(itens).toEqual(copia);
  });

  it("função genérica: funciona com sub-apps também", () => {
    const financeiro = CATALOGO_APPS.find((a) => a.id === "financeiro")!;
    const ordenado = ordenarApps(financeiro.subApps ?? []);
    const nomes = ordenado.map((s) => s.nome);
    expect(nomes).toEqual([...nomes].sort((a, b) => a.localeCompare(b, "pt-BR")));
  });
});
