// Testes de `liberarNoPortal` — o interruptor entre "o mentor colou o link" e
// "o mentorado ve o link".
//
// O QUE ESTA SUITE PROVA
// ----------------------
// 1) O NOME DA COLUNA NUNCA VEM DO FORMULARIO. A acao aceita dois campos
//    conhecidos e mapeia cada um para uma coluna literal do codigo. Formulario
//    e entrada de usuario: se o nome da coluna viesse de la, um POST direto
//    escolheria QUAL coluna da tabela `sessao` escrever;
// 2) SO A FLAG PEDIDA E ESCRITA. O update carrega exatamente uma chave. Nem
//    `transcricao`, nem `link_gravacao`, nem a outra flag: liberar a gravacao
//    nao pode, de carona, publicar a transcricao;
// 3) DESLIGAR E TAO EXPLICITO QUANTO LIGAR. Qualquer valor que nao seja o "1"
//    combinado DESLIGA -- fail-closed. Um formulario truncado, um checkbox que
//    nao veio, um valor estranho: tudo isso esconde, nunca publica;
// 4) A ACAO NUNCA LANCA e nunca escreve quando a validacao falha.

import { beforeEach, describe, expect, it, vi } from "vitest";

const criarSupabaseServerMock = vi.fn();
const revalidatePathMock = vi.fn();
const redirectMock = vi.fn((destino: string) => {
  throw new Error(`REDIRECT:${destino}`);
});

