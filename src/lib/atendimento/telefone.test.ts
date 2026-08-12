import { describe, expect, it } from "vitest";
import {
  acharPorTelefone,
  chaveTelefone,
  formatarTelefone,
  jidDoTelefone,
  mesmoTelefone,
  normalizarTelefone,
  telefoneDoJid,
} from "./telefone";

describe("normalizarTelefone", () => {
  it("aceita as formas que uma pessoa digita de verdade", () => {
    expect(normalizarTelefone("(14) 99123-4567")).toBe("5514991234567");
    expect(normalizarTelefone("14 99123 4567")).toBe("5514991234567");
    expect(normalizarTelefone("+55 14 99123-4567")).toBe("5514991234567");
    expect(normalizarTelefone("5514991234567")).toBe("5514991234567");
  });

  it("descarta o zero de operadora e o DDD escrito como 011", () => {
    expect(normalizarTelefone("011 99123-4567")).toBe("5511991234567");
    expect(normalizarTelefone("0 14 3322-1100")).toBe("551433221100");
  });

  it("devolve vazio para o que não dá para afirmar que é telefone", () => {
    // Vazio é "não sei". Remendar um número curto inventaria DDD.
    expect(normalizarTelefone("")).toBe("");
    expect(normalizarTelefone("1234")).toBe("");
    expect(normalizarTelefone("abc")).toBe("");
  });
});

describe("chaveTelefone — o nono dígito", () => {
  it("mesma linha escrita com e sem o nono dígito dá a mesma chave", () => {
    // É o caso que faz um cliente virar dois no CRM.
    expect(chaveTelefone("5514991234567")).toBe(chaveTelefone("551491234567"));
    expect(mesmoTelefone("(14) 99123-4567", "14 9123-4567")).toBe(true);
  });

  it("linhas diferentes nunca colidem", () => {
    expect(mesmoTelefone("5514991234567", "5514991234568")).toBe(false);
    // Mesmo número local, DDD diferente: são pessoas diferentes.
    expect(mesmoTelefone("5514991234567", "5511991234567")).toBe(false);
  });

  it("fixo passa intacto — a regra do 9 é só de celular", () => {
    // Fixo tem 8 dígitos e começa com 2–5. Cortar dígito aqui faria dois fixos
    // diferentes virarem a mesma chave.
    expect(chaveTelefone("(14) 3322-1100")).toBe("551433221100");
    expect(mesmoTelefone("1433221100", "1432221100")).toBe(false);
  });

  it("celular que começa com 9 mas tem 8 dígitos não perde dígito", () => {
    // "9123-4567" é número local de 8 dígitos: já está sem o nono.
    expect(chaveTelefone("1491234567")).toBe("551491234567");
  });

  it("chave vazia não é igualdade — duas ignorâncias não se casam", () => {
    expect(mesmoTelefone("", "")).toBe(false);
    expect(mesmoTelefone("abc", "xyz")).toBe(false);
  });

  it("número com DDI estrangeiro passa sem a regra brasileira", () => {
    // Portugal: 351 + 9 dígitos. O 9 inicial do número local NÃO pode ser
    // cortado — a regra do nono dígito é uma coisa do Brasil.
    expect(chaveTelefone("+351 912 345 678")).toBe("351912345678");
    expect(mesmoTelefone("+351 912 345 678", "351912345678")).toBe(true);
  });

  it("o identificador interno do WhatsApp (@lid) NÃO vira telefone", () => {
    // Regressão de um caso real: o agente achou o contato pela biblioteca, mas
    // o contato era endereçado por `@lid`, e o número interno de 14 dígitos
    // passou pela faixa "DDI estrangeiro". Resultado: quatro fichas do mesmo
    // cliente no CRM, todas com telefone 36533109289004, que não existe.
    expect(normalizarTelefone("36533109289004")).toBe("");
    expect(normalizarTelefone("36533109289004@lid")).toBe("");
    expect(chaveTelefone("36533109289004")).toBe("");
    expect(telefoneDoJid("36533109289004@lid")).toBe("");
    // E o maior número real do mundo (13 dígitos com DDI) continua passando.
    expect(normalizarTelefone("+49 151 12345678")).toBe("4915112345678");
  });

  it("onze dígitos soltos são lidos como brasileiros — ambiguidade assumida", () => {
    // Não há como distinguir "14 99123-4567" de um número americano sem
    // contexto. O contexto deste produto é Brasil, e isso está documentado
    // no próprio normalizarTelefone.
    expect(normalizarTelefone("14155550101")).toBe("5514155550101");
    // E o nono dígito não é cortado aqui: o local começa com 1, não com 9.
    expect(chaveTelefone("14155550101")).toBe("5514155550101");
  });
});

describe("identificador do WhatsApp", () => {
  it("extrai o telefone do jid de pessoa", () => {
    expect(telefoneDoJid("5514991234567@c.us")).toBe("5514991234567");
    expect(telefoneDoJid("5514991234567@s.whatsapp.net")).toBe("5514991234567");
  });

  it("ignora o sufixo de dispositivo que o WhatsApp acrescenta", () => {
    expect(telefoneDoJid("5514991234567:12@c.us")).toBe("5514991234567");
  });

  it("mensagem de GRUPO não vira interação de ninguém", () => {
    // Grupo não pertence a um cliente. Casar isso com uma ficha encheria o
    // histórico de uma pessoa com conversa que não é dela.
    expect(telefoneDoJid("120363000000000000@g.us")).toBe("");
  });

  it("monta o jid a partir de um telefone do cadastro", () => {
    expect(jidDoTelefone("(14) 99123-4567")).toBe("5514991234567@c.us");
    expect(jidDoTelefone("lixo")).toBe("");
  });
});

describe("formatarTelefone", () => {
  it("celular e fixo saem na forma que o dono reconhece", () => {
    expect(formatarTelefone("5514991234567")).toBe("(14) 99123-4567");
    expect(formatarTelefone("551433221100")).toBe("(14) 3322-1100");
  });

  it("o que não é telefone brasileiro sai como veio, sem inventar máscara", () => {
    expect(formatarTelefone("")).toBe("");
    expect(formatarTelefone("+351 912 345 678")).toBe("351912345678");
  });
});

describe("acharPorTelefone", () => {
  const base = [
    { id: "a1", nome: "Maria", telefone: "(14) 99123-4567" },
    { id: "a2", nome: "João", telefone: "5511988887777" },
    { id: "a3", nome: "Sem telefone", telefone: "" },
  ];

  it("acha mesmo quando o cadastro e a mensagem escrevem o número diferente", () => {
    expect(acharPorTelefone(base, "551491234567")?.id).toBe("a1");
    expect(acharPorTelefone(base, "11 98888-7777")?.id).toBe("a2");
  });

  it("não acha ninguém quando o número não está na base", () => {
    expect(acharPorTelefone(base, "5514999990000")).toBeNull();
  });

  it("cadastro sem telefone nunca é escolhido por engano", () => {
    // Sem esta guarda, qualquer mensagem de número irreconhecível cairia na
    // ficha de quem não tem telefone cadastrado.
    expect(acharPorTelefone(base, "")).toBeNull();
    expect(acharPorTelefone(base, "lixo")).toBeNull();
  });
});
