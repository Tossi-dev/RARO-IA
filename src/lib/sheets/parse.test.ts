// Testes da camada de leitura da planilha -- vitest.
//
// A regra que estes testes protegem: numero e data que vem da planilha chegam ao
// app com o valor CERTO. Erro de separador decimal e erro de mes base zero nao
// quebram nada -- eles apenas exibem outro numero, em silencio. Aqui e onde o
// silencio vira falha visivel.
//
// Sem rede: tudo roda contra fixture (texto CSV) escrito a mao, no formato que o
// endpoint gviz devolve.

import { describe, expect, it } from "vitest";
import { parseCsv, paraObjetos } from "./csv";
import {
  escreverData,
  escreverNumero,
  lerBooleano,
  lerData,
  lerDataOuNulo,
  lerNumero,
  lerNumeroOuNulo,
  lerPercentual,
  lerTexto,
  normalizar,
} from "./parse";

describe("lerNumero — formato brasileiro e padrao contabil", () => {
  it("moeda com simbolo e separador de milhar", () => {
    expect(lerNumero("R$ 1.234,56")).toBe(1234.56);
  });

  it("milhar com virgula decimal, sem simbolo", () => {
    expect(lerNumero("1.234,56")).toBe(1234.56);
  });

  it("so virgula decimal", () => {
    expect(lerNumero("1234,56")).toBe(1234.56);
  });

  it("ponto decimal quando o desenho NAO e de agrupamento", () => {
    expect(lerNumero("1234.56")).toBe(1234.56);
    expect(lerNumero("1.5")).toBe(1.5);
    expect(lerNumero("0.06")).toBe(0.06);
    expect(lerNumero("1.2345")).toBe(1.2345);
  });

  it("inteiro puro", () => {
    expect(lerNumero("1234")).toBe(1234);
  });

  it("parenteses sao negativo (padrao contabil)", () => {
    expect(lerNumero("(1.234,56)")).toBe(-1234.56);
  });

  it("sinal negativo antes do simbolo de moeda", () => {
    expect(lerNumero("-R$ 50,00")).toBe(-50);
  });

  it("vazio, nulo e indefinido viram zero", () => {
    expect(lerNumero("")).toBe(0);
    expect(lerNumero(null)).toBe(0);
    expect(lerNumero(undefined)).toBe(0);
    expect(lerNumero("   ")).toBe(0);
  });

  it("texto sem digito vira zero, nunca NaN", () => {
    expect(lerNumero("a combinar")).toBe(0);
  });

  it("mais de um ponto com grupo final de 3 digitos e milhar", () => {
    expect(lerNumero("1.234.567")).toBe(1234567);
    expect(lerNumero("R$ 12.345.678")).toBe(12345678);
  });

  it("um ponto so com 3 digitos depois e MILHAR, nao decimal", () => {
    // A regressao de mil vezes: `out:csv` devolve o texto ja formatado em pt-BR
    // (a mesma planilha devolveu "R$ 0,00" e "6,0%"), entao ponto + 3 digitos e
    // agrupamento. Lido como decimal, R$ 150.480 de midia virava R$ 150,48.
    expect(lerNumero("1.234")).toBe(1234);
    expect(lerNumero("12.500")).toBe(12500);
    expect(lerNumero("R$ 12.500")).toBe(12500);
    expect(lerNumero("150.480")).toBe(150480);
  });

  it("agrupamento vale para qualquer numero de grupos", () => {
    expect(lerNumero("1.234.567")).toBe(1234567);
    expect(lerNumero("1.234.567,89")).toBe(1234567.89);
    expect(lerNumero("999.999")).toBe(999999);
    expect(lerNumero("12.345.678")).toBe(12345678);
  });

  it("virgula presente manda: todo ponto vira milhar", () => {
    // A planilha e pt-BR. Nao ha adivinhacao de localidade -- adivinhar foi
    // exatamente o que produziu o erro de mil vezes.
    expect(lerNumero("R$ 1.234.567,89")).toBe(1234567.89);
    expect(lerNumero("1,234.56")).toBeCloseTo(1.23456, 5);
  });

  it("parentese NO MEIO do texto nao inverte o sinal", () => {
    expect(lerNumero("Venda (parcelada) 100")).toBe(100);
    expect(lerNumero("(1.234,56)")).toBe(-1234.56);
    expect(lerNumero(" (1.234,56) ")).toBe(-1234.56);
    expect(lerNumero("Investimento (midia) 150.480")).toBe(150480);
  });

  it("o menos so conta antes do primeiro digito", () => {
    expect(lerNumero("-R$ 50,00")).toBe(-50);
    expect(lerNumero("R$ -50,00")).toBe(-50);
    // traco DEPOIS do numero e anotacao, nao sinal
    expect(lerNumero("1.500,00 -")).toBe(1500);
    expect(lerNumero("R$ 1.500,00 - pago")).toBe(1500);
  });
});

