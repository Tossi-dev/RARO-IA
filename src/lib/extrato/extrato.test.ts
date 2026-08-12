// Testes da orquestração e — o coração da feature — da impressão digital.
// Reenviar um extrato que se sobrepõe ao anterior é o uso NORMAL do cliente
// (semanal em cima de diário, mensal em cima de semanal); se a digital
// falhar, o caixa duplica e ninguém percebe até fechar o mês.

import { describe, expect, it } from "vitest";
import { sugerirCategoria } from "./classificar";
import {
  calcularImpressaoDigital,
  detectarOrigem,
  lerExtrato,
  separarNovasDeDuplicadas,
  type LinhaBruta,
} from "./extrato";

const OFX_UM_LANCAMENTO = `
<STMTTRN>
<DTPOSTED>20260105
<TRNAMT>-150.00
<FITID>202601050001
<MEMO>PAGAMENTO FORNECEDOR XPTO
</STMTTRN>`;

describe("detectarOrigem", () => {
  it("reconhece OFX pela assinatura da marcação", () => {
    expect(detectarOrigem(OFX_UM_LANCAMENTO)).toBe("ofx");
    expect(detectarOrigem("OFXHEADER:100\nDATA:OFXSGML")).toBe("ofx");
  });

  it("reconhece CSV pela linha de cabeçalho com múltiplas colunas", () => {
    expect(detectarOrigem("Data;Histórico;Valor\n05/01/2026;Compra;-10,00")).toBe("csv");
    expect(detectarOrigem("data,descricao,valor\n05/01/2026,Compra,-10")).toBe("csv");
  });

  it("cai em texto quando não reconhece OFX nem um cabeçalho de CSV", () => {
    expect(detectarOrigem("05/01/2026  Pix recebido   100,00")).toBe("texto");
  });
});

describe("lerExtrato — detecção automática", () => {
  it("detecta e lê OFX sem precisar informar a origem", () => {
    const r = lerExtrato(OFX_UM_LANCAMENTO);
    expect(r.origem).toBe("ofx");
    expect(r.linhas).toHaveLength(1);
  });

  it("detecta e lê CSV sem precisar informar a origem", () => {
    const r = lerExtrato("Data;Descricao;Valor\n05/01/2026;Compra;-10,00");
    expect(r.origem).toBe("csv");
    expect(r.linhas).toHaveLength(1);
  });

  it("detecta e lê texto colado sem precisar informar a origem", () => {
    const r = lerExtrato("05/01/2026  Pix recebido   100,00");
    expect(r.origem).toBe("texto");
    expect(r.linhas).toHaveLength(1);
  });

  it("respeita a origem informada explicitamente, mesmo que a detecção pudesse divergir", () => {
    const r = lerExtrato(OFX_UM_LANCAMENTO, "ofx");
    expect(r.origem).toBe("ofx");
    expect(r.linhas).toHaveLength(1);
  });
});

describe("lerExtrato — período", () => {
  it("calcula início e fim do período pelas datas dos lançamentos lidos", () => {
    const csv = [
      "Data;Descricao;Valor",
      "15/01/2026;Compra;-10,00",
      "05/01/2026;Venda;50,00",
      "20/01/2026;Taxa;-2,00",
    ].join("\n");
    const r = lerExtrato(csv, "csv");
    expect(r.periodo).toEqual({ inicio: "2026-01-05", fim: "2026-01-20" });
  });

  it("período é null quando não há nenhum lançamento lido", () => {
    const r = lerExtrato("", "csv");
    expect(r.linhas).toEqual([]);
    expect(r.periodo).toBeNull();
  });
});

