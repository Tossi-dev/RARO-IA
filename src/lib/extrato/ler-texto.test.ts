// Testes do leitor de texto colado — o dono cola o extrato copiado do app do
// banco. Regex linha a linha; linha que não casa não é erro, some da lista
// de linhas e aparece em naoEntendidas para a tela mostrar.

import { describe, expect, it } from "vitest";
import { lerTexto } from "./ler-texto";

describe("lerTexto", () => {
  it("extrai data, descrição e valor de um texto colado típico", () => {
    const texto = [
      "05/01/2026  Pix recebido João Silva          1.234,56",
      "06/01/2026  Pagamento fornecedor               -150,00",
    ].join("\n");

    const r = lerTexto(texto);
    expect(r.naoEntendidas).toEqual([]);
    expect(r.linhas).toEqual([
      {
        data: "2026-01-05",
        descricao: "Pix recebido João Silva",
        valor: 1234.56,
        tipo: "entrada",
        documento: "",
      },
      {
        data: "2026-01-06",
        descricao: "Pagamento fornecedor",
        valor: -150,
        tipo: "saida",
        documento: "",
      },
    ]);
  });

  it("uma linha suja no meio não trava a leitura — ela vai para naoEntendidas", () => {
    const texto = [
      "05/01/2026  Pix recebido            100,00",
      "--- extrato gerado em 07/08/2026 às 14:32 ---",
      "06/01/2026  Compra no débito         -50,00",
    ].join("\n");

    const r = lerTexto(texto);
    expect(r.linhas).toHaveLength(2);
    expect(r.naoEntendidas).toEqual(["--- extrato gerado em 07/08/2026 às 14:32 ---"]);
  });

  it("texto vazio devolve tudo vazio", () => {
    const r = lerTexto("");
    expect(r.linhas).toEqual([]);
    expect(r.naoEntendidas).toEqual([]);
  });

  it("linhas em branco entre lançamentos são ignoradas, sem virar naoEntendidas", () => {
    const texto = "05/01/2026  Pix recebido            100,00\n\n\n06/01/2026  Taxa   -5,00";
    const r = lerTexto(texto);
    expect(r.linhas).toHaveLength(2);
    expect(r.naoEntendidas).toEqual([]);
  });

  it("valor zero vira entrada, não gera erro", () => {
    const r = lerTexto("10/01/2026  Ajuste de saldo   0,00");
    expect(r.linhas).toEqual([
      {
        data: "2026-01-10",
        descricao: "Ajuste de saldo",
        valor: 0,
        tipo: "entrada",
        documento: "",
      },
    ]);
  });

  it("sinal do valor decide entrada ou saída, antes ou depois do número", () => {
    const texto = [
      "01/02/2026  Recebimento   200,00",
      "02/02/2026  Débito automático   80,00-",
    ].join("\n");
    const r = lerTexto(texto);
    expect(r.linhas[0].tipo).toBe("entrada");
    expect(r.linhas[1].tipo).toBe("saida");
    expect(r.linhas[1].valor).toBe(-80);
  });

  it("aceita data em aaaa-mm-dd", () => {
    const r = lerTexto("2026-03-15  Transferência recebida   500,00");
    expect(r.linhas[0].data).toBe("2026-03-15");
  });

  it("aceita data dd/mm sem ano (tela de internet banking que só mostra dia e mês), assumindo o ano corrente", () => {
    const anoAtual = new Date().getFullYear();
    const r = lerTexto("15/01  Compra no débito  -89,90");
    expect(r.linhas).toEqual([
      {
        data: `${anoAtual}-01-15`,
        descricao: "Compra no débito",
        valor: -89.9,
        tipo: "saida",
        documento: "",
      },
    ]);
  });

  it("extrai o exemplo completo dd/mm/aaaa do enunciado real, com múltiplos espaços", () => {
    const r = lerTexto("15/01/2024  PIX RECEBIDO JOAO  1.234,56");
    expect(r.linhas).toEqual([
      {
        data: "2024-01-15",
        descricao: "PIX RECEBIDO JOAO",
        valor: 1234.56,
        tipo: "entrada",
        documento: "",
      },
    ]);
  });

  it("aceita sufixo C (crédito) no lugar do sinal de mais", () => {
    const r = lerTexto("20/02/2026  Depósito em conta  1.234,56 C");
    expect(r.linhas[0].valor).toBe(1234.56);
    expect(r.linhas[0].tipo).toBe("entrada");
  });

  it("aceita sufixo D (débito) no lugar do sinal de menos", () => {
    const r = lerTexto("20/02/2026  Compra no débito  89,90 D");
    expect(r.linhas[0].valor).toBe(-89.9);
    expect(r.linhas[0].tipo).toBe("saida");
  });

  it("aceita sufixo C/D colado ao número, sem espaço", () => {
    const r = lerTexto("20/02/2026  Tarifa  15,00D");
    expect(r.linhas[0].valor).toBe(-15);
  });

  it("campos separados por tab também são reconhecidos", () => {
    const r = lerTexto("15/01/2024\tPIX RECEBIDO\t1.234,56");
    expect(r.linhas).toEqual([
      {
        data: "2024-01-15",
        descricao: "PIX RECEBIDO",
        valor: 1234.56,
        tipo: "entrada",
        documento: "",
      },
    ]);
  });
});

describe("sinal tipográfico no texto colado", () => {
  it("menos U+2212 vira saída, como no CSV do banco", () => {
    // Copiar da tela do internet banking traz o mesmo caractere U+2212 que o
    // CSV — o defeito era idêntico nos dois caminhos.
    const r = lerTexto("15/01/2026  PIX ENVIADO JOAO   −1.234,56");
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0].tipo).toBe("saida");
    expect(r.linhas[0].valor).toBe(-1234.56);
  });
});
