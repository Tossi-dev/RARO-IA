// Testes da composição de KPI (Onda 1) — vitest.
// A regra que estes testes protegem: todo KPI abre a sua composição, no padrão
// brasileiro, com a cor semântica respeitando `direcao_boa`.

import { describe, expect, it } from "vitest";
import {
  formatarValor,
  frase,
  fraseComValorFormatado,
  glifoDaVariacao,
  operadorDe,
  tomDaVariacao,
  variacaoPct,
  type ComposicaoEstruturada,
} from "./composicao";

// o Intl pt-BR separa "R$" do número com espaço NÃO quebrável (U+00A0)
const NB = " ";

describe("formatarValor — padrão brasileiro", () => {
  it("moeda com duas casas, nunca abreviada", () => {
    expect(formatarValor(47000, "moeda")).toBe(`R$${NB}47.000,00`);
    expect(formatarValor(58583.4, "moeda")).toBe(`R$${NB}58.583,40`);
  });

  it("moeda negativa mantém o sinal antes do símbolo", () => {
    expect(formatarValor(-1250.5, "moeda")).toBe(`-R$${NB}1.250,50`);
  });

  it("numero usa ponto como separador de milhar e vírgula como decimal", () => {
    expect(formatarValor(1234567, "numero")).toBe("1.234.567");
    expect(formatarValor(18.42, "numero")).toBe("18,42");
    expect(formatarValor(1506, "numero")).toBe("1.506");
  });

  it("percentual recebe pontos percentuais, não fração", () => {
    expect(formatarValor(18.4, "percentual")).toBe("18,4%");
    expect(formatarValor(0, "percentual")).toBe("0%");
  });

  it("valor não finito não vira NaN na tela", () => {
    expect(formatarValor(Number.NaN, "moeda")).toBe(`R$${NB}0,00`);
    expect(formatarValor(Number.POSITIVE_INFINITY, "numero")).toBe("0");
  });
});

describe("operadorDe", () => {
  it("devolve o glifo de cada fórmula infixa", () => {
    expect(operadorDe("soma")).toBe("+");
    expect(operadorDe("subtracao")).toBe("-");
    expect(operadorDe("multiplicacao")).toBe("x");
    expect(operadorDe("divisao")).toBe("/");
  });

  it("média não é operação infixa — devolve null", () => {
    expect(operadorDe("media")).toBeNull();
  });
});

describe("frase — memória de cálculo nas cinco fórmulas", () => {
  it("divisão no formato exato da skill", () => {
    const c: ComposicaoEstruturada = {
      formula: "divisao",
      partes: [
        { rotulo: "Investimento em mídia", valor: 58583.4 },
        { rotulo: "Leads gerados", valor: 1506, formato: "numero" },
      ],
    };
    expect(frase(38.9, "moeda", c)).toBe(
      `R$${NB}38,90 = Investimento em mídia R$${NB}58.583,40 / Leads gerados 1.506`
    );
  });

  it("soma", () => {
    const c: ComposicaoEstruturada = {
      formula: "soma",
      partes: [
        { rotulo: "Vendas no site", valor: 30000 },
        { rotulo: "Vendas por afiliado", valor: 17000 },
      ],
    };
    expect(frase(47000, "moeda", c)).toBe(
      `R$${NB}47.000,00 = Vendas no site R$${NB}30.000,00 + Vendas por afiliado R$${NB}17.000,00`
    );
  });

  it("subtração com três partes", () => {
    const c: ComposicaoEstruturada = {
      formula: "subtracao",
      partes: [
        { rotulo: "Receita bruta", valor: 47000 },
        { rotulo: "Deduções", valor: 2000 },
        { rotulo: "Impostos", valor: 3055 },
      ],
    };
    expect(frase(41945, "moeda", c)).toBe(
      `R$${NB}41.945,00 = Receita bruta R$${NB}47.000,00 - Deduções R$${NB}2.000,00 - Impostos R$${NB}3.055,00`
    );
  });

  it("multiplicação usa x", () => {
    const c: ComposicaoEstruturada = {
      formula: "multiplicacao",
      partes: [
        { rotulo: "Vendas", valor: 47, formato: "numero" },
        { rotulo: "Ticket médio", valor: 1000 },
      ],
    };
    expect(frase(47000, "moeda", c)).toBe(
      `R$${NB}47.000,00 = Vendas 47 x Ticket médio R$${NB}1.000,00`
    );
  });

  it("média vira enumeração com 'e' no último item", () => {
    const c: ComposicaoEstruturada = {
      formula: "media",
      partes: [
        { rotulo: "Maio", valor: 30 },
        { rotulo: "Junho", valor: 40 },
        { rotulo: "Julho", valor: 50 },
      ],
    };
    expect(frase(40, "numero", c)).toBe("40 = média de Maio 30, Junho 40 e Julho 50");
  });

  it("parte sem formato herda o formato do KPI", () => {
    const c: ComposicaoEstruturada = {
      formula: "soma",
      partes: [
        { rotulo: "Corpo", valor: 10.5 },
        { rotulo: "Mente", valor: 7.9 },
      ],
    };
    expect(frase(18.4, "percentual", c)).toBe("18,4% = Corpo 10,5% + Mente 7,9%");
  });

  it("composição escrita à mão volta exatamente como veio", () => {
    const texto = "Contagem direta das matrículas pagas em julho/26.";
    expect(frase(123, "numero", texto)).toBe(texto);
    expect(fraseComValorFormatado("qualquer coisa", "moeda", texto)).toBe(texto);
  });

  it("fraseComValorFormatado monta a conta a partir do valor já formatado", () => {
    const c: ComposicaoEstruturada = {
      formula: "subtracao",
      partes: [
        { rotulo: "Entradas realizadas", valor: 10000 },
        { rotulo: "Saídas realizadas", valor: 4000 },
      ],
    };
    expect(fraseComValorFormatado("R$ 6 mil", "moeda", c)).toBe(
      `R$ 6 mil = Entradas realizadas R$${NB}10.000,00 - Saídas realizadas R$${NB}4.000,00`
    );
  });
});

