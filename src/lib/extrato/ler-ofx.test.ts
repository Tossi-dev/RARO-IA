// Testes do leitor de OFX/OFC — o formato mais confiável, porque traz FITID
// (identificador único por transação) e marcação previsível.

import { describe, expect, it } from "vitest";
import { calcularImpressaoDigital } from "./extrato";
import { lerCsv } from "./ler-csv";
import { lerOfx } from "./ler-ofx";

const OFX_DOIS_LANCAMENTOS = `
OFXHEADER:100
DATA:OFXSGML
VERSION:102

<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRANLIST>
<DTSTART>20260101
<DTEND>20260131
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260105120000[-3:GMT]
<TRNAMT>-150.00
<FITID>202601050001
<MEMO>PAGAMENTO FORNECEDOR
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260106
<TRNAMT>500.00
<FITID>202601060001
<MEMO>RECEBIMENTO CLIENTE
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`;

describe("lerOfx", () => {
  it("lê um OFX com dois lançamentos, um débito e um crédito", () => {
    const r = lerOfx(OFX_DOIS_LANCAMENTOS);
    expect(r.naoEntendidas).toEqual([]);
    expect(r.linhas).toEqual([
      {
        data: "2026-01-05",
        descricao: "PAGAMENTO FORNECEDOR",
        valor: -150,
        tipo: "saida",
        documento: "202601050001",
      },
      {
        data: "2026-01-06",
        descricao: "RECEBIMENTO CLIENTE",
        valor: 500,
        tipo: "entrada",
        documento: "202601060001",
      },
    ]);
  });

  it("extrato vazio devolve lista vazia, sem lançar", () => {
    const r = lerOfx("");
    expect(r.linhas).toEqual([]);
    expect(r.naoEntendidas).toEqual([]);
  });

  it("conteúdo sem nenhuma tag STMTTRN devolve lista vazia", () => {
    const r = lerOfx("<OFX><SIGNONMSGSRSV1></SIGNONMSGSRSV1></OFX>");
    expect(r.linhas).toEqual([]);
    expect(r.naoEntendidas).toEqual([]);
  });

  it("valor zero vira entrada, não gera erro", () => {
    const ofx = `
<STMTTRN>
<DTPOSTED>20260110
<TRNAMT>0.00
<FITID>202601100001
<MEMO>AJUSTE DE SALDO
</STMTTRN>`;
    const r = lerOfx(ofx);
    expect(r.linhas).toEqual([
      {
        data: "2026-01-10",
        descricao: "AJUSTE DE SALDO",
        valor: 0,
        tipo: "entrada",
        documento: "202601100001",
      },
    ]);
  });

  it("bloco sem DTPOSTED ou TRNAMT vai para naoEntendidas, sem travar a leitura das outras", () => {
    const ofx = `
<STMTTRN>
<TRNAMT>-50.00
<FITID>001
<MEMO>SEM DATA
</STMTTRN>
<STMTTRN>
<DTPOSTED>20260112
<FITID>002
<MEMO>SEM VALOR
</STMTTRN>
<STMTTRN>
<DTPOSTED>20260113
<TRNAMT>75.00
<FITID>003
<MEMO>ESSA VEIO CERTA
</STMTTRN>`;
    const r = lerOfx(ofx);
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0].documento).toBe("003");
    expect(r.naoEntendidas).toHaveLength(2);
  });

  it("usa NAME quando não há MEMO", () => {
    const ofx = `
<STMTTRN>
<DTPOSTED>20260115
<TRNAMT>10.00
<FITID>004
<NAME>LOJA XYZ
</STMTTRN>`;
    const r = lerOfx(ofx);
    expect(r.linhas[0].descricao).toBe("LOJA XYZ");
  });

  it("usa NAME quando MEMO vem com a tag presente mas vazia", () => {
    const ofx = `
<STMTTRN>
<DTPOSTED>20260116
<TRNAMT>25.00
<FITID>005
<MEMO></MEMO>
<NAME>LOJA VAZIA</NAME>
</STMTTRN>`;
    const r = lerOfx(ofx);
    expect(r.linhas[0].descricao).toBe("LOJA VAZIA");
  });

  it("lê OFX 2.0 em XML, com todas as tags fechadas", () => {
    const ofx = `
<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT</TRNTYPE>
<DTPOSTED>20260120000000</DTPOSTED>
<TRNAMT>-75.30</TRNAMT>
<FITID>XML0001</FITID>
<MEMO>COMPRA CARTAO</MEMO>
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;
    const r = lerOfx(ofx);
    expect(r.naoEntendidas).toEqual([]);
    expect(r.linhas).toEqual([
      {
        data: "2026-01-20",
        descricao: "COMPRA CARTAO",
        valor: -75.3,
        tipo: "saida",
        documento: "XML0001",
      },
    ]);
  });

  it("DTPOSTED com fuso -3:BRT (formato real do Itaú/BB) extrai a data corretamente", () => {
    const ofx = `
<STMTTRN>
<DTPOSTED>20240115120000[-3:BRT]
<TRNAMT>-42.00
<FITID>BRT001
<MEMO>TARIFA
</STMTTRN>`;
    const r = lerOfx(ofx);
    expect(r.linhas[0].data).toBe("2024-01-15");
  });

  it("DTPOSTED sem fuso nenhum, só data, também funciona", () => {
    const ofx = `
<STMTTRN>
<DTPOSTED>20240115
<TRNAMT>10.00
<FITID>SEMFUSO001
<MEMO>DEPOSITO
</STMTTRN>`;
    const r = lerOfx(ofx);
    expect(r.linhas[0].data).toBe("2024-01-15");
  });

  it("charset latin-1 declarado no cabeçalho: corrige mojibake do MEMO", () => {
    // Simula o que chega quando o arquivo é CP1252/ISO-8859-1 e algum trecho
    // do caminho decodificou os bytes como UTF-8: "PROMOÇÃO" vira
    // "PROMOÃ‡ÃƒO". A correção só deve acontecer porque o cabeçalho declara
    // CHARSET:1252 — sem essa declaração, o texto não seria mexido.
    const memoOriginal = "PROMOÇÃO ESPECIAL";
    const memoMojibake = Buffer.from(memoOriginal, "utf8").toString("latin1");
    const ofx = `OFXHEADER:100
DATA:OFXSGML
CHARSET:1252
VERSION:102

<STMTTRN>
<DTPOSTED>20260201
<TRNAMT>99.90
<FITID>CS001
<MEMO>${memoMojibake}
</STMTTRN>`;
    const r = lerOfx(ofx);
    expect(r.linhas[0].descricao).toBe(memoOriginal);
  });

  it("sem CHARSET:1252 no cabeçalho, não tenta corrigir o texto (evita mexer no que já está certo)", () => {
    const ofx = `
<STMTTRN>
<DTPOSTED>20260201
<TRNAMT>99.90
<FITID>CS002
<MEMO>João da Silva
</STMTTRN>`;
    const r = lerOfx(ofx);
    expect(r.linhas[0].descricao).toBe("João da Silva");
  });
});

describe("lerOfx — impressão digital estável entre formatos do mesmo banco", () => {
  it("o mesmo lançamento, com o mesmo documento, gera a mesma digital em OFX e em CSV", () => {
    const ofx = `
<STMTTRN>
<DTPOSTED>20260210
<TRNAMT>-320.50
<FITID>DOC998877
<MEMO>PAGAMENTO FORNECEDOR XPTO
</STMTTRN>`;
    const csv = ["Data;Histórico;Valor;Documento", "10/02/2026;Pagto Fornecedor XPTO;-320,50;DOC998877"].join(
      "\n",
    );

    const linhaOfx = lerOfx(ofx).linhas[0];
    const linhaCsv = lerCsv(csv).linhas[0];

    // digital deriva só do documento quando ele existe — por isso bate mesmo
    // com data/descrição/valor formatados de jeitos diferentes entre os dois
    // arquivos (é exatamente essa a garantia que evita duplicar lançamento
    // quando o dono reenvia o mesmo período em outro formato).
    expect(calcularImpressaoDigital(linhaOfx)).toBe(calcularImpressaoDigital(linhaCsv));
  });
});

describe("sinal tipográfico no OFX", () => {
  it("TRNAMT com menos U+2212 é lido como saída", () => {
    const ofx = [
      "<STMTTRN>",
      "<TRNTYPE>DEBIT",
      "<DTPOSTED>20260115",
      "<TRNAMT>−89.90",
      "<FITID>ABC123",
      "<MEMO>COMPRA CARTAO",
      "</STMTTRN>",
    ].join("\n");
    const r = lerOfx(ofx);
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0].valor).toBe(-89.9);
    expect(r.linhas[0].tipo).toBe("saida");
  });
});
