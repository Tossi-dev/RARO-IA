// Testes do leitor de CSV — cada banco tem o seu layout, então a cobertura
// aqui é sobre detecção: coluna por nome (tolerando acento/maiúscula),
// coluna única de valor vs. débito/crédito separados, e formato de número
// (BR vs. US) decidido pelo arquivo inteiro.

import { describe, expect, it } from "vitest";
import { lerCsv } from "./ler-csv";

describe("lerCsv — coluna única de valor", () => {
  it("lê CSV com coluna única de valor em formato brasileiro", () => {
    const csv = [
      "Data;Histórico;Valor;Documento",
      "05/01/2026;Pagamento fornecedor;-150,00;001",
      "06/01/2026;Recebimento cliente;1.234,56;002",
    ].join("\n");

    const r = lerCsv(csv);
    expect(r.naoEntendidas).toEqual([]);
    expect(r.linhas).toEqual([
      {
        data: "2026-01-05",
        descricao: "Pagamento fornecedor",
        valor: -150,
        tipo: "saida",
        documento: "001",
      },
      {
        data: "2026-01-06",
        descricao: "Recebimento cliente",
        valor: 1234.56,
        tipo: "entrada",
        documento: "002",
      },
    ]);
  });

  it("detecta as colunas por nome tolerando acento, maiúscula e variação", () => {
    const csv = ["DATA,DESCRICAO,VALOR", "10/02/2026,Compra no debito,-89.9"].join("\n");
    const r = lerCsv(csv);
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0].descricao).toBe("Compra no debito");
  });

  it("lê número em formato americano quando é esse o padrão do arquivo inteiro", () => {
    const csv = [
      "Data;Descricao;Valor",
      "01/03/2026;Venda;1,234.56",
      "02/03/2026;Taxa;-10.00",
    ].join("\n");
    const r = lerCsv(csv);
    expect(r.linhas[0].valor).toBe(1234.56);
    expect(r.linhas[1].valor).toBe(-10);
  });

  it("valor zero não gera erro e vira entrada", () => {
    const csv = ["Data;Descricao;Valor", "01/04/2026;Ajuste;0,00"].join("\n");
    const r = lerCsv(csv);
    expect(r.linhas[0]).toEqual({
      data: "2026-04-01",
      descricao: "Ajuste",
      valor: 0,
      tipo: "entrada",
      documento: "",
    });
  });

  it("linha cujo valor não dá para interpretar vai para naoEntendidas", () => {
    const csv = ["Data;Descricao;Valor", "01/05/2026;Sem valor;abc"].join("\n");
    const r = lerCsv(csv);
    expect(r.linhas).toEqual([]);
    expect(r.naoEntendidas).toEqual(["01/05/2026;Sem valor;abc"]);
  });
});

describe("lerCsv — colunas separadas de débito e crédito", () => {
  it("lê CSV com colunas separadas de débito e crédito", () => {
    const csv = [
      "Data;Histórico;Débito;Crédito",
      "05/01/2026;Pagamento fornecedor;150,00;",
      "06/01/2026;Recebimento cliente;;500,00",
    ].join("\n");

    const r = lerCsv(csv);
    expect(r.linhas).toEqual([
      {
        data: "2026-01-05",
        descricao: "Pagamento fornecedor",
        valor: -150,
        tipo: "saida",
        documento: "",
      },
      {
        data: "2026-01-06",
        descricao: "Recebimento cliente",
        valor: 500,
        tipo: "entrada",
        documento: "",
      },
    ]);
  });

  it("linha com débito e crédito em branco vira valor zero (entrada), não erro", () => {
    const csv = ["Data;Histórico;Débito;Crédito", "07/01/2026;Sem movimento;;"].join("\n");
    const r = lerCsv(csv);
    expect(r.linhas[0].valor).toBe(0);
    expect(r.linhas[0].tipo).toBe("entrada");
  });

  it('aceita "Entrada"/"Saída" como nomes alternativos das colunas de crédito/débito', () => {
    const csv = [
      "Data;Histórico;Saída;Entrada",
      "05/01/2026;Pagamento fornecedor;150,00;",
      "06/01/2026;Recebimento cliente;;500,00",
    ].join("\n");
    const r = lerCsv(csv);
    expect(r.linhas[0].valor).toBe(-150);
    expect(r.linhas[1].valor).toBe(500);
  });

  it("delimitador tab também é detectado", () => {
    const csv = ["Data\tHistórico\tValor", "05/01/2026\tVenda\t150,00"].join("\n");
    const r = lerCsv(csv);
    expect(r.linhas[0]).toEqual({
      data: "2026-01-05",
      descricao: "Venda",
      valor: 150,
      tipo: "entrada",
      documento: "",
    });
  });
});