describe("variacaoPct", () => {
  it("calcula a variação percentual contra a referência", () => {
    expect(variacaoPct(120, 100)).toBe(20);
    expect(variacaoPct(80, 100)).toBe(-20);
  });

  it("referência zero não vira divisão por zero: devolve null", () => {
    expect(variacaoPct(500, 0)).toBeNull();
  });

  it("referência ausente devolve null — sem base é sem base", () => {
    expect(variacaoPct(500, null)).toBeNull();
    expect(variacaoPct(500, undefined)).toBeNull();
    expect(variacaoPct(500, Number.NaN)).toBeNull();
    expect(variacaoPct(500, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("usa o módulo da referência: prejuízo que piora não vira alta", () => {
    // de -1.000 para -1.500 o resultado PIOROU 50%
    expect(variacaoPct(-1500, -1000)).toBe(-50);
    // de -1.000 para -500 o resultado MELHOROU 50%
    expect(variacaoPct(-500, -1000)).toBe(50);
  });
});

describe("tomDaVariacao — a cor respeita direcao_boa", () => {
  it("em direcao_boa 'cima', subir é positivo e cair é negativo", () => {
    expect(tomDaVariacao(12.5, "cima")).toBe("positivo");
    expect(tomDaVariacao(-12.5, "cima")).toBe("negativo");
  });

  it("em direcao_boa 'baixo', a QUEDA é positivo (custo, churn, reembolso, prazo)", () => {
    expect(tomDaVariacao(-12.5, "baixo")).toBe("positivo");
    expect(tomDaVariacao(-0.06, "baixo")).toBe("positivo");
    expect(tomDaVariacao(12.5, "baixo")).toBe("negativo");
  });

  it("variação abaixo de 0,05% é ruído, não movimento", () => {
    expect(tomDaVariacao(0.04, "cima")).toBe("neutro");
    expect(tomDaVariacao(-0.04, "baixo")).toBe("neutro");
    expect(tomDaVariacao(0, "cima")).toBe("neutro");
  });

  it("sem base de comparação o tom é neutro nas duas direções", () => {
    expect(tomDaVariacao(null, "cima")).toBe("neutro");
    expect(tomDaVariacao(null, "baixo")).toBe("neutro");
  });
});

describe("glifoDaVariacao — glifo tipográfico, nunca emoji", () => {
  it("indica só a direção, sem julgar se é bom ou ruim", () => {
    expect(glifoDaVariacao(3)).toBe("▲");
    expect(glifoDaVariacao(-3)).toBe("▼");
    expect(glifoDaVariacao(0)).toBe("▬");
    expect(glifoDaVariacao(0.01)).toBe("▬");
    expect(glifoDaVariacao(null)).toBe("▬");
  });

  it("queda boa continua com a seta para baixo — quem colore é o tom", () => {
    expect(glifoDaVariacao(-30)).toBe("▼");
    expect(tomDaVariacao(-30, "baixo")).toBe("positivo");
  });
});
