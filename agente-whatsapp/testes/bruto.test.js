import { describe, expect, it, vi } from "vitest";

// `whatsapp-web.js` arrasta o navegador embutido só de ser importado, e aqui
// não há navegador nenhum. O dublê existe para o arquivo poder ser carregado:
// nenhum teste deste arquivo toca a biblioteca de verdade.
vi.mock("qrcode-terminal", () => ({ default: { generate() {} } }));
vi.mock("whatsapp-web.js", () => ({
  default: { Client: class {}, LocalAuth: class {} },
  Client: class {},
  LocalAuth: class {},
}));

const { criarWhatsapp } = await import("../src/whatsapp.js");

// O objetivo aqui é UMA coisa: provar que o telefone é achado dentro do
// payload cru, sem nenhuma ida ao navegador. É o caminho que passou a ser o
// principal depois de a porta injetada da biblioteca parar de abrir.

const logMudo = { info() {}, aviso() {}, erro() {} };

function montar(capturadas) {
  return criarWhatsapp({
    config: { pastaSessao: "/tmp/x" },
    log: logMudo,
    aoCapturar: async (lote) => capturadas.push(...lote),
    aoConectar: async () => {},
  });
}

describe("telefone escondido no payload cru", () => {
  it("acha o telefone mesmo quando o endereço da conversa é @lid", async () => {
    // Este é o caso real: `from` é @lid e o telefone está em outro campo do
    // payload. A porta da biblioteca está quebrada, então só o cru resolve.
    const capturadas = [];
    const w = montar(capturadas);
    const msg = {
      id: { _serialized: "false_209876543210987@lid_A1" },
      from: "209876543210987@lid",
      fromMe: false,
      body: "oi",
      timestamp: 1786400000,
      type: "chat",
      _data: { notifyName: "Maria", senderPn: "5514991234567@c.us" },
    };
    await w.__capturarParaTeste(msg);
    expect(capturadas).toHaveLength(1);
    expect(capturadas[0]._telefoneContraparte).toBe("5514991234567");
    expect(capturadas[0]._nomeExibicao).toBe("Maria");
  });

  it("não confunde o telefone do PRÓPRIO dono com o do cliente", async () => {
    // Numa mensagem enviada, o número do dono está no payload e casaria
    // primeiro — arquivando a conversa na ficha dele mesmo.
    const capturadas = [];
    const w = montar(capturadas);
    w.__definirMeuJidParaTeste("5511999990000@c.us");
    const msg = {
      id: { _serialized: "true_209876543210987@lid_A2" },
      from: "5511999990000@c.us",
      to: "209876543210987@lid",
      fromMe: true,
      body: "resposta",
      timestamp: 1786400100,
      type: "chat",
      _data: { from: "5511999990000@c.us", recipientPn: "5514991234567@c.us" },
    };
    await w.__capturarParaTeste(msg);
    expect(capturadas[0]._telefoneContraparte).toBe("5514991234567");
  });

  it("sem nenhum endereço de telefone no payload, não inventa número", async () => {
    const capturadas = [];
    const w = montar(capturadas);
    const msg = {
      id: { _serialized: "false_209876543210987@lid_A3" },
      from: "209876543210987@lid",
      fromMe: false,
      body: "oi",
      timestamp: 1786400200,
      type: "chat",
      _data: { notifyName: "Sem telefone" },
    };
    await w.__capturarParaTeste(msg);
    expect(capturadas[0]._telefoneContraparte).toBe("");
  });
});

describe("a trava de repetição não pode engolir mensagem", () => {
  it("mensagens diferentes SEM id serializado continuam entrando", async () => {
    // O bug real: `String(objeto)` dá "[object Object]" para todas, a primeira
    // entrava e o resto virava "repetida". O sintoma foi "viu a primeira e
    // parou de escutar".
    const capturadas = [];
    const w = montar(capturadas);
    const base = {
      from: "5514991234567@c.us",
      fromMe: false,
      type: "chat",
      _data: { notifyName: "Maria" },
    };
    await w.__capturarParaTeste({ ...base, id: { remote: "x@c.us", id: "A1" }, timestamp: 1786400001, body: "oi" });
    await w.__capturarParaTeste({ ...base, id: { remote: "x@c.us", id: "A2" }, timestamp: 1786400002, body: "tudo bem?" });
    await w.__capturarParaTeste({ ...base, id: { remote: "x@c.us", id: "A3" }, timestamp: 1786400003, body: "como vai?" });
    expect(capturadas).toHaveLength(3);
  });

  it("a MESMA mensagem, chegando pelos dois eventos, entra uma vez só", async () => {
    const capturadas = [];
    const w = montar(capturadas);
    const msg = {
      id: { _serialized: "false_5514991234567@c.us_B1" },
      from: "5514991234567@c.us",
      fromMe: false,
      body: "oi",
      timestamp: 1786400010,
      type: "chat",
    };
    await w.__capturarParaTeste(msg);
    await w.__capturarParaTeste(msg);
    expect(capturadas).toHaveLength(1);
  });

  it("sem nada que sirva de chave, deixa passar em vez de engolir", async () => {
    const capturadas = [];
    const w = montar(capturadas);
    const semChave = { from: "5514991234567@c.us", fromMe: false, body: "a", type: "chat", timestamp: 1786400020, id: {} };
    await w.__capturarParaTeste(semChave);
    await w.__capturarParaTeste({ ...semChave, body: "b" });
    expect(capturadas.length).toBeGreaterThanOrEqual(2);
  });
});
