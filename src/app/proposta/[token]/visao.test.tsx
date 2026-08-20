// Testes da página pública de proposta — a tela e a leitura.
//
// O QUE ESTA SUÍTE PROVA
// ----------------------
// 1) token fora de forma NÃO chega ao banco (o dublê estoura se for chamado);
// 2) vencida, inexistente, rascunho e token torto produzem marcação BYTE A
//    BYTE idêntica — qualquer diferença é pista para quem varre tokens;
// 3) a página não imprime id de oportunidade, responsável interno nem nada
//    além dos cinco campos que a função do banco devolve;
// 4) sem sal configurado, NENHUM hash é guardado — e a visita continua sendo
//    registrada;
// 5) a leitura passa por `rpc`, nunca por `.from()`;
// 6) zero emoji.

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const criarSupabaseServerMock = vi.fn();
const supabaseConfiguradoMock = vi.fn(() => true);
vi.mock("@/lib/supabase/server", () => ({ criarSupabaseServer: criarSupabaseServerMock }));
vi.mock("@/lib/data", () => ({ supabaseConfigurado: supabaseConfiguradoMock }));

const { PropostaVisao } = await import("./visao");
const { lerPropostaPublica, hashDeVisita, MOTIVO_INDISPONIVEL } = await import(
  "@/lib/comercial/dados-proposta"
);

const TOKEN = "aB3dEfGhIjKlMnOpQrStUv";
const SAL = "sal-de-teste";

type Resposta = { data: unknown; error: { code?: string } | null };

function cliente(resposta: Resposta = { data: [], error: null }) {
  const rpc = vi.fn((_nome: string, _args?: Record<string, unknown>) => Promise.resolve(resposta));
  criarSupabaseServerMock.mockReturnValue({
    rpc,
    from() {
      throw new Error("a leitura pública NÃO pode tocar em tabela");
    },
  });
  return rpc;
}

function linha(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    titulo: "Mentoria 6 meses",
    corpo: "Escopo e entregas",
    valor: 3000,
    validade: "2026-09-01",
    status: "enviada",
    ...over,
  };
}

const render = (p: Awaited<ReturnType<typeof lerPropostaPublica>>) =>
  renderToStaticMarkup(<PropostaVisao proposta={p} />);

afterEach(() => {
  vi.restoreAllMocks();
  supabaseConfiguradoMock.mockReturnValue(true);
});

