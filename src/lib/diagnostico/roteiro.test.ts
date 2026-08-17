import { describe, expect, it } from "vitest";
import { ABORDAGEM, ATRAVESSAR, MODIFICADOR, OFERTA } from "./roteiro";
import { lerSegmento, type Trava } from "./codigo";

const TRAVAS: Trava[] = ["T1", "T2", "T3", "T4", "T5", "T6", "T7"];

describe("o roteiro cobre os sete blocos, inteiros", () => {
  it("existe uma abordagem para cada trava", () => {
    expect(Object.keys(ABORDAGEM).sort()).toEqual([...TRAVAS].sort());
  });

  it("nenhum campo de nenhum bloco vem vazio", () => {
    // A ficha do lead renderiza estes campos direto. Um vazio aqui é uma
    // seção em branco na tela do Jefson no meio de uma conversa de venda.
    for (const t of TRAVAS) {
      const a = ABORDAGEM[t];
      for (const [campo, valor] of Object.entries(a)) {
        expect(typeof valor, `${t}.${campo}`).toBe("string");
        expect(valor.trim().length, `${t}.${campo} vazio`).toBeGreaterThan(0);
      }
    }
  });

  it("toda primeira mensagem tem tamanho de mensagem de WhatsApp, não de e-mail", () => {
    // Acima de ~600 caracteres o WhatsApp corta com "Ler mais" e o efeito de
    // "ele me leu em quinze segundos" morre no primeiro toque.
    for (const t of TRAVAS) {
      const n = ABORDAGEM[t].primeiraMensagem.length;
      expect(n, `${t} curta demais`).toBeGreaterThan(120);
      expect(n, `${t} longa demais (${n})`).toBeLessThan(600);
    }
  });

  it("nenhuma primeira mensagem começa agradecendo ou perguntando como vai", () => {
    // A regra dos sete blocos: a primeira mensagem não vende, não faz pergunta
    // de descoberta e não agradece o contato.
    for (const t of TRAVAS) {
      const m = ABORDAGEM[t].primeiraMensagem.toLowerCase();
      expect(m.startsWith("obrigado"), t).toBe(false);
      expect(m.startsWith("oi"), t).toBe(false);
      expect(m.includes("tudo bem?"), t).toBe(false);
      expect(m.includes("obrigado pelo contato"), t).toBe(false);
    }
  });

  it("toda abordagem aponta uma ferramenta que existe no índice do vault", () => {
    for (const t of TRAVAS) {
      expect(ABORDAGEM[t].ferramenta).toMatch(/\.(md|xlsx)/);
    }
  });
});

describe("a oferta por faixa e o modificador de urgência", () => {
  it("existe oferta para as três faixas qualificadas", () => {
    expect(Object.keys(OFERTA).sort()).toEqual(["A", "B", "C"]);
  });

  it("existe modificador para as quatro urgências", () => {
    expect(Object.keys(MODIFICADOR).sort()).toEqual(["1", "2", "3", "4"]);
  });

  it("o modificador de quem só pesquisa manda NÃO vender", () => {
    expect(MODIFICADOR[4]).toContain("NÃO VENDA");
  });

  it("nenhum ângulo de preço traz valor em reais", () => {
    // O preço sai depois do diagnóstico e é decisão do Jefson. Um número aqui
    // vazaria para a ficha e viraria âncora antes da conversa existir.
    for (const f of ["A", "B", "C"] as const) {
      expect(OFERTA[f].anguloDoPreco).not.toMatch(/R\$\s?\d/);
      expect(OFERTA[f].formato).not.toMatch(/R\$\s?\d/);
    }
  });
});

describe("o roteiro casa com o que o código do diagnóstico produz", () => {
  it("todo segmento possível encontra abordagem para a porta E para o quarto", () => {
    // 3 faixas x 4 urgências x 7 travas x 4 intensidades = 336 combinações.
    // Nenhuma pode cair numa ficha sem texto para mostrar.
    for (const faixa of ["A", "B", "C"]) {
      for (const urg of [1, 2, 3, 4]) {
        for (let t = 1; t <= 7; t++) {
          for (let i = 0; i <= 3; i++) {
            const s = lerSegmento(`JR-${faixa}${urg}-T${t}-${i}-K7QM`)!;
            expect(s, `${faixa}${urg}-T${t}-${i}`).not.toBeNull();
            expect(ABORDAGEM[s.travaDeclarada]).toBeDefined();
            expect(ABORDAGEM[s.travaDeTrabalho]).toBeDefined();
            expect(OFERTA[s.faixa]).toBeDefined();
            expect(MODIFICADOR[s.urgencia]).toBeDefined();
            // Quando atravessa, a ponte é obrigatória — senão a ficha mostra
            // dois blocos sem dizer como sair de um para o outro.
            if (s.atravessar) expect(ATRAVESSAR.passo2.length).toBeGreaterThan(0);
          }
        }
      }
    }
  });
});
