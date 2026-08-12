// Testes do plano de recepção — a decisão que os quatro providers compartilham.
//
// Três garantias, e todas já falharam em CRM de verdade:
//  1. a mesma mensagem nunca vira duas interações (o agente reenvia o histórico
//     ao reconectar; isso é desenho, não bug);
//  2. número conhecido cai na ficha certa mesmo escrito de outro jeito (o nono
//     dígito faz a mesma pessoa aparecer de quatro formas);
//  3. mensagem de grupo não entra na ficha de ninguém.

import { describe, expect, it } from "vitest";
import { planejarRecepcao } from "./recepcao";
import type { MensagemRecebida } from "./contrato";

function msg(over: Partial<MensagemRecebida> = {}): MensagemRecebida {
  return {
    idExterno: "MSG-1",
    canal: "whatsapp",
    direcao: "recebida",
    telefone: "5514991234567",
    nomeExibicao: "",
    texto: "oi",
    quando: "2026-03-01T10:00:00.000Z",
    tipoMidia: "",
    ...over,
  };
}

const CLIENTES = [{ id: "al-1", telefone: "(14) 99123-4567" }];

describe("planejarRecepcao", () => {
  it("número conhecido escrito de outro jeito cai na ficha existente, sem criar lead", () => {
    // O cadastro tem "(14) 99123-4567"; o WhatsApp entrega "5514991234567".
    const plano = planejarRecepcao([msg()], CLIENTES, new Set());
    expect(plano.leads).toHaveLength(0);
    expect(plano.interacoes).toHaveLength(1);
    expect(plano.interacoes[0].alunoId).toBe("al-1");
  });

  it("registro antigo sem o nono dígito é a mesma pessoa", () => {
    const plano = planejarRecepcao([msg()], [{ id: "al-9", telefone: "551491234567" }], new Set());
    expect(plano.leads).toHaveLength(0);
    expect(plano.interacoes[0].alunoId).toBe("al-9");
  });

  it("idExterno já gravado é ignorado, não regravado", () => {
    const plano = planejarRecepcao([msg()], CLIENTES, new Set(["MSG-1"]));
    expect(plano.interacoes).toHaveLength(0);
    expect(plano.ignoradas).toBe(1);
    expect(plano.idsExternosIgnorados).toEqual(["MSG-1"]);
  });

  it("a mesma mensagem repetida DENTRO do lote entra uma vez só", () => {
    // Histórico relido depois de uma reconexão traz a mesma mensagem duas vezes
    // no mesmo POST: sem a dedupe interna, uma chamada só já duplicaria.
    const plano = planejarRecepcao([msg(), msg()], CLIENTES, new Set());
    expect(plano.interacoes).toHaveLength(1);
    expect(plano.ignoradas).toBe(1);
  });

  it("número desconhecido vira UM lead com o nome de exibição do WhatsApp", () => {
    const plano = planejarRecepcao(
      [
        msg({ idExterno: "A", telefone: "5511988887777", nomeExibicao: "Joana da Padaria" }),
        msg({ idExterno: "B", telefone: "5511988887777", nomeExibicao: "Joana da Padaria" }),
      ],
      CLIENTES,
      new Set()
    );
    expect(plano.leads).toHaveLength(1);
    expect(plano.leads[0].nome).toBe("Joana da Padaria");
    expect(plano.interacoes.every((i) => i.chaveLead === plano.leads[0].chave)).toBe(true);
  });

  it("sem nome de exibição, o lead nasce com o telefone formatado", () => {
    const plano = planejarRecepcao([msg({ telefone: "5511988887777" })], [], new Set());
    expect(plano.leads[0].nome).toBe("(11) 98888-7777");
  });

  it("mensagem de grupo é descartada e nunca vira interação", () => {
    const plano = planejarRecepcao(
      [msg({ idExterno: "G1", telefone: "5514991234567-1600000000@g.us" })],
      CLIENTES,
      new Set()
    );
    expect(plano.interacoes).toHaveLength(0);
    expect(plano.leads).toHaveLength(0);
    expect(plano.descartadas).toBe(1);
  });

  it("jid de pessoa com sufixo de dispositivo é resolvido normalmente", () => {
    const plano = planejarRecepcao([msg({ telefone: "5514991234567:12@c.us" })], CLIENTES, new Set());
    expect(plano.interacoes[0].alunoId).toBe("al-1");
  });

  it("telefone irreconhecível é descartado, não vira lead com número remendado", () => {
    const plano = planejarRecepcao([msg({ telefone: "123" })], CLIENTES, new Set());
    expect(plano.descartadas).toBe(1);
    expect(plano.leads).toHaveLength(0);
  });

  it("mensagem descartada não reserva o idExterno contra uma mensagem boa", () => {
    // O descarte vem antes da marca de "já visto": se marcasse antes, uma
    // mensagem de grupo com o mesmo id bloquearia a mensagem legítima seguinte.
    const plano = planejarRecepcao(
      [msg({ idExterno: "X", telefone: "5514991234567@g.us" }), msg({ idExterno: "X" })],
      CLIENTES,
      new Set()
    );
    expect(plano.descartadas).toBe(1);
    expect(plano.interacoes).toHaveLength(1);
    expect(plano.ignoradas).toBe(0);
  });
  it("a interação guarda o telefone NORMALIZADO, não o que veio no campo", () => {
    // Por que existe: na planilha, a única coluna com cara de número era o
    // ID_Externo — e o ID_Externo do WhatsApp hoje começa com o identificador
    // interno ("36533109289004@lid_false_3A22…"), que parece telefone e não
    // disca. Quem abrisse a aba INTERACOES leria aquilo como o número do
    // cliente. Agora o número de verdade viaja junto com a mensagem.
    const plano = planejarRecepcao(
      [msg({ telefone: "(14) 99123-4567@c.us" })],
      CLIENTES,
      new Set()
    );
    expect(plano.interacoes[0].telefone).toBe("5514991234567");
  });

  it("o telefone da interação é o mesmo em mensagens escritas de formas diferentes", () => {
    // Duas grafias da mesma linha telefônica não podem virar dois telefones
    // diferentes na coluna: quem filtrar a planilha por número perderia metade
    // da conversa sem perceber.
    const plano = planejarRecepcao(
      [
        msg({ idExterno: "A", telefone: "+55 14 99123-4567" }),
        msg({ idExterno: "B", telefone: "5514991234567@c.us" }),
      ],
      CLIENTES,
      new Set()
    );
    expect(plano.interacoes.map((i) => i.telefone)).toEqual(["5514991234567", "5514991234567"]);
  });
});