describe("o token antes do banco", () => {
  it("token fora de forma não vira pergunta", async () => {
    // O dublê estoura em `.from()` e registra `rpc`: se o token torto
    // chegasse a qualquer um dos dois, o teste quebraria.
    const rpc = cliente();

    for (const torto of ["", "curto", "a".repeat(21), "a".repeat(129), "../../etc", "abc%2f", "a".repeat(22) + "/"]) {
      const r = await lerPropostaPublica(torto, "1.2.3.4", "curl", SAL);
      expect(r.encontrada).toBe(false);
      expect(r.motivo).toBe(MOTIVO_INDISPONIVEL);
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("a leitura passa por rpc e nunca por tabela", async () => {
    const rpc = cliente({ data: [linha()], error: null });

    const r = await lerPropostaPublica(TOKEN, "1.2.3.4", "Firefox", SAL);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe("proposta_publica");
    expect(r.encontrada).toBe(true);
    expect(r.titulo).toBe("Mentoria 6 meses");
  });
});

describe("todos os 'não' são o mesmo 'não'", () => {
  it("vencida, inexistente e rascunho respondem igual — e igual ao token torto", async () => {
    // A função do banco devolve zero linha nos três casos. O que este teste
    // trava é que a TELA não invente diferença depois.
    cliente({ data: [], error: null });
    const semLinha = await lerPropostaPublica(TOKEN, "1.2.3.4", "Firefox", SAL);
    const tokenTorto = await lerPropostaPublica("nao-serve", "1.2.3.4", "Firefox", SAL);

    expect(semLinha).toEqual(tokenTorto);
    expect(render(semLinha)).toBe(render(tokenTorto));
  });

  it("a frase não descreve o formato do token nem confirma existência", () => {
    const t = MOTIVO_INDISPONIVEL.toLowerCase();
    for (const pista of ["venc", "expir", "rascunho", "formato", "22", "caracter", "existe", "inválid"]) {
      expect(t, `a frase entregou "${pista}"`).not.toContain(pista);
    }
  });

  it("erro de banco é OUTRA coisa: não conectou", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    cliente({ data: null, error: { code: "42501" } });

    const r = await lerPropostaPublica(TOKEN, "", "", SAL);

    expect(r.conectado).toBe(false);
    expect(r.encontrada).toBe(false);
    // E a frase é a de "tente de novo", não a de "não está disponível":
    // aqui o sistema falhou, e dizer o contrário seria mentir para o cliente.
    expect(r.motivo).not.toBe(MOTIVO_INDISPONIVEL);
  });

  it("sem banco configurado, nem tenta", async () => {
    supabaseConfiguradoMock.mockReturnValue(false);
    const rpc = cliente();

    const r = await lerPropostaPublica(TOKEN, "", "", SAL);

    expect(rpc).not.toHaveBeenCalled();
    expect(r.conectado).toBe(false);
  });
});

describe("a visita", () => {
  it("com sal, manda hash — e nunca o IP", async () => {
    const rpc = cliente({ data: [linha()], error: null });

    await lerPropostaPublica(TOKEN, "203.0.113.7", "Mozilla/5.0", SAL);
    const argumentos = JSON.stringify(rpc.mock.calls[0][1]);

    expect(argumentos).not.toContain("203.0.113.7");
    expect(argumentos).not.toContain("Mozilla");
    expect(rpc.mock.calls[0][1]!.p_ip_hash).toMatch(/^[0-9a-f]{32}$/);
    expect(rpc.mock.calls[0][1]!.p_agente_hash).toMatch(/^[0-9a-f]{32}$/);
    expect(rpc.mock.calls[0][1]!.p_ip_hash).not.toBe(rpc.mock.calls[0][1]!.p_agente_hash);
  });

  it("SEM sal, não guarda hash nenhum — e a visita acontece do mesmo jeito", async () => {
    // Hash de IPv4 sem sal são quatro bilhões de possibilidades: sai por
    // força bruta. O que não dá para proteger não é guardado.
    const rpc = cliente({ data: [linha()], error: null });

    const r = await lerPropostaPublica(TOKEN, "203.0.113.7", "Mozilla/5.0", "");

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][1]!.p_ip_hash).toBe("");
    expect(rpc.mock.calls[0][1]!.p_agente_hash).toBe("");
    expect(r.encontrada).toBe(true);
  });

  it("o hash é estável com o mesmo sal e muda com sal diferente", () => {
    expect(hashDeVisita("203.0.113.7", SAL)).toBe(hashDeVisita("203.0.113.7", SAL));
    expect(hashDeVisita("203.0.113.7", SAL)).not.toBe(hashDeVisita("203.0.113.7", "outro"));
    expect(hashDeVisita("203.0.113.7", SAL)).not.toBe(hashDeVisita("203.0.113.8", SAL));
    expect(hashDeVisita("", SAL)).toBe("");
    expect(hashDeVisita(null, SAL)).toBe("");
  });
});

describe("a tela", () => {
  const achada = {
    conectado: true,
    motivo: "",
    encontrada: true,
    titulo: "Mentoria 6 meses",
    corpo: "Escopo e entregas",
    valor: 3000,
    validade: "2026-09-01",
    status: "enviada",
  };

  it("mostra os cinco campos e nada além deles", () => {
    const html = render(achada);

    expect(html).toContain("Mentoria 6 meses");
    expect(html).toContain("Escopo e entregas");
    expect(html).toContain("3.000");
    expect(html).toContain("Válida até");

    // O que não pode aparecer, nem por acidente de layout.
    for (const proibido of ["oportunidade", "aluno_id", "mentorado", "responsável", "etapa", "probabilidade", "token"]) {
      expect(html.toLowerCase(), `a tela imprimiu ${proibido}`).not.toContain(proibido.toLowerCase());
    }
  });

  it("proposta sem validade não inventa prazo", () => {
    const html = render({ ...achada, validade: null });
    expect(html).not.toContain("Válida até");
  });

  it("indisponível mostra a frase e não mostra valor nenhum", () => {
    const html = render({
      conectado: true,
      motivo: MOTIVO_INDISPONIVEL,
      encontrada: false,
      titulo: "",
      corpo: "",
      valor: 0,
      validade: null,
      status: "",
    });

    expect(html).toContain("não está disponível");
    expect(html).not.toContain("R$");
  });

  it("zero emoji", () => {
    const permitidos = new Set(["▲", "▼", "▬", "—", "·", "•", "→"]);
    for (const html of [render(achada), render({ ...achada, encontrada: false, motivo: MOTIVO_INDISPONIVEL })]) {
      for (const ch of html) {
        if (permitidos.has(ch)) continue;
        expect(/\p{Extended_Pictographic}/u.test(ch), `emoji: ${ch}`).toBe(false);
      }
    }
  });
});