describe("lerCsv — casos gerais", () => {
  it("CSV vazio (conteúdo em branco) devolve tudo vazio", () => {
    const r = lerCsv("");
    expect(r.linhas).toEqual([]);
    expect(r.naoEntendidas).toEqual([]);
  });

  it("CSV só com cabeçalho, sem nenhuma linha de dado, devolve lista vazia", () => {
    const r = lerCsv("Data;Descricao;Valor");
    expect(r.linhas).toEqual([]);
    expect(r.naoEntendidas).toEqual([]);
  });

  it("pula linhas de metadado antes do cabeçalho real (comum em export de banco)", () => {
    const csv = [
      "Extrato conta 12345-6",
      "Período: 01/01/2026 a 31/01/2026",
      "",
      "Data;Histórico;Valor",
      "15/01/2026;Compra;-42,00",
    ].join("\n");
    const r = lerCsv(csv);
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0].valor).toBe(-42);
  });

  it("data em formato aaaa-mm-dd também é aceita", () => {
    const csv = ["Data;Descricao;Valor", "2026-01-20;Transferência;30,00"].join("\n");
    const r = lerCsv(csv);
    expect(r.linhas[0].data).toBe("2026-01-20");
  });

  it("data que não bate com nenhum dos três formatos vai para naoEntendidas", () => {
    const csv = ["Data;Descricao;Valor", "20 de janeiro;Transferência;30,00"].join("\n");
    const r = lerCsv(csv);
    expect(r.linhas).toEqual([]);
    expect(r.naoEntendidas).toHaveLength(1);
  });

  it("sem coluna de valor identificável, todas as linhas de dado viram naoEntendidas", () => {
    const csv = ["Data;Descricao;Categoria", "20/01/2026;Compra;Mercado"].join("\n");
    const r = lerCsv(csv);
    expect(r.linhas).toEqual([]);
    expect(r.naoEntendidas).toEqual(["20/01/2026;Compra;Mercado"]);
  });

  it("remove o BOM UTF-8 do início do arquivo sem afetar a leitura", () => {
    const csv = "﻿" + ["Data;Descricao;Valor", "15/01/2026;Venda;150,00"].join("\n");
    const r = lerCsv(csv);
    expect(r.naoEntendidas).toEqual([]);
    expect(r.linhas).toEqual([
      { data: "2026-01-15", descricao: "Venda", valor: 150, tipo: "entrada", documento: "" },
    ]);
  });

  it('reconhece "Dt. Movimento" como coluna de data (abreviação real de banco)', () => {
    const csv = ["Dt. Movimento;Histórico;Valor", "22/03/2026;Pagamento boleto;-80,00"].join("\n");
    const r = lerCsv(csv);
    expect(r.linhas[0].data).toBe("2026-03-22");
  });

  it('reconhece "Nº doc" como coluna de documento', () => {
    const csv = ["Data;Descrição;Valor;Nº doc", "22/03/2026;Transferência;-80,00;77889"].join("\n");
    const r = lerCsv(csv);
    expect(r.linhas[0].documento).toBe("77889");
  });

  it('reconhece "Valor (R$)" como coluna de valor', () => {
    const csv = ["Data;Descrição;Valor (R$)", "22/03/2026;Recebimento;500,00"].join("\n");
    const r = lerCsv(csv);
    expect(r.linhas[0].valor).toBe(500);
  });

  it("separador vírgula funciona (com valor em formato US, sem ambiguidade com o delimitador)", () => {
    // Com "," como delimitador, um valor BR ("100,00") se confundiria com o
    // próprio separador de coluna — por isso o caso real de export com vírgula
    // vem em formato US ("100.00"), que este teste prova que é lido certo.
    const csv = ["Data,Descricao,Valor", "05/01/2026,Venda,100.00"].join("\n");
    const r = lerCsv(csv);
    expect(r.linhas[0].valor).toBe(100);
  });

  it("separador ponto e vírgula funciona com valor em formato BR", () => {
    const csv = ["Data;Descricao;Valor", "05/01/2026;Venda;100,00"].join("\n");
    const r = lerCsv(csv);
    expect(r.linhas[0].valor).toBe(100);
  });

  it("ignora linha de saldo do dia sem virar naoEntendida nem lançamento", () => {
    const csv = [
      "Data;Histórico;Valor",
      "15/01/2026;Compra;-42,00",
      ";Saldo do dia;1.500,00",
      "16/01/2026;Venda;300,00",
    ].join("\n");
    const r = lerCsv(csv);
    expect(r.linhas).toHaveLength(2);
    expect(r.naoEntendidas).toEqual([]);
  });

  it("ignora linha de saldo anterior mesmo quando ela traz uma data válida", () => {
    const csv = [
      "Data;Histórico;Valor",
      "01/01/2026;Saldo anterior;10.000,00",
      "02/01/2026;Venda;300,00",
    ].join("\n");
    const r = lerCsv(csv);
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0].descricao).toBe("Venda");
  });

  it("ignora total de créditos/débitos no rodapé do relatório", () => {
    const csv = [
      "Data;Histórico;Valor",
      "02/01/2026;Venda;300,00",
      ";Total de créditos;300,00",
      ";Total de débitos;0,00",
    ].join("\n");
    const r = lerCsv(csv);
    expect(r.linhas).toHaveLength(1);
    expect(r.naoEntendidas).toEqual([]);
  });
});

