// O que estes testes protegem: a tradução do formato da biblioteca para o
// contrato. É o ponto em que uma conversa vai parar na ficha da pessoa errada,
// e esse erro só aparece semanas depois, com o histórico já embaralhado.

import { describe, expect, it } from "vitest";
import { loteParaContrato, mensagemParaContrato } from "../src/conversao.js";

/** Uma mensagem como whatsapp-web.js entrega, com o mínimo que importa. */
function msg(extra = {}) {
  return {
    id: { _serialized: "false_5514991234567@c.us_ABC123" },
    from: "5514991234567@c.us",
    to: "5511988887777@c.us",
    fromMe: false,
    body: "oi, quero saber da mentoria",
    timestamp: 1_723_300_000, // segundos, como a biblioteca manda
    type: "chat",
    ...extra,
  };
}

describe("mensagemParaContrato", () => {
  it("traduz mensagem recebida com o telefone de quem escreveu", () => {
    const r = mensagemParaContrato(msg(), { nomeExibicao: "Ana" });
    expect(r).toMatchObject({
      idExterno: "false_5514991234567@c.us_ABC123",
      canal: "whatsapp",
      direcao: "recebida",
      telefone: "5514991234567",
      nomeExibicao: "Ana",
      texto: "oi, quero saber da mentoria",
      tipoMidia: "",
    });
    expect(r.quando).toBe(new Date(1_723_300_000_000).toISOString());
  });

  it("na mensagem enviada, guarda o telefone do DESTINO e não o do dono", () => {
    const r = mensagemParaContrato(msg({ fromMe: true }));
    expect(r.direcao).toBe("enviada");
    // Se pegasse `from`, a conversa iria para a ficha do próprio dono.
    expect(r.telefone).toBe("5511988887777");
  });

  it("descarta grupo, status, canal e identidade sem telefone", () => {
    expect(mensagemParaContrato(msg({ from: "1203630@g.us" }))).toBeNull();
    expect(mensagemParaContrato(msg({ isStatus: true }))).toBeNull();
    expect(mensagemParaContrato(msg({ from: "123@newsletter" }))).toBeNull();
    expect(mensagemParaContrato(msg({ from: "199283@lid" }))).toBeNull();
    expect(mensagemParaContrato(msg({ from: "status@broadcast" }))).toBeNull();
  });

  it("descarta o que não dá para deduplicar nem datar", () => {
    expect(mensagemParaContrato(msg({ id: undefined }))).toBeNull();
    expect(mensagemParaContrato(msg({ timestamp: 0 }))).toBeNull();
    expect(mensagemParaContrato(msg({ timestamp: "banana" }))).toBeNull();
    // Milissegundos passados como se fossem segundos dariam ano 56000.
    expect(mensagemParaContrato(msg({ timestamp: 1_723_300_000_000 }))).toBeNull();
  });

  it("remonta o id quando a biblioteca não traz `_serialized`", () => {
    const r = mensagemParaContrato(
      msg({ id: { remote: "5514991234567@c.us", fromMe: false, id: "XYZ" } })
    );
    expect(r.idExterno).toBe("5514991234567@c.us_false_XYZ");
  });

  it("mantém mídia sem legenda, porque contato sem texto ainda é contato", () => {
    const r = mensagemParaContrato(msg({ type: "ptt", body: "" }));
    expect(r.texto).toBe("");
    expect(r.tipoMidia).toBe("audio");
    expect(mensagemParaContrato(msg({ type: "image" })).tipoMidia).toBe("imagem");
    expect(mensagemParaContrato(msg({ type: "document" })).tipoMidia).toBe("documento");
    // Tipo que a biblioteca inventar amanhã passa cru, em vez de virar null.
    expect(mensagemParaContrato(msg({ type: "poll_creation" })).tipoMidia).toBe("poll_creation");
  });

  it("corta texto gigante em vez de deixar a gravação falhar", () => {
    const r = mensagemParaContrato(msg({ body: "a".repeat(9000) }));
    expect(r.texto).toHaveLength(4000);
  });

  it("não explode com lixo", () => {
    expect(mensagemParaContrato(null)).toBeNull();
    expect(mensagemParaContrato("oi")).toBeNull();
    expect(mensagemParaContrato({})).toBeNull();
  });

  it("normaliza telefone escrito de qualquer jeito", () => {
    // Sem DDI e com o sufixo de aparelho que o WhatsApp às vezes acrescenta.
    expect(mensagemParaContrato(msg({ from: "14991234567:12@c.us" })).telefone).toBe(
      "5514991234567"
    );
  });
});

describe("loteParaContrato", () => {
  it("separa o que serve do que não serve e conta o descarte", () => {
    const r = loteParaContrato(
      [msg(), msg({ from: "1203630@g.us" }), msg({ id: undefined })],
      (m) => (m.fromMe ? "" : "Ana")
    );
    expect(r.mensagens).toHaveLength(1);
    expect(r.descartadas).toBe(2);
    expect(r.mensagens[0].nomeExibicao).toBe("Ana");
  });

  it("aceita entrada que não é lista sem quebrar o laço de captura", () => {
    expect(loteParaContrato(undefined)).toEqual({ mensagens: [], descartadas: 0 });
  });
});
