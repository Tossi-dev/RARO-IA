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

// Tarefa 29 — Trilhas entra na gaveta, do lado da gestão.
describe("gruposNavPorPapel — Trilhas (tarefa 29)", () => {
  it("dono e gestor veem Mentoria e Trilhas no grupo Gestão", () => {
    for (const papel of ["dono", "gestor"] as const) {
      const gestao = gruposNavPorPapel(papel).find((g) => g.titulo === "Gestão");
      const rotulos = gestao?.itens.map((i) => i.rotulo) ?? [];
      expect(rotulos).toContain("Mentoria");
      expect(rotulos).toContain("Trilhas");
    }
  });

  it("nenhum outro papel vê Trilhas — nem o rótulo, nem o href no que é serializado", () => {
    // A gaveta é componente cliente: o que sai daqui vira JavaScript no
    // navegador. "Não desenhar" não basta — não pode nem VIAJAR.
    for (const papel of ["comercial", "mentorado", "afiliado", "aluno"] as const) {
      const itens = gruposNavPorPapel(papel).flatMap((g) => g.itens);
      expect(itens.map((i) => i.rotulo)).not.toContain("Trilhas");
      expect(JSON.stringify(itens)).not.toContain("/trilhas");
      expect(JSON.stringify(itens)).not.toContain("/mentoria");
    }
  });

  it("todo item de todo grupo, para todo papel, é uma rota que aquele papel abre", () => {
    // A regra que impede um item novo de nascer levando para /sem-acesso.
    for (const papel of TODOS_PAPEIS) {
      for (const grupo of gruposNavPorPapel(papel)) {
        for (const item of grupo.itens) {
          expect([papel, item.href, rotaPermitida(papel, item.href)]).toEqual([
            papel,
            item.href,
            true,
          ]);
        }
      }
    }
  });
});

// Tarefa 36 — Avisos entra na gaveta, do lado de Mentoria e Trilhas.
describe("gruposNavPorPapel — Avisos (tarefa 36)", () => {
  it("dono e gestor veem Avisos no grupo Gestão", () => {
    for (const papel of ["dono", "gestor"] as const) {
      const gestao = gruposNavPorPapel(papel).find((g) => g.titulo === "Gestão");
      expect(gestao?.itens.map((i) => i.rotulo) ?? []).toContain("Avisos");
    }
  });

  it("mais ninguém vê Avisos — nem o rótulo, nem o href no que é serializado", () => {
    for (const papel of ["comercial", "mentorado", "afiliado", "aluno"] as const) {
      const itens = gruposNavPorPapel(papel).flatMap((g) => g.itens);
      expect(itens.map((i) => i.rotulo)).not.toContain("Avisos");
      expect(JSON.stringify(itens)).not.toContain("/feed");
    }
  });
});
