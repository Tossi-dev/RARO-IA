// O que estes testes protegem: o número de WhatsApp pessoal do dono.
//
// O limitador é a única coisa entre "o CRM aprovou 40 mensagens" e "o número
// disparou 40 mensagens em um minuto e foi banido". Por isso o teste não olha
// só o caso feliz: ele força a rajada e cobra o freio.

import { describe, expect, it } from "vitest";
import {
  INTERVALO_MINIMO_MS,
  JANELA_HORA_MS,
  LimitadorDeRitmo,
  MAXIMO_POR_HORA,
} from "../src/ritmo.js";

describe("LimitadorDeRitmo", () => {
  it("mantém os limites combinados: 1 a cada 20s e 30 por hora", () => {
    expect(INTERVALO_MINIMO_MS).toBe(20_000);
    expect(MAXIMO_POR_HORA).toBe(30);
  });

  it("libera o primeiro envio na hora", () => {
    const l = new LimitadorDeRitmo();
    expect(l.podeEnviar(1_000_000)).toBe(true);
  });

  it("segura o segundo envio até o intervalo vencer", () => {
    const l = new LimitadorDeRitmo();
    const t = 1_000_000;
    l.registrar(t);

    expect(l.podeEnviar(t + 1_000)).toBe(false);
    expect(l.esperaMs(t + 1_000)).toBe(19_000);
    expect(l.podeEnviar(t + 19_999)).toBe(false);
    expect(l.podeEnviar(t + 20_000)).toBe(true);
  });

  it("não deixa passar de 30 na hora, mesmo respeitando o intervalo", () => {
    const l = new LimitadorDeRitmo();
    let t = 1_000_000;

    // 30 envios espaçados de 20s: cada um é legal pelo intervalo, e a soma é
    // exatamente o que o teto por hora existe para conter.
    for (let i = 0; i < MAXIMO_POR_HORA; i++) {
      expect(l.podeEnviar(t)).toBe(true);
      l.registrar(t);
      t += INTERVALO_MINIMO_MS;
    }

    expect(l.podeEnviar(t)).toBe(false);
    // Só libera quando o mais antigo sair da janela de uma hora.
    const primeiro = 1_000_000;
    expect(l.esperaMs(t)).toBe(primeiro + JANELA_HORA_MS - t);
    expect(l.podeEnviar(primeiro + JANELA_HORA_MS)).toBe(true);
  });

  it("a janela desliza: passada a hora, o histórico velho não pesa mais", () => {
    const l = new LimitadorDeRitmo();
    const ultimo = 1_000_000 + (MAXIMO_POR_HORA - 1) * 1000;
    for (let i = 0; i < MAXIMO_POR_HORA; i++) l.registrar(1_000_000 + i * 1000);

    // Meia hora depois do primeiro, a janela ainda segura: o histórico sai aos
    // poucos, e não de uma vez.
    expect(l.podeEnviar(1_000_000 + JANELA_HORA_MS / 2)).toBe(false);

    const depois = ultimo + JANELA_HORA_MS + 1;
    expect(l.podeEnviar(depois)).toBe(true);
    expect(l.paraGuardar(depois)).toHaveLength(0);
  });

  it("o teto por hora sobrevive ao reinício do programa", () => {
    const t = 5_000_000;
    const anterior = new LimitadorDeRitmo();
    for (let i = 0; i < MAXIMO_POR_HORA; i++) anterior.registrar(t - 1000 * (i + 1));
    const guardado = anterior.paraGuardar(t);

    // Fechar e abrir a tampa não pode ser o jeito fácil de furar o limite.
    const novo = new LimitadorDeRitmo();
    novo.restaurar(guardado, t);
    expect(novo.podeEnviar(t)).toBe(false);
  });

  it("restaurar ignora lixo e data no futuro", () => {
    const l = new LimitadorDeRitmo();
    l.restaurar(["banana", null, 9_999_999_999_999], 1_000_000);
    expect(l.podeEnviar(1_000_000)).toBe(true);
  });

  it("aceita limites próprios para quem quiser testar outro ritmo", () => {
    const l = new LimitadorDeRitmo({ intervaloMs: 100, maximoPorHora: 2, janelaMs: 1000 });
    l.registrar(0);
    l.registrar(100);
    expect(l.podeEnviar(200)).toBe(false);
    expect(l.podeEnviar(1001)).toBe(true);
  });
});
