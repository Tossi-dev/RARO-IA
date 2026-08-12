import { describe, expect, it } from "vitest";
import { mensagemParaContrato } from "../src/conversao.js";

const base = {
  id: { _serialized: "false_209876543210987@lid_ABC" },
  timestamp: 1786400000,
  type: "chat",
  body: "oi, quero saber do protocolo",
};

describe("endereço @lid — o que fazia a mensagem sumir", () => {
  it("sem telefone resolvido, mensagem de @lid continua sendo descartada", () => {
    // É o comportamento certo: sem saber de quem é, arquivar na ficha de
    // alguém seria inventar dono para a conversa.
    const m = mensagemParaContrato({ ...base, from: "209876543210987@lid", fromMe: false });
    expect(m).toBeNull();
  });

  it("com o telefone resolvido pelo contato, a mensagem entra normalmente", () => {
    const m = mensagemParaContrato(
      { ...base, from: "209876543210987@lid", fromMe: false },
      { telefone: "5514991234567", nomeExibicao: "Maria" }
    );
    expect(m).not.toBeNull();
    expect(m.telefone).toBe("5514991234567");
    expect(m.direcao).toBe("recebida");
    expect(m.nomeExibicao).toBe("Maria");
  });

  it("o telefone resolvido tem precedência sobre o endereço da mensagem", () => {
    // Conversa antiga em @c.us que o WhatsApp já migrou: os dois valores
    // existem, e quem manda é o que veio do contato.
    const m = mensagemParaContrato(
      { ...base, from: "5511999998888@c.us", fromMe: false },
      { telefone: "5514991234567" }
    );
    expect(m.telefone).toBe("5514991234567");
  });

  it("sem resolução nenhuma, o endereço @c.us continua funcionando como antes", () => {
    const m = mensagemParaContrato({ ...base, from: "5511999998888@c.us", fromMe: false });
    expect(m.telefone).toBe("5511999998888");
  });

  it("telefone resolvido vazio não atrapalha o caminho antigo", () => {
    const m = mensagemParaContrato(
      { ...base, from: "5511999998888@c.us", fromMe: false },
      { telefone: "" }
    );
    expect(m.telefone).toBe("5511999998888");
  });

  it("mensagem enviada pelo dono também usa o telefone resolvido", () => {
    const m = mensagemParaContrato(
      { ...base, to: "209876543210987@lid", fromMe: true },
      { telefone: "5514991234567" }
    );
    expect(m.direcao).toBe("enviada");
    expect(m.telefone).toBe("5514991234567");
  });
});

describe("o @lid disfarçado de telefone — a ficha fantasma", () => {
  it("identificador de 14 dígitos NÃO vira telefone de cliente", () => {
    // Caso real: a biblioteca respondeu com o contato, mas o contato era
    // endereçado por @lid e o `id.user` dele é "36533109289004". Catorze
    // dígitos passavam pela faixa "número estrangeiro" e o CRM ganhou quatro
    // fichas chamadas Tossi com um telefone que não existe.
    const m = mensagemParaContrato(
      { ...base, from: "36533109289004@lid", fromMe: false },
      { telefone: "36533109289004", nomeExibicao: "Tossi" }
    );
    expect(m).toBeNull();
  });

  it("o maior número real do mundo (13 dígitos) continua entrando", () => {
    const m = mensagemParaContrato(
      { ...base, from: "4915112345678@c.us", fromMe: false },
      { telefone: "4915112345678" }
    );
    expect(m?.telefone).toBe("4915112345678");
  });
});