// ============================================================
// Extrato do Nubank — o formato que quebrou em produção
// ============================================================
//
// Reproduz a FORMA do arquivo que o cliente enviou (cabeçalho, ordem das
// colunas, sinal tipográfico U+2212, ausência de coluna "descrição"), com
// nomes inventados — extrato de gente de verdade não vira fixture de teste.
//
// Dois defeitos moravam aqui ao mesmo tempo:
//   1. o menos U+2212 era apagado junto com o "R$", e todo lançamento de
//      saída entrava como entrada;
//   2. não havia coluna de descrição, e a tela mostrava a coluna DESCRIÇÃO
//      vazia — deixando a categoria sem palpite e, pior, a impressão digital
//      dependente só de data + valor.

const CSV_NUBANK = [
  'data,hora,tipo,"origem / destino",valor,"forma de pagamento"',
  '2026-08-08,01:39,"Pix enviado","MARIA DE SOUZA LIMA","−R$ 10,00","Com saldo"',
  '2026-08-04,21:37,"Pix enviado","PIX Marketplace","−R$ 145,02","Com saldo"',
  '2026-07-24,23:20,"Compra realizada","Padaria do Centro","−R$ 74,50","Com saldo"',
  '2026-07-16,12:23,"Pagamento realizado",OPERADORA,"−R$ 337,30","Com saldo"',
  '2026-07-15,22:52,"Pix recebido","JOAO ALVES PEREIRA","+R$ 1.000,00",',
].join("\n");

