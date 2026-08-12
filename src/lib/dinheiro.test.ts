import { describe, expect, it } from "vitest";
import { dinheiroDeCampo, dinheiroDeTexto } from "./dinheiro";

describe("dinheiroDeTexto", () => {
  it("lê o formato que o brasileiro digita", () => {
    // Era exatamente isto que quebrava: o campo mostrava "R$ 1.234,56" ao
    // lado e recusava "1.234,56" digitado.
    expect(dinheiroDeTexto("1.234,56")).toBe(1234.56);
    expect(dinheiroDeTexto("R$ 1.234,56")).toBe(1234.56);
    expect(dinheiroDeTexto("1.000.000,00")).toBe(1000000);
    expect(dinheiroDeTexto("0,50")).toBe(0.5);
    expect(dinheiroDeTexto("15")).toBe(15);
  });

  it("continua lendo o formato americano", () => {
    expect(dinheiroDeTexto("1234.56")).toBe(1234.56);
    expect(dinheiroDeTexto("1234")).toBe(1234);
  });

  it("resolve a ambiguidade do ponto pelo tamanho dos grupos", () => {
    expect(dinheiroDeTexto("1.234")).toBe(1234); // milhar
    expect(dinheiroDeTexto("1.23")).toBe(1.23); // decimal
    expect(dinheiroDeTexto("12.345.678")).toBe(12345678); // milhar encadeado
  });

  it("aceita negativo, inclusive com o menos tipográfico", () => {
    expect(dinheiroDeTexto("-1.234,56")).toBe(-1234.56);
    expect(dinheiroDeTexto("−1.234,56")).toBe(-1234.56);
    expect(dinheiroDeTexto("-R$ 10,00")).toBe(-10);
  });

  it("devolve null para o que não é número — nunca zero", () => {
    // Zero é um valor legítimo; confundir "não entendi" com "vale zero" faria
    // um erro de digitação virar saldo zerado em silêncio.
    expect(dinheiroDeTexto("abc")).toBeNull();
    expect(dinheiroDeTexto("12abc")).toBeNull();
    expect(dinheiroDeTexto("1,2,3")).toBeNull();
    expect(dinheiroDeTexto("1.2.3")).toBeNull();
    expect(dinheiroDeTexto("")).toBeNull();
    expect(dinheiroDeTexto("   ")).toBeNull();
  });
});

describe("dinheiroDeCampo", () => {
  it("campo em branco vira o padrão, não erro", () => {
    expect(dinheiroDeCampo("")).toBe(0);
    expect(dinheiroDeCampo(undefined)).toBe(0);
    expect(dinheiroDeCampo(null)).toBe(0);
    expect(dinheiroDeCampo("", 100)).toBe(100);
  });

  it("campo preenchido com lixo continua sendo erro", () => {
    expect(dinheiroDeCampo("abc")).toBeNull();
  });

  it("campo preenchido normal passa direto", () => {
    expect(dinheiroDeCampo("1.234,56")).toBe(1234.56);
  });
});
