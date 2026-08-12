// Testes do sinal de vida do agente local.
//
// A garantia central: a tela NUNCA pode dizer "conectado" apoiada num pulso
// velho. No desenho escolhido o WhatsApp só funciona com o notebook do dono
// aberto — o notebook fecha no meio da noite e o último pulso fica dizendo
// `sessaoAberta: true` para sempre. Sem o corte por tempo, o dono aprovaria
// mensagens que ficam paradas na fila achando que já saíram.

import { beforeEach, describe, expect, it } from "vitest";
import { esquecerPulso, estadoDoAgente, PULSO_VALIDO_MINUTOS, QR_VALIDO_SEGUNDOS, registrarPulso } from "./pulso";
import type { PulsoAgente } from "./contrato";

const AGORA = new Date("2026-03-01T12:00:00.000Z");
const minutosAtras = (n: number) => new Date(AGORA.getTime() - n * 60000).toISOString();

describe("estadoDoAgente", () => {
  beforeEach(esquecerPulso);

  it("sem nenhum pulso, o estado é desligado e sem data inventada", () => {
    const e = estadoDoAgente(AGORA);
    expect(e.ligado).toBe(false);
    expect(e.minutosDesdeUltimoPulso).toBeNull();
    expect(e.visto).toBe("");
  });

  it("pulso recente com sessão aberta é o único caso de 'ligado'", () => {
    registrarPulso({ visto: minutosAtras(1), sessaoAberta: true, precisaQr: false, versao: "0.1.0" });
    expect(estadoDoAgente(AGORA).ligado).toBe(true);
  });

  it("pulso velho não conta como ligado, mesmo dizendo que a sessão estava aberta", () => {
    registrarPulso({
      visto: minutosAtras(PULSO_VALIDO_MINUTOS + 1),
      sessaoAberta: true,
      precisaQr: false,
      versao: "0.1.0",
    });
    const e = estadoDoAgente(AGORA);
    expect(e.ligado).toBe(false);
    expect(e.minutosDesdeUltimoPulso).toBe(PULSO_VALIDO_MINUTOS + 1);
  });

  it("agente vivo mas com a sessão caída não está ligado — e o pedido de QR aparece", () => {
    registrarPulso({ visto: minutosAtras(0), sessaoAberta: false, precisaQr: true, versao: "0.1.0" });
    const e = estadoDoAgente(AGORA);
    expect(e.ligado).toBe(false);
    expect(e.precisaQr).toBe(true);
  });
});

describe("QR do WhatsApp — relógio próprio, mais curto que o do pulso", () => {
  beforeEach(() => esquecerPulso());

  const AGORA = new Date("2026-08-10T12:00:00.000Z");
  const pulso = (segundosAtras: number, qr?: string): PulsoAgente => ({
    visto: new Date(AGORA.getTime() - segundosAtras * 1000).toISOString(),
    sessaoAberta: false,
    precisaQr: true,
    versao: "1.0.0",
    qr,
  });

  it("QR recente é entregue para a tela desenhar", () => {
    registrarPulso(pulso(5, "2@abc,def,ghi"));
    expect(estadoDoAgente(AGORA).qr).toBe("2@abc,def,ghi");
  });

  it("QR vencido NÃO é entregue — pior que nenhum", () => {
    // O WhatsApp troca o código a cada ~20s. Desenhar um vencido faz a pessoa
    // apontar o celular, nada acontecer, e concluir que o sistema quebrou.
    registrarPulso(pulso(QR_VALIDO_SEGUNDOS + 1, "2@abc,def,ghi"));
    expect(estadoDoAgente(AGORA).qr).toBeNull();
  });

  it("pulso ainda válido como sinal de vida pode ter QR já vencido", () => {
    // Dois relógios diferentes de propósito: 2 minutos é vida, e é morte para QR.
    registrarPulso(pulso(120, "2@abc"));
    const e = estadoDoAgente(AGORA);
    expect(e.minutosDesdeUltimoPulso).toBe(2);
    expect(e.qr).toBeNull();
  });

  it("pulso sem QR devolve null, nunca string vazia", () => {
    registrarPulso(pulso(1));
    expect(estadoDoAgente(AGORA).qr).toBeNull();
    registrarPulso(pulso(1, "   "));
    expect(estadoDoAgente(AGORA).qr).toBeNull();
  });

  it("sem nenhum pulso, não há QR", () => {
    expect(estadoDoAgente(AGORA).qr).toBeNull();
  });
});