describe("calcularImpressaoDigital", () => {
  const base: LinhaBruta = {
    data: "2026-01-05",
    descricao: "Pagamento fornecedor",
    valor: -150,
    tipo: "saida",
    documento: "",
  };

  it("é determinística: mesma entrada produz sempre a mesma digital", () => {
    const d1 = calcularImpressaoDigital(base);
    const d2 = calcularImpressaoDigital({ ...base });
    expect(d1).toBe(d2);
  });

  it("com documento, a digital depende só do documento — nada mais entra na conta", () => {
    const a: LinhaBruta = { ...base, documento: "FIT-001" };
    const b: LinhaBruta = {
      ...base,
      documento: "FIT-001",
      valor: -999,
      descricao: "outra descrição",
    };
    expect(calcularImpressaoDigital(a)).toBe(calcularImpressaoDigital(b));
  });

  it("documento é comparado sem diferenciar maiúscula de minúscula", () => {
    const a: LinhaBruta = { ...base, documento: "ABC123" };
    const b: LinhaBruta = { ...base, documento: "abc123" };
    expect(calcularImpressaoDigital(a)).toBe(calcularImpressaoDigital(b));
  });

  it("documentos diferentes geram digitais diferentes", () => {
    const a: LinhaBruta = { ...base, documento: "001" };
    const b: LinhaBruta = { ...base, documento: "002" };
    expect(calcularImpressaoDigital(a)).not.toBe(calcularImpressaoDigital(b));
  });

  it("sem documento, muda a digital se mudar a data, o valor ou a descrição", () => {
    const referencia = calcularImpressaoDigital(base);
    expect(calcularImpressaoDigital({ ...base, data: "2026-01-06" })).not.toBe(referencia);
    expect(calcularImpressaoDigital({ ...base, valor: -151 })).not.toBe(referencia);
    expect(calcularImpressaoDigital({ ...base, descricao: "outra coisa" })).not.toBe(referencia);
  });

  it("sem documento, acento/maiúscula/pontuação na descrição não muda a digital", () => {
    const a: LinhaBruta = { ...base, descricao: "Pagamento Fornecedor!!" };
    const b: LinhaBruta = { ...base, descricao: "pagamento   fornecedor" };
    expect(calcularImpressaoDigital(a)).toBe(calcularImpressaoDigital(b));
  });

  it("sem documento, erro de ponto flutuante no centavo não quebra a digital", () => {
    const a: LinhaBruta = { ...base, valor: 0.1 + 0.2 }; // 0.30000000000000004 em JS puro
    const b: LinhaBruta = { ...base, valor: 0.3 };
    expect(calcularImpressaoDigital(a)).toBe(calcularImpressaoDigital(b));
  });
});

describe("mesmo lançamento em OFX e em CSV do mesmo banco produz digitais iguais", () => {
  it("quando o documento existe nos dois formatos", () => {
    // Mesmo banco, mesma transação: OFX traz FITID; o CSV do mesmo banco traz
    // o mesmo número na coluna "documento" — mas com descrição formatada
    // ligeiramente diferente (maiúscula no OFX, mista no CSV), como acontece
    // na prática entre os dois canais de exportação do mesmo banco.
    const ofx = `
<STMTTRN>
<DTPOSTED>20260112
<TRNAMT>-89.90
<FITID>7788990011
<MEMO>COMPRA CARTAO DEBITO SUPERMERCADO
</STMTTRN>`;
    const csv = [
      "Data;Histórico;Valor;Documento",
      "12/01/2026;Compra cartão débito supermercado;-89,90;7788990011",
    ].join("\n");

    const leituraOfx = lerExtrato(ofx, "ofx");
    const leituraCsv = lerExtrato(csv, "csv");

    expect(leituraOfx.linhas[0].impressaoDigital).toBe(leituraCsv.linhas[0].impressaoDigital);
  });
});

describe("sobreposição entre dois extratos (uso normal: semanal em cima de diário)", () => {
  it("a impressão digital identifica os lançamentos repetidos entre os dois envios", () => {
    const extratoSemana1 = [
      "Data;Descricao;Valor;Documento",
      "05/01/2026;Pix recebido;500,00;A1",
      "06/01/2026;Pagamento fornecedor;-150,00;A2",
    ].join("\n");

    // extrato mensal reenviado sobrepõe a semana 1 inteira e traz dias novos.
    const extratoMes = [
      "Data;Descricao;Valor;Documento",
      "05/01/2026;Pix recebido;500,00;A1",
      "06/01/2026;Pagamento fornecedor;-150,00;A2",
      "20/01/2026;Venda de produto;300,00;A3",
    ].join("\n");

    const leitura1 = lerExtrato(extratoSemana1, "csv");
    const leitura2 = lerExtrato(extratoMes, "csv");

    const digitaisJaImportadas = new Set(leitura1.linhas.map((l) => l.impressaoDigital));
    const novosDaSegundaLeitura = leitura2.linhas.filter(
      (l) => !digitaisJaImportadas.has(l.impressaoDigital),
    );

    expect(leitura2.linhas).toHaveLength(3);
    expect(novosDaSegundaLeitura).toHaveLength(1);
    expect(novosDaSegundaLeitura[0].documento).toBe("A3");
  });
});