vi.mock("../supabase/server", () => ({ criarSupabaseServer: criarSupabaseServerMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

const { liberarNoPortal, MOTIVO_CAMPO_INVALIDO, MOTIVO_ERRO_GRAVAR } = await import("./acoes-liberacao");

interface Chamada {
  update: Record<string, unknown>;
  eq: [string, unknown][];
}

function supabaseDuble(erro: { code?: string; message?: string } | null = null) {
  const chamadas: Chamada[] = [];
  const cliente = {
    from(tabela: string) {
      if (tabela !== "sessao") throw new Error(`tabela inesperada: ${tabela}`);
      const registro: Chamada = { update: {}, eq: [] };
      const encadeado = {
        update(valores: Record<string, unknown>) {
          registro.update = valores;
          chamadas.push(registro);
          return encadeado;
        },
        eq(coluna: string, valor: unknown) {
          registro.eq.push([coluna, valor]);
          return Promise.resolve({ error: erro });
        },
      };
      return encadeado;
    },
  };
  return { cliente, chamadas };
}

function formulario(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

async function erroDoRedirect(promessa: Promise<unknown>): Promise<string> {
  try {
    await promessa;
    return "";
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    const destino = m.startsWith("REDIRECT:") ? m.slice("REDIRECT:".length) : "";
    const q = destino.split("?erro=")[1] ?? "";
    return decodeURIComponent(q);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("liberarNoPortal", () => {
  it("liga a gravacao escrevendo UMA unica coluna, escopada pelo id da sessao", async () => {
    const { cliente, chamadas } = supabaseDuble();
    criarSupabaseServerMock.mockReturnValue(cliente);

    await liberarNoPortal(
      formulario({ mentoradoId: "ment-1", sessaoId: "ses-1", campo: "gravacao", valor: "1" }),
    );

    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].update).toEqual({ gravacao_liberada: true });
    expect(chamadas[0].eq).toEqual([["id", "ses-1"]]);
  });

  it("liga a transcricao sem tocar na gravacao nem no texto", async () => {
    const { cliente, chamadas } = supabaseDuble();
    criarSupabaseServerMock.mockReturnValue(cliente);

    await liberarNoPortal(
      formulario({ mentoradoId: "ment-1", sessaoId: "ses-1", campo: "transcricao", valor: "1" }),
    );

    expect(chamadas[0].update).toEqual({ transcricao_liberada: true });
    expect(Object.keys(chamadas[0].update)).toHaveLength(1);
  });

  // O valor combinado e "1". Qualquer outra coisa DESLIGA -- inclusive as
  // variantes que "parecem" verdadeiras. E o lado seguro: o erro possivel e
  // esconder algo que ja estava publico, nunca publicar algo que estava
  // escondido sem alguem ter pedido.
  it.each([["0"], [""], ["true"], ["on"], ["sim"], [" 1"], ["01"], ["2"]])(
    "valor %j desliga em vez de ligar",
    async (valor) => {
      const { cliente, chamadas } = supabaseDuble();
      criarSupabaseServerMock.mockReturnValue(cliente);

      await liberarNoPortal(
        formulario({ mentoradoId: "ment-1", sessaoId: "ses-1", campo: "gravacao", valor }),
      );

      expect(chamadas[0].update).toEqual({ gravacao_liberada: false });
    },
  );

  it("campo ausente do formulario tambem desliga, nunca liga", async () => {
    const { cliente, chamadas } = supabaseDuble();
    criarSupabaseServerMock.mockReturnValue(cliente);

    await liberarNoPortal(formulario({ mentoradoId: "ment-1", sessaoId: "ses-1", campo: "gravacao" }));

    expect(chamadas[0].update).toEqual({ gravacao_liberada: false });
  });

  // O ataque que este teste representa: um POST direto mandando `campo` com o
  // nome de outra coluna. Se a acao interpolasse o valor recebido, daria para
  // escrever em qualquer coluna de `sessao`.
  // Nao entra aqui o apelido "transcricao": ele e VALIDO e aponta para a flag
  // `transcricao_liberada`, nao para a coluna de texto de mesmo nome. A
  // colisao de nomes e o motivo de o mapa de apelidos existir -- sem ele,
  // "transcricao" no formulario e a coluna `transcricao` seriam a mesma coisa.
  it.each([
    ["transcricao_liberada "],
    ["link_gravacao"],
    ["status"],
    ["workspace_id"],
    ["gravacao_liberada"],
    ["GRAVACAO"],
    [""],
  ])("campo %j fora da lista de permitidos nao escreve nada", async (campo) => {
    const { cliente, chamadas } = supabaseDuble();
    criarSupabaseServerMock.mockReturnValue(cliente);

    const erro = await erroDoRedirect(
      liberarNoPortal(formulario({ mentoradoId: "ment-1", sessaoId: "ses-1", campo, valor: "1" })),
    );

    expect(chamadas).toHaveLength(0);
    expect(erro).toBe(MOTIVO_CAMPO_INVALIDO);
  });

  it("sessaoId vazio nao escreve nada", async () => {
    const { cliente, chamadas } = supabaseDuble();
    criarSupabaseServerMock.mockReturnValue(cliente);

    await erroDoRedirect(
      liberarNoPortal(formulario({ mentoradoId: "ment-1", sessaoId: "   ", campo: "gravacao", valor: "1" })),
    );

    expect(chamadas).toHaveLength(0);
  });

  it("erro do banco vira mensagem humana e nao revalida", async () => {
    const { cliente } = supabaseDuble({ code: "42501", message: "permission denied for table sessao" });
    criarSupabaseServerMock.mockReturnValue(cliente);

    const erro = await erroDoRedirect(
      liberarNoPortal(formulario({ mentoradoId: "ment-1", sessaoId: "ses-1", campo: "gravacao", valor: "1" })),
    );

    expect(erro).toBe(MOTIVO_ERRO_GRAVAR);
    expect(erro).not.toContain("permission denied");
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("sucesso revalida a ficha do mentorado e a carteira", async () => {
    const { cliente } = supabaseDuble();
    criarSupabaseServerMock.mockReturnValue(cliente);

    await liberarNoPortal(
      formulario({ mentoradoId: "ment-1", sessaoId: "ses-1", campo: "gravacao", valor: "1" }),
    );

    expect(revalidatePathMock).toHaveBeenCalledWith("/mentoria/ment-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal");
  });

  it("cliente do Supabase que lanca nao derruba a acao", async () => {
    criarSupabaseServerMock.mockImplementation(() => {
      throw new Error("sem cookie de sessao");
    });

    const erro = await erroDoRedirect(
      liberarNoPortal(formulario({ mentoradoId: "ment-1", sessaoId: "ses-1", campo: "gravacao", valor: "1" })),
    );

    expect(erro).toBe(MOTIVO_ERRO_GRAVAR);
    expect(erro).not.toContain("cookie");
  });
});
