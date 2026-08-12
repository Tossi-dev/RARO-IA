// Testes do estágio por evento observado.
//
// O que estes casos travam: o funil só se mexe por FATO COM DATA, e nunca por
// palpite. Cada teste abaixo é uma forma conhecida de o funil começar a mentir —
// cliente que sumiu continuar marcado como ativo, disparo nosso "qualificando"
// a base sozinho, silêncio virando escrita automática.

import { describe, expect, it } from "vitest";
import { CORTE_RISCO_DIAS, podeGravarSozinha, sugerirEstagio } from "./estagio";

const AGORA = new Date("2026-03-01T12:00:00.000Z");
const diasAtras = (n: number) => new Date(AGORA.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

describe("sugerirEstagio", () => {
  it("sem nenhum evento datado não sugere nada — não se decide sobre o nada", () => {
    const s = sugerirEstagio({ interacoes: [], compras: [], estagioAtual: null, agora: AGORA });
    expect(s.estagio).toBeNull();
    expect(s.mudar).toBe(false);
    expect(podeGravarSozinha(s)).toBe(false);
  });

  it("compra registrada leva a cliente, e o motivo traz a data da compra", () => {
    const s = sugerirEstagio({
      interacoes: [{ quando: diasAtras(5), direcao: "recebida" }],
      compras: [{ quando: diasAtras(2) }],
      estagioAtual: "em_conversa",
      agora: AGORA,
    });
    expect(s.estagio).toBe("cliente");
    expect(s.mudar).toBe(true);
    expect(s.inequivoca).toBe(true);
    expect(s.motivo).toContain("27/02/2026");
    expect(s.observadoEm).toBe(diasAtras(2));
  });

  it("primeira resposta do cliente leva a em conversa", () => {
    const s = sugerirEstagio({
      interacoes: [
        { quando: diasAtras(4), direcao: "enviada" },
        { quando: diasAtras(3), direcao: "recebida" },
      ],
      compras: [],
      estagioAtual: null,
      agora: AGORA,
    });
    expect(s.estagio).toBe("em_conversa");
    expect(s.inequivoca).toBe(true);
    expect(podeGravarSozinha(s)).toBe(true);
  });

  it("só mensagem NOSSA não move ninguém de estágio", () => {
    // Se movesse, bastaria disparar mensagem para a base inteira "entrar em
    // conversa" — o funil viraria função do nosso disparo, não do interesse
    // de quem recebeu.
    const s = sugerirEstagio({
      interacoes: [
        { quando: diasAtras(2), direcao: "enviada" },
        { quando: diasAtras(1), direcao: "enviada" },
      ],
      compras: [],
      estagioAtual: null,
      agora: AGORA,
    });
    expect(s.estagio).toBeNull();
    expect(podeGravarSozinha(s)).toBe(false);
  });

  it("silêncio acima do corte vence a compra antiga — cliente sumido não segue ativo", () => {
    const s = sugerirEstagio({
      interacoes: [{ quando: diasAtras(CORTE_RISCO_DIAS + 40), direcao: "recebida" }],
      compras: [{ quando: diasAtras(CORTE_RISCO_DIAS + 30) }],
      estagioAtual: "cliente",
      agora: AGORA,
    });
    expect(s.estagio).toBe("em_risco");
    expect(s.mudar).toBe(true);
  });

  it("em risco NUNCA grava sozinho: silêncio é ausência de evento, não evento", () => {
    const s = sugerirEstagio({
      interacoes: [{ quando: diasAtras(CORTE_RISCO_DIAS + 1), direcao: "recebida" }],
      compras: [],
      estagioAtual: "em_conversa",
      agora: AGORA,
    });
    expect(s.estagio).toBe("em_risco");
    expect(s.inequivoca).toBe(false);
    expect(podeGravarSozinha(s)).toBe(false);
  });

  it("compra recente segura o relógio do silêncio: quem comprou ontem não está sumido", () => {
    const s = sugerirEstagio({
      interacoes: [{ quando: diasAtras(CORTE_RISCO_DIAS + 50), direcao: "recebida" }],
      compras: [{ quando: diasAtras(1) }],
      estagioAtual: null,
      agora: AGORA,
    });
    expect(s.estagio).toBe("cliente");
  });

  it("sugestão igual ao estágio atual não pede mudança", () => {
    const s = sugerirEstagio({
      interacoes: [{ quando: diasAtras(1), direcao: "recebida" }],
      compras: [],
      estagioAtual: "em_conversa",
      agora: AGORA,
    });
    expect(s.estagio).toBe("em_conversa");
    expect(s.mudar).toBe(false);
    expect(podeGravarSozinha(s)).toBe(false);
  });

  it("data ilegível é descartada em vez de virar evento em 1970", () => {
    const s = sugerirEstagio({
      interacoes: [{ quando: "ontem de tarde", direcao: "recebida" }],
      compras: [],
      estagioAtual: null,
      agora: AGORA,
    });
    expect(s.estagio).toBeNull();
  });
});
