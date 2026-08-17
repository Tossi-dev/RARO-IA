import { describe, expect, it } from "vitest";
import type { MensagemRecebida } from "@/lib/atendimento/contrato";
import { planejarJuncao } from "./juncao";

function msg(over: Partial<MensagemRecebida> = {}): MensagemRecebida {
  return {
    idExterno: "id-1",
    canal: "whatsapp",
    direcao: "recebida",
    telefone: "5511987654321@c.us",
    nomeExibicao: "Ricardo",
    texto: "Jefson, fiz o diagnóstico no seu site.\n\n[JR-B1-T5-3-K7QM]",
    quando: "2026-08-14T09:00:00.000Z",
    tipoMidia: "",
    ...over,
  };
}

describe("planejarJuncao — o que junta e o que não junta", () => {
  it("a mensagem que a landing montou vira uma junção com o segmento lido", () => {
    const [j] = planejarJuncao([msg()]);
    expect(j.codigo).toBe("JR-B1-T5-3-K7QM");
    expect(j.segmento.travaDeclarada).toBe("T5");
    expect(j.segmento.travaDeTrabalho).toBe("T3"); // a regra da porta e do quarto
    expect(j.telefone).toBe("5511987654321");
    expect(j.nomeExibicao).toBe("Ricardo");
  });

  it("mensagem sem código não junta — é a maioria do que chega", () => {
    expect(planejarJuncao([msg({ texto: "bom dia, tudo bem?" })])).toEqual([]);
  });

  it("mensagem que NÓS enviamos não junta, mesmo carregando o código", () => {
    // O Jefson repetir o texto do lead para confirmar é normal. Juntar por
    // isso criaria uma ficha a partir da nossa própria fala.
    expect(planejarJuncao([msg({ direcao: "enviada" })])).toEqual([]);
  });

  it("conversa de grupo não junta", () => {
    expect(planejarJuncao([msg({ telefone: "1203630@g.us" })])).toEqual([]);
  });

  it("código com formato inválido não junta", () => {
    expect(planejarJuncao([msg({ texto: "[JR-B1-T5-3]" })])).toEqual([]);
    expect(planejarJuncao([msg({ texto: "[JR-Z9-T9-9-XXXX]" })])).toEqual([]);
  });

  it("código de recusa não junta: quem não passou nunca recebeu botão de WhatsApp", () => {
    expect(planejarJuncao([msg({ texto: "[JR-F-K7QM]" })])).toEqual([]);
  });
});

describe("planejarJuncao — o agente reenvia o histórico", () => {
  it("o mesmo código repetido no lote é UMA junção", () => {
    const plano = planejarJuncao([
      msg({ idExterno: "a" }),
      msg({ idExterno: "b" }),
      msg({ idExterno: "c" }),
    ]);
    expect(plano).toHaveLength(1);
  });

  it("fica com a mensagem MAIS ANTIGA — a data responde 'quando ele te procurou'", () => {
    const plano = planejarJuncao([
      msg({ idExterno: "tarde", quando: "2026-08-14T11:00:00.000Z" }),
      msg({ idExterno: "cedo", quando: "2026-08-14T06:00:00.000Z" }),
      msg({ idExterno: "meio", quando: "2026-08-14T09:00:00.000Z" }),
    ]);
    expect(plano[0].quando).toBe("2026-08-14T06:00:00.000Z");
  });

  it("a ordem em que o lote chega não muda o resultado", () => {
    const a = planejarJuncao([
      msg({ idExterno: "1", quando: "2026-08-14T06:00:00.000Z" }),
      msg({ idExterno: "2", quando: "2026-08-14T11:00:00.000Z" }),
    ]);
    const b = planejarJuncao([
      msg({ idExterno: "2", quando: "2026-08-14T11:00:00.000Z" }),
      msg({ idExterno: "1", quando: "2026-08-14T06:00:00.000Z" }),
    ]);
    expect(a).toEqual(b);
  });

  it("dois códigos diferentes no mesmo lote são duas junções", () => {
    const plano = planejarJuncao([
      msg({ idExterno: "a", telefone: "5511987654321", texto: "[JR-B1-T5-3-K7QM]" }),
      msg({ idExterno: "b", telefone: "5511911112222", texto: "[JR-A3-T3-0-ZZZZ]" }),
    ]);
    expect(plano).toHaveLength(2);
    expect(plano.map((j) => j.codigo).sort()).toEqual(["JR-A3-T3-0-ZZZZ", "JR-B1-T5-3-K7QM"]);
  });
});

describe("planejarJuncao — entradas que quebrariam um update escrito na pressa", () => {
  it("lote vazio, nulo ou indefinido devolve lista vazia", () => {
    expect(planejarJuncao([])).toEqual([]);
    expect(planejarJuncao(null as unknown as MensagemRecebida[])).toEqual([]);
    expect(planejarJuncao(undefined as unknown as MensagemRecebida[])).toEqual([]);
  });

  it("mensagem sem texto não quebra", () => {
    expect(planejarJuncao([msg({ texto: undefined as unknown as string })])).toEqual([]);
  });

  it("telefone irreconhecível não junta", () => {
    expect(planejarJuncao([msg({ telefone: "" })])).toEqual([]);
    expect(planejarJuncao([msg({ telefone: "abc" })])).toEqual([]);
  });
});