describe("lerNumeroOuNulo — zero informado nao e o mesmo que celula vazia", () => {
  it("celula vazia devolve null", () => {
    expect(lerNumeroOuNulo("")).toBeNull();
    expect(lerNumeroOuNulo(null)).toBeNull();
    expect(lerNumeroOuNulo("-")).toBeNull();
  });

  it("zero escrito devolve zero", () => {
    expect(lerNumeroOuNulo("R$ 0,00")).toBe(0);
    expect(lerNumeroOuNulo("1.500,00")).toBe(1500);
    // milhar sem casa decimal, que e como a planilha grava valor redondo
    expect(lerNumeroOuNulo("R$ 12.500")).toBe(12500);
  });
});

describe("lerPercentual — sempre em pontos percentuais", () => {
  it("le o texto formatado que a planilha grava", () => {
    expect(lerPercentual("6,0%")).toBe(6);
    expect(lerPercentual("6%")).toBe(6);
    expect(lerPercentual("6")).toBe(6);
    expect(lerPercentual("12,5%")).toBe(12.5);
  });

  it("fracao pura NAO e adivinhada — vira erro visivel, nao silencioso", () => {
    expect(lerPercentual("0,06")).toBe(0.06);
  });

  it("vazio vira zero", () => {
    expect(lerPercentual("")).toBe(0);
    expect(lerPercentual(null)).toBe(0);
  });
});

describe("lerData — sempre ISO aaaa-mm-dd", () => {
  it("o formato que o dono digita", () => {
    expect(lerData("31/12/2026")).toBe("2026-12-31");
    expect(lerData("1/2/2026")).toBe("2026-02-01");
  });

  it("ano de dois digitos vira 20xx", () => {
    expect(lerData("31/12/26")).toBe("2026-12-31");
  });

  it("ISO com e sem hora", () => {
    expect(lerData("2026-12-31")).toBe("2026-12-31");
    expect(lerData("2026-12-31T00:00:00Z")).toBe("2026-12-31");
  });

  it("data com hora no formato brasileiro (coluna Timestamp)", () => {
    expect(lerData("31/12/2026 14:32:10")).toBe("2026-12-31");
  });

  it("Date(...) do gviz tem MES BASE ZERO", () => {
    expect(lerData("Date(2026,11,31)")).toBe("2026-12-31");
    expect(lerData("Date(2026,0,1)")).toBe("2026-01-01");
    expect(lerData("Date(2026,6,15,14,32,0)")).toBe("2026-07-15");
  });

  it("data invalida devolve string vazia — nunca 'Invalid Date', nunca hoje", () => {
    expect(lerData("")).toBe("");
    expect(lerData(null)).toBe("");
    expect(lerData("a combinar")).toBe("");
    expect(lerData("Invalid Date")).toBe("");
    expect(lerData("31/02/2026")).toBe("");
    expect(lerData("2026-13-01")).toBe("");
  });

  it("lerDataOuNulo troca a string vazia por null", () => {
    expect(lerDataOuNulo("")).toBeNull();
    expect(lerDataOuNulo("a combinar")).toBeNull();
    expect(lerDataOuNulo("31/12/2026")).toBe("2026-12-31");
  });
});

describe("escrita — o que vai para a celula", () => {
  it("escreverNumero usa virgula decimal e nenhum separador de milhar", () => {
    expect(escreverNumero(1234.56)).toBe("1234,56");
    expect(escreverNumero(1234)).toBe("1234");
    expect(escreverNumero(-50)).toBe("-50");
    expect(escreverNumero(0)).toBe("0");
  });

  it("escreverNumero corta na 2a casa decimal", () => {
    // Mais de 2 casas e armadilha: o `paraNumero` do raro-sync.gs so reconhece
    // virgula decimal com 1 ou 2 casas, entao "1234,567" viraria 1234567 la.
    expect(escreverNumero(1234.567)).toBe("1234,57");
    expect(escreverNumero(333.3333)).toBe("333,33");
    expect(escreverNumero(-333.3333)).toBe("-333,33");
    expect(escreverNumero(0.005)).toBe("0,01");
    expect(escreverNumero(10.0)).toBe("10");
  });

  it("escreverNumero nao deixa NaN chegar na celula", () => {
    expect(escreverNumero(Number.NaN)).toBe("0");
    expect(escreverNumero(Number.POSITIVE_INFINITY)).toBe("0");
  });

  it("escreverData devolve dd/mm/aaaa", () => {
    expect(escreverData("2026-12-31")).toBe("31/12/2026");
    expect(escreverData("2026-01-05")).toBe("05/01/2026");
    expect(escreverData("a combinar")).toBe("");
  });

  it("ida e volta: ler o que foi escrito devolve o original", () => {
    expect(lerNumero(escreverNumero(1234.56))).toBe(1234.56);
    expect(lerNumero(escreverNumero(-1234.56))).toBe(-1234.56);
    expect(lerData(escreverData("2026-12-31"))).toBe("2026-12-31");
    expect(escreverData(lerData("Date(2026,11,31)"))).toBe("31/12/2026");
  });
});