describe("lerExtrato — categoria", () => {
  it("cada linha lida já nasce com a categoria sugerida por sugerirCategoria (classificar.ts)", () => {
    const csv = [
      "Data;Descricao;Valor",
      "05/01/2026;Facebook Ads campanha;-150,00",
      "06/01/2026;Pix recebido Hotmart;500,00",
    ].join("\n");
    const r = lerExtrato(csv, "csv");

    // a categoria de cada linha bate com a mesma função de palpite usada na
    // tela de conferência — não é recalculada nem duplicada em outro lugar.
    expect(r.linhas[0].categoria).toBe(sugerirCategoria("Facebook Ads campanha", "saida"));
    expect(r.linhas[1].categoria).toBe(sugerirCategoria("Pix recebido Hotmart", "entrada"));

    // valores concretos, para não travar só contra a própria função sob teste.
    expect(r.linhas[0].categoria).toBe("trafego");
    expect(r.linhas[1].categoria).toBe("vendas");
  });
});

describe("separarNovasDeDuplicadas", () => {
  it("sem nenhuma digital conhecida, tudo é novo", () => {
    const linhas = [{ impressaoDigital: "d1" }, { impressaoDigital: "d2" }];
    const { novas, duplicadas } = separarNovasDeDuplicadas(linhas, []);
    expect(novas).toEqual(linhas);
    expect(duplicadas).toEqual([]);
  });

  it("descarta as linhas cuja digital já está entre as conhecidas", () => {
    const linhas = [{ impressaoDigital: "d1" }, { impressaoDigital: "d2" }, { impressaoDigital: "d3" }];
    const { novas, duplicadas } = separarNovasDeDuplicadas(linhas, ["d2"]);
    expect(novas.map((l) => l.impressaoDigital)).toEqual(["d1", "d3"]);
    expect(duplicadas.map((l) => l.impressaoDigital)).toEqual(["d2"]);
  });

  it("a mesma digital repetida DENTRO do próprio lote conta como duplicada a partir da segunda ocorrência", () => {
    const linhas = [{ impressaoDigital: "d1" }, { impressaoDigital: "d1" }];
    const { novas, duplicadas } = separarNovasDeDuplicadas(linhas, []);
    expect(novas).toHaveLength(1);
    expect(duplicadas).toHaveLength(1);
  });
});

describe("reimportar o mesmo extrato duas vezes NÃO duplica lançamento", () => {
  /** Simula um "banco" mínimo: só guarda a digital de cada lançamento já gravado. */
  function bancoFalso() {
    const gravados = new Set<string>();
    return {
      gravar(linhas: { impressaoDigital: string }[]) {
        const { novas, duplicadas } = separarNovasDeDuplicadas(linhas, gravados);
        for (const l of novas) gravados.add(l.impressaoDigital);
        return { gravadas: novas.length, duplicadasIgnoradas: duplicadas.length };
      },
      total: () => gravados.size,
    };
  }

  it("a segunda importação do MESMO arquivo grava zero linhas novas", () => {
    const extrato = [
      "Data;Descricao;Valor;Documento",
      "05/01/2026;Pix recebido;500,00;A1",
      "06/01/2026;Pagamento fornecedor;-150,00;A2",
    ].join("\n");
    const banco = bancoFalso();

    const primeiraImportacao = banco.gravar(lerExtrato(extrato, "csv").linhas);
    expect(primeiraImportacao).toEqual({ gravadas: 2, duplicadasIgnoradas: 0 });
    expect(banco.total()).toBe(2);

    // dono reenvia o mesmo extrato (uso normal: exportou de novo por engano,
    // ou reenviou um período que já tinha mandado antes).
    const segundaImportacao = banco.gravar(lerExtrato(extrato, "csv").linhas);
    expect(segundaImportacao).toEqual({ gravadas: 0, duplicadasIgnoradas: 2 });
    expect(banco.total()).toBe(2); // nenhum lançamento a mais no "banco"
  });

  it("extrato semanal em cima de um mensal que já cobria o período: só o que é de fato novo entra", () => {
    const extratoMes1 = [
      "Data;Descricao;Valor;Documento",
      "05/01/2026;Pix recebido;500,00;A1",
      "06/01/2026;Pagamento fornecedor;-150,00;A2",
      "20/01/2026;Venda de produto;300,00;A3",
    ].join("\n");
    // semana seguinte, sobrepõe o fim de janeiro e traz um lançamento novo de fevereiro.
    const extratoSemanaSeguinte = [
      "Data;Descricao;Valor;Documento",
      "20/01/2026;Venda de produto;300,00;A3",
      "02/02/2026;Pix recebido;80,00;A4",
    ].join("\n");
    const banco = bancoFalso();

    banco.gravar(lerExtrato(extratoMes1, "csv").linhas);
    expect(banco.total()).toBe(3);

    const segunda = banco.gravar(lerExtrato(extratoSemanaSeguinte, "csv").linhas);
    expect(segunda).toEqual({ gravadas: 1, duplicadasIgnoradas: 1 });
    expect(banco.total()).toBe(4);
  });
});
