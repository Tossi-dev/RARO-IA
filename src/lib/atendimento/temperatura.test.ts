import { describe, expect, it } from "vitest";
import {
  CORTES,
  lerTemperatura,
  pesoDeAtencao,
  type FatoObservado,
} from "./temperatura";

const AGORA = new Date("2026-08-10T12:00:00.000Z");

/** Um fato há N dias, na direção pedida. */
function faz(diasAtras: number, direcao: "recebida" | "enviada", compra = false): FatoObservado {
  const d = new Date(AGORA.getTime() - diasAtras * 24 * 60 * 60 * 1000);
  return { quando: d.toISOString(), direcao, compra };
}

describe("ausência de dado não é frio", () => {
  it("sem nenhum fato, a temperatura é nula — não é um veredito", () => {
    // Este é o teste que protege a regra mais importante do arquivo. Tratar
    // "nunca conversamos" como "lead frio" faz o dono desistir de gente que
    // ele nunca abordou.
    const l = lerTemperatura([], AGORA);
    expect(l.temperatura).toBeNull();
    expect(l.confianca).toBeNull();
    expect(l.rotuloConfianca).toBeNull();
    expect(l.porque[0]).toContain("Nenhuma conversa registrada");
  });

  it("fato com data inválida é ignorado, não vira leitura", () => {
    const l = lerTemperatura([{ quando: "não é data", direcao: "recebida" }], AGORA);
    expect(l.temperatura).toBeNull();
  });
});

describe("temperatura por evento observado", () => {
  it("conversa de hoje é quente", () => {
    expect(lerTemperatura([faz(0, "enviada")], AGORA).temperatura).toBe("quente");
    expect(lerTemperatura([faz(CORTES.quenteAteDias, "enviada")], AGORA).temperatura).toBe("quente");
  });

  it("some para morno, frio e dormindo conforme o silêncio cresce", () => {
    expect(lerTemperatura([faz(10, "enviada")], AGORA).temperatura).toBe("morno");
    expect(lerTemperatura([faz(30, "enviada")], AGORA).temperatura).toBe("frio");
    expect(lerTemperatura([faz(90, "enviada")], AGORA).temperatura).toBe("dormindo");
  });

  it("cliente que falou e não teve resposta continua QUENTE, mesmo semanas depois", () => {
    // Não é desinteresse dele: é dívida nossa. Esfriar esse lead esconderia
    // justamente o erro que precisa aparecer.
    const l = lerTemperatura([faz(40, "recebida")], AGORA);
    expect(l.temperatura).toBe("quente");
    expect(l.esperandoResposta).toBe(true);
    expect(l.porque.join(" ")).toContain("A bola está com a gente");
  });

  it("depois do corte de dormindo, nem a dívida sustenta o quente", () => {
    const l = lerTemperatura([faz(CORTES.frioAteDias + 1, "recebida")], AGORA);
    expect(l.temperatura).toBe("dormindo");
    expect(l.esperandoResposta).toBe(true);
  });
});

describe("nota de confiança — mede evidência, não convicção", () => {
  it("um único fato antigo nunca produz confiança alta", () => {
    const l = lerTemperatura([faz(45, "enviada")], AGORA);
    expect(l.confianca).not.toBeNull();
    expect(l.confianca!).toBeLessThanOrEqual(40);
    expect(l.rotuloConfianca).not.toBe("alta");
  });

  it("conversa de mão dupla e recente sobe a confiança", () => {
    const l = lerTemperatura(
      [faz(9, "recebida"), faz(8, "enviada"), faz(3, "recebida"), faz(2, "enviada")],
      AGORA
    );
    expect(l.confianca!).toBeGreaterThanOrEqual(70);
    expect(l.rotuloConfianca).toBe("alta");
  });

  it("quem já comprou sustenta leitura melhor que quem só conversou", () => {
    const semCompra = lerTemperatura([faz(5, "recebida"), faz(4, "enviada")], AGORA);
    const comCompra = lerTemperatura(
      [faz(5, "recebida"), faz(4, "enviada", true)],
      AGORA
    );
    expect(comCompra.confianca!).toBeGreaterThan(semCompra.confianca!);
    expect(comCompra.porque.join(" ")).toContain("Já comprou");
  });

  it("sinal velho derruba a confiança mesmo com vários fatos", () => {
    const recente = lerTemperatura([faz(3, "enviada"), faz(2, "enviada"), faz(1, "enviada")], AGORA);
    const velho = lerTemperatura([faz(95, "enviada"), faz(94, "enviada"), faz(93, "enviada")], AGORA);
    expect(velho.confianca!).toBeLessThan(recente.confianca!);
  });

  it("a nota nunca sai da escala", () => {
    const muitos = Array.from({ length: 40 }, (_, i) => faz(i % 5, "recebida", true));
    const l = lerTemperatura(muitos, AGORA);
    expect(l.confianca!).toBeGreaterThanOrEqual(5);
    expect(l.confianca!).toBeLessThanOrEqual(100);
  });
});