describe("normalizar — casar celula com lista da CONFIG", () => {
  it("tira acento, baixa a caixa e colapsa espaco", () => {
    expect(normalizar("Cartão de Crédito")).toBe("cartao de credito");
    expect(normalizar("Cartao de credito")).toBe("cartao de credito");
    expect(normalizar("  PIX   automático  ")).toBe("pix automatico");
  });

  it("as duas grafias do mesmo valor caem no mesmo balde", () => {
    expect(normalizar("Cartão de crédito")).toBe(normalizar("CARTAO DE CREDITO"));
  });
});

describe("lerTexto e lerBooleano", () => {
  it("lerTexto tira sobra e trata ausencia", () => {
    expect(lerTexto("  Tossi  ")).toBe("Tossi");
    expect(lerTexto(null)).toBe("");
    expect(lerTexto(undefined)).toBe("");
  });

  it("lerBooleano aceita as formas de sim usadas na planilha", () => {
    expect(lerBooleano("Sim")).toBe(true);
    expect(lerBooleano("SIM")).toBe(true);
    expect(lerBooleano("TRUE")).toBe(true);
    expect(lerBooleano("1")).toBe(true);
    expect(lerBooleano("x")).toBe(true);
  });

  it("qualquer outra coisa e falso, inclusive vazio", () => {
    expect(lerBooleano("Não")).toBe(false);
    expect(lerBooleano("0")).toBe(false);
    expect(lerBooleano("")).toBe(false);
    expect(lerBooleano(null)).toBe(false);
  });
});

describe("parseCsv — RFC 4180 sobre o CSV que o gviz devolve", () => {
  it("campo entre aspas com virgula dentro nao vira duas colunas", () => {
    const csv = 'ID,Descricao,Valor\nV1,"Mentoria, turma de julho","1.200,00"';
    expect(parseCsv(csv)).toEqual([
      ["ID", "Descricao", "Valor"],
      ["V1", "Mentoria, turma de julho", "1.200,00"],
    ]);
  });

  it('aspas escapadas ("") viram uma aspa literal', () => {
    const csv = 'ID,Descricao\nV1,"Plano ""Corpo e Mente"" anual"';
    expect(parseCsv(csv)).toEqual([
      ["ID", "Descricao"],
      ["V1", 'Plano "Corpo e Mente" anual'],
    ]);
  });

  it("quebra de linha DENTRO do campo entre aspas nao quebra a linha do CSV", () => {
    const csv = 'ID,Observacoes\nA1,"linha um\nlinha dois"\nA2,sem quebra';
    expect(parseCsv(csv)).toEqual([
      ["ID", "Observacoes"],
      ["A1", "linha um\nlinha dois"],
      ["A2", "sem quebra"],
    ]);
  });

  it("aceita CRLF e conta a ultima linha sem quebra final", () => {
    const csv = "ID,Valor\r\nV1,10\r\nV2,20";
    expect(parseCsv(csv)).toEqual([
      ["ID", "Valor"],
      ["V1", "10"],
      ["V2", "20"],
    ]);
  });

  it("quebra final nao inventa uma linha extra", () => {
    expect(parseCsv("ID,Valor\nV1,10\n")).toEqual([
      ["ID", "Valor"],
      ["V1", "10"],
    ]);
  });

  it("campo vazio no fim da linha continua sendo coluna", () => {
    expect(parseCsv("ID,Valor,Status\nV1,10,")).toEqual([["ID", "Valor", "Status"], ["V1", "10", ""]]);
  });

  it("texto vazio devolve matriz vazia", () => {
    expect(parseCsv("")).toEqual([]);
  });
});

describe("paraObjetos — cabecalho vira chave", () => {
  it("linha totalmente vazia e descartada (a planilha tem centenas delas)", () => {
    const csv = "ID,Valor\nV1,10\n,\n,\nV2,20\n";
    expect(paraObjetos(parseCsv(csv))).toEqual([
      { ID: "V1", Valor: "10" },
      { ID: "V2", Valor: "20" },
    ]);
  });

  it("titulo repetido mantem o primeiro e sufixa os seguintes", () => {
    const csv = "ID,Valor,Valor,Valor\nV1,10,20,30";
    expect(paraObjetos(parseCsv(csv))).toEqual([
      { ID: "V1", Valor: "10", Valor_2: "20", Valor_3: "30" },
    ]);
  });

  it("faz trim no titulo e preenche coluna faltante com string vazia", () => {
    const csv = " ID , Valor , Status \nV1,10";
    expect(paraObjetos(parseCsv(csv))).toEqual([{ ID: "V1", Valor: "10", Status: "" }]);
  });

  it("CSV so com cabecalho devolve lista vazia", () => {
    expect(paraObjetos(parseCsv("ID,Valor"))).toEqual([]);
    expect(paraObjetos([])).toEqual([]);
  });

  it("o valor da celula chega cru e so entao passa pelos conversores", () => {
    // o gviz entrega Date(...) ENTRE ASPAS, justamente porque tem virgula dentro
    const csv = 'ID,Data,Valor\nV1,"Date(2026,11,31)","R$ 1.234,56"';
    const [linha] = paraObjetos(parseCsv(csv));
    expect(linha.Valor).toBe("R$ 1.234,56");
    expect(lerData(linha.Data)).toBe("2026-12-31");
    expect(lerNumero(linha.Valor)).toBe(1234.56);
  });
});