describe("extrato do Nubank (sinal tipográfico e descrição em duas colunas)", () => {
  const r = lerCsv(CSV_NUBANK);

  it("lê todas as linhas, sem sobra", () => {
    expect(r.linhas).toHaveLength(5);
    expect(r.naoEntendidas).toHaveLength(0);
  });

  it("Pix enviado é SAÍDA — o defeito que fazia o caixa só crescer", () => {
    const enviados = r.linhas.filter((l) => l.descricao.startsWith("Pix enviado"));
    expect(enviados).toHaveLength(2);
    for (const l of enviados) {
      expect(l.tipo).toBe("saida");
      expect(l.valor).toBeLessThan(0);
    }
    expect(r.linhas[0].valor).toBe(-10);
    expect(r.linhas[1].valor).toBe(-145.02);
    expect(r.linhas[2].valor).toBe(-74.5);
    expect(r.linhas[3].valor).toBe(-337.3);
  });

  it("Pix recebido continua entrada", () => {
    const recebido = r.linhas[4];
    expect(recebido.tipo).toBe("entrada");
    expect(recebido.valor).toBe(1000);
  });

  it("o saldo do período fecha com a conta do banco", () => {
    const soma = r.linhas.reduce((s, l) => s + l.valor, 0);
    expect(soma).toBeCloseTo(1000 - 10 - 145.02 - 74.5 - 337.3, 2);
  });

  it("monta a descrição juntando o tipo e a contraparte", () => {
    expect(r.linhas[0].descricao).toBe("Pix enviado · MARIA DE SOUZA LIMA");
    expect(r.linhas[3].descricao).toBe("Pagamento realizado · OPERADORA");
  });

  it('não deixa "forma de pagamento" poluir a descrição', () => {
    // "Com saldo" se repete em toda linha e não distingue nada.
    for (const l of r.linhas) expect(l.descricao).not.toContain("Com saldo");
  });

  it("cada linha tem descrição própria — a digital não pode colidir", () => {
    const descricoes = new Set(r.linhas.map((l) => l.descricao));
    expect(descricoes.size).toBe(r.linhas.length);
    for (const l of r.linhas) expect(l.descricao).not.toBe("");
  });
});

describe("extrato exportado SEM sinal nenhum", () => {
  const semSinal = [
    "data,tipo,descricao,valor",
    "2026-08-08,Pix enviado,MARIA DE SOUZA,10,00",
    "2026-08-07,Compra realizada,Padaria,25,00",
    "2026-08-06,Pix recebido,JOAO ALVES,300,00",
  ].join("\n");

  it("usa a palavra do banco para achar a direção", () => {
    const r = lerCsv(semSinal);
    expect(r.linhas[0].tipo).toBe("saida");
    expect(r.linhas[0].valor).toBe(-10);
    expect(r.linhas[1].tipo).toBe("saida");
    expect(r.linhas[2].tipo).toBe("entrada");
    expect(r.linhas[2].valor).toBe(300);
  });

  it("um único valor negativo no arquivo desliga a correção — o sinal manda", () => {
    // Banco que sabe usar sinal é banco em que o sinal é a verdade. Aqui a
    // primeira linha diz "enviado" mas veio positiva: não mexemos, porque o
    // arquivo provou que sinaliza saída de outro jeito.
    const comUmNegativo = [
      "data,tipo,descricao,valor",
      "2026-08-08,Pix enviado,MARIA,10,00",
      "2026-08-07,Tarifa,Pacote,-3,00",
    ].join("\n");
    const r = lerCsv(comUmNegativo);
    expect(r.linhas[0].valor).toBe(10);
    expect(r.linhas[0].tipo).toBe("entrada");
  });

  it("extrato só de entradas passa intacto", () => {
    const soEntrada = [
      "data,tipo,descricao,valor",
      "2026-08-08,Pix recebido,MARIA,10,00",
      "2026-08-07,Pix recebido,JOAO,25,00",
    ].join("\n");
    const r = lerCsv(soEntrada);
    expect(r.linhas.every((l) => l.tipo === "entrada" && l.valor > 0)).toBe(true);
  });
});