describe("toda leitura carrega o porquê", () => {
  it("a lista de motivos nunca vem vazia e sempre traz data", () => {
    const l = lerTemperatura([faz(4, "recebida")], AGORA);
    expect(l.porque.length).toBeGreaterThan(0);
    // "06/08" — dia/mês do fato, para o dono conferir em vez de acreditar.
    expect(l.porque[0]).toMatch(/\d{2}\/\d{2}/);
  });

  it("a sugestão é uma frase, e muda com a situação", () => {
    const esperando = lerTemperatura([faz(2, "recebida")], AGORA);
    const parado = lerTemperatura([faz(120, "enviada", true)], AGORA);
    expect(esperando.sugestao).toContain("Responder");
    expect(parado.sugestao).toContain("já comprou");
  });
});

describe("pesoDeAtencao — quem vem primeiro na fila", () => {
  it("quem está esperando resposta fura a fila de qualquer temperatura", () => {
    const esperando = lerTemperatura([faz(20, "recebida")], AGORA);
    const quenteSemDivida = lerTemperatura([faz(0, "enviada"), faz(1, "recebida"), faz(0, "enviada")], AGORA);
    expect(pesoDeAtencao(esperando)).toBeGreaterThan(pesoDeAtencao(quenteSemDivida));
  });

  it("entre dois esperando, o que espera há mais tempo vem antes", () => {
    const a = lerTemperatura([faz(1, "recebida")], AGORA);
    const b = lerTemperatura([faz(9, "recebida")], AGORA);
    expect(pesoDeAtencao(b)).toBeGreaterThan(pesoDeAtencao(a));
  });

  it("quem não tem sinal nenhum não ocupa lugar na fila", () => {
    expect(pesoDeAtencao(lerTemperatura([], AGORA))).toBe(0);
  });
});

describe('a direção "evento" — compra não é mensagem', () => {
  const compra = (d: number): FatoObservado => ({
    quando: new Date(AGORA.getTime() - d * 24 * 60 * 60 * 1000).toISOString(),
    direcao: "evento",
    compra: true,
  });

  it("compra recente não cria dívida de resposta", () => {
    // Registrar a compra como "recebida" faria o cliente furar a fila como se
    // estivesse esperando resposta. Ele não está: ele comprou.
    const l = lerTemperatura([compra(1)], AGORA);
    expect(l.esperandoResposta).toBe(false);
    expect(l.temperatura).toBe("quente");
  });

  it("a frase do porquê não chama compra de mensagem", () => {
    const l = lerTemperatura([compra(2)], AGORA);
    expect(l.porque[0]).toContain("compra");
    expect(l.porque[0]).not.toContain("mensagem");
  });

  it("evento sustenta confiança como qualquer outro fato observado", () => {
    const soConversa = lerTemperatura([faz(3, "recebida"), faz(2, "enviada")], AGORA);
    const comCompra = lerTemperatura([faz(3, "recebida"), faz(2, "enviada"), compra(1)], AGORA);
    expect(comCompra.confianca!).toBeGreaterThan(soConversa.confianca!);
  });

  it("a bola volta para a gente se ele falar DEPOIS da compra", () => {
    const l = lerTemperatura([compra(5), faz(1, "recebida")], AGORA);
    expect(l.esperandoResposta).toBe(true);
  });
});
