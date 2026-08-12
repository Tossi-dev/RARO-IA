// Testes de `gruposNavPorPapel` — B2.7, a mesma garantia de
// `src/lib/apps.test.ts` (appsDoPapel), aplicada ao menu da gaveta do
// celular (src/components/sidebar.tsx `<SidebarNav />`).

import { describe, expect, it } from "vitest";
import { rotaPermitida, type Papel } from "@/lib/papeis";
import { gruposNavPorPapel } from "./nav-lateral";

const TODOS_PAPEIS: readonly Papel[] = [
  "dono",
  "gestor",
  "comercial",
  "mentorado",
  "afiliado",
  "aluno",
];

describe("gruposNavPorPapel", () => {
  it("dono e gestor recebem o menu inteiro (quatro grupos)", () => {
    for (const papel of ["dono", "gestor"] as const) {
      const grupos = gruposNavPorPapel(papel);
      expect(grupos.map((g) => g.titulo)).toEqual(["Visão geral", "Gestão", "Marketing", "Sistema"]);
    }
  });

  it("mentorado não recebe Financeiro nem Central de Clientes — o grupo 'Gestão' some inteiro", () => {
    const grupos = gruposNavPorPapel("mentorado");
    expect(grupos.find((g) => g.titulo === "Gestão")).toBeUndefined();
    const rotulos = grupos.flatMap((g) => g.itens.map((i) => i.rotulo));
    expect(rotulos).not.toContain("Financeiro");
    expect(rotulos).not.toContain("Central de Clientes");
  });

  it("mentorado não recebe Importar extrato nem Integrações do grupo Sistema (mas recebe Começar)", () => {
    const grupos = gruposNavPorPapel("mentorado");
    const sistema = grupos.find((g) => g.titulo === "Sistema");
    const rotulos = sistema?.itens.map((i) => i.rotulo) ?? [];
    expect(rotulos).not.toContain("Importar extrato");
    expect(rotulos).not.toContain("Integrações");
    expect(rotulos).toContain("Começar");
  });

  it("comercial recebe Dashboard e Central de Clientes, mas não Financeiro", () => {
    const rotulos = gruposNavPorPapel("comercial").flatMap((g) => g.itens.map((i) => i.rotulo));
    expect(rotulos).toContain("Dashboard");
    expect(rotulos).toContain("Central de Clientes");
    expect(rotulos).not.toContain("Financeiro");
  });

  it.each(TODOS_PAPEIS)(
    "papel %s: todo item devolvido tem href permitido para o papel",
    (papel) => {
      for (const grupo of gruposNavPorPapel(papel)) {
        expect(grupo.itens.length).toBeGreaterThan(0); // grupo vazio nunca deveria sobreviver ao filtro
        for (const item of grupo.itens) {
          expect(rotaPermitida(papel, item.href)).toBe(true);
        }
      }
    }
  );

  it("chamar duas vezes, com o mesmo papel, devolve o mesmo conteúdo", () => {
    expect(gruposNavPorPapel("comercial")).toEqual(gruposNavPorPapel("comercial"));
  });
});
