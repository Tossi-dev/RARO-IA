// Testes de `verificarCertificado` — a leitura da página PÚBLICA.
//
// O QUE ESTA SUÍTE PROVA
// ----------------------
// 1) código fora de forma é recusado ANTES de existir cliente de banco: quem
//    chega com lixo na URL não gera consulta nenhuma;
// 2) a leitura passa pela FUNÇÃO `verificar_certificado` (rpc), nunca por
//    `.from("certificado")` — a tabela não tem, e não pode ganhar, política
//    de select para `anon`;
// 3) "não encontrei" e "código mal formado" produzem a MESMA resposta. Uma
//    mensagem diferente para cada caso diria a quem está tentando adivinhar
//    que o formato dele estava certo — um oráculo de graça;
// 4) o log nunca carrega o nome de quem concluiu, nem o código.

import { afterEach, describe, expect, it, vi } from "vitest";

const criarSupabaseServerMock = vi.fn();
const supabaseConfiguradoMock = vi.fn(() => true);
vi.mock("../supabase/server", () => ({ criarSupabaseServer: criarSupabaseServerMock }));
vi.mock("../data", () => ({ supabaseConfigurado: supabaseConfiguradoMock }));

const { verificarCertificado } = await import("./dados-certificado");

const CODIGO = "ABC23456789K";
const LINHA = { aluno: "Maria de Souza", trilha: "Fundamentos", emitido_em: "2026-08-19T14:00:00Z" };

function cliente(resposta: { data: unknown; error: { code?: string; message?: string } | null }) {
  const rpc = vi.fn(() => Promise.resolve(resposta));
  const from = vi.fn(() => {
    throw new Error("verificarCertificado NAO pode consultar tabela direto");
  });
  const c = { rpc, from };
  criarSupabaseServerMock.mockReturnValue(c);
  return { rpc, from };
}

afterEach(() => {
  vi.restoreAllMocks();
  criarSupabaseServerMock.mockReset();
  supabaseConfiguradoMock.mockReturnValue(true);
});

describe("verificarCertificado — o que nem chega ao banco", () => {
  it.each([
    ["vazio", ""],
    ["curto", "ABC234"],
    ["longo", "ABC23456789KX"],
    ["com caractere ambíguo", "ABC234567I9K"],
    ["com zero", "ABC034567890"],
    ["com símbolo", "ABC-23456789"],
    ["injeção", "' or 1=1 --"],
  ])("código %s não gera consulta nenhuma", async (_nome, codigo) => {
    cliente({ data: [], error: null });
    const r = await verificarCertificado(codigo);

    expect(r.encontrado).toBe(false);
    expect(criarSupabaseServerMock).not.toHaveBeenCalled();
  });

  it("o que não é string também é recusado, sem lançar", async () => {
    cliente({ data: [], error: null });
    for (const valor of [null, undefined, 42, ["ABC23456789K"], { toString: () => CODIGO }]) {
      const r = await verificarCertificado(valor);
      expect(r.encontrado).toBe(false);
    }
    expect(criarSupabaseServerMock).not.toHaveBeenCalled();
  });

  it("sem Supabase configurado, diz que não conseguiu conferir — não diz que não existe", async () => {
    // A diferença importa para quem está do outro lado: "não consegui
    // conferir agora" é um problema nosso; "não encontrei" é uma afirmação
    // sobre o documento da pessoa.
    supabaseConfiguradoMock.mockReturnValue(false);
    cliente({ data: [], error: null });

    const r = await verificarCertificado(CODIGO);
    expect(r.conectado).toBe(false);
    expect(r.encontrado).toBe(false);
    expect(r.motivo).not.toBe("");
    expect(criarSupabaseServerMock).not.toHaveBeenCalled();
  });
});

describe("verificarCertificado — a consulta", () => {
  it("chama a FUNÇÃO do banco, com o código normalizado, e nunca a tabela", async () => {
    const { rpc, from } = cliente({ data: [LINHA], error: null });

    await verificarCertificado("  abc23456789k  ");

    expect(rpc).toHaveBeenCalledWith("verificar_certificado", { p_codigo: CODIGO });
    expect(from).not.toHaveBeenCalled();
  });

  it("linha encontrada vira o certificado, com os três campos e mais nada", async () => {
    cliente({ data: [LINHA], error: null });

    const r = await verificarCertificado(CODIGO);

    expect(r).toEqual({
      conectado: true,
      encontrado: true,
      motivo: "",
      codigo: CODIGO,
      aluno: "Maria de Souza",
      trilha: "Fundamentos",
      emitidoEm: "2026-08-19T14:00:00Z",
    });
  });

  it("a função devolvendo objeto único (e não array) também é entendida", async () => {
    // PostgREST devolve array para função que retorna table; um cliente
    // diferente pode entregar o objeto direto. Aceitar os dois evita um
    // "certificado não encontrado" que na verdade era formato de resposta.
    cliente({ data: LINHA, error: null });
    const r = await verificarCertificado(CODIGO);
    expect(r.encontrado).toBe(true);
    expect(r.aluno).toBe("Maria de Souza");
  });

  it("zero linhas: não encontrado, conectado, sem inventar motivo", async () => {
    cliente({ data: [], error: null });

    const r = await verificarCertificado(CODIGO);
    expect(r.conectado).toBe(true);
    expect(r.encontrado).toBe(false);
    expect(r.aluno).toBe("");
    expect(r.trilha).toBe("");
  });

  it("erro do banco não vira 'não encontrado'", async () => {
    cliente({ data: null, error: { code: "42883", message: "function does not exist" } });

    const r = await verificarCertificado(CODIGO);
    expect(r.conectado).toBe(false);
    expect(r.encontrado).toBe(false);
    expect(r.motivo).not.toBe("");
  });
});

describe("verificarCertificado — o que o log NÃO carrega", () => {
  it("nem o nome de quem concluiu, nem o código, nem a mensagem do banco", async () => {
    const avisos: unknown[][] = [];
    vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
      avisos.push(args);
    });
    cliente({ data: null, error: { code: "42501", message: `permission denied for ${CODIGO} de Maria` } });

    await verificarCertificado(CODIGO);

    const texto = avisos.map((a) => a.map(String).join(" ")).join(" | ");
    expect(texto).not.toContain(CODIGO);
    expect(texto).not.toContain("Maria");
    expect(texto).not.toContain("permission denied");
    expect(texto).toContain("42501");
  });

  it("um `code` absurdamente longo é cortado — o campo não é um canal de saída", async () => {
    // `code` costuma ter cinco caracteres, mas quem preenche é o provedor,
    // não nós. Sem o corte, esse campo vira um jeito de escrever qualquer
    // coisa no log do servidor a partir de uma resposta de terceiro.
    const avisos: unknown[][] = [];
    vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
      avisos.push(args);
    });
    cliente({ data: null, error: { code: "X".repeat(500) } });

    await verificarCertificado(CODIGO);

    const detalhe = String(avisos.at(-1)?.[1] ?? "");
    expect(detalhe.length).toBeLessThanOrEqual(40);
  });
});
