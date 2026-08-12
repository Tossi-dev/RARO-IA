// Testes da SELECAO do provider de dados -- vitest.
//
// Por que este arquivo existe: a regra travada aqui e a unica do projeto que,
// se quebrar, nao gera erro nenhum. O app sobe, compila, responde 200 -- e
// mostra o numero errado. Ja aconteceu: sem nenhuma variavel definida a selecao
// caiu no provider de demonstracao em producao, e o dono leu faturamento, meta
// de afiliado e parcelas vencidas que nunca existiram. Um teste de tipo nao pega
// isso e um build verde tambem nao. So um teste de comportamento pega.
//
// A regra que estes casos protegem: dado fabricado exige pedido explicito
// (RARO_MODO=demo). Na falta de configuracao o modo e `vazio`, nunca `demo`.

import { describe, expect, it } from "vitest";
import { demoProvider } from "./demo-db";
import { getDB, modoDados, planilhaConfigurada, supabaseConfigurado } from "./index";
import { vazioProvider } from "./vazio-db";

/** Roda o corpo com as variaveis pedidas e devolve o ambiente como estava. */
function comAmbiente(vars: Record<string, string>, corpo: () => void): void {
  const anterior: Record<string, string | undefined> = {};
  for (const [chave, valor] of Object.entries(vars)) {
    anterior[chave] = process.env[chave];
    process.env[chave] = valor;
  }
  try {
    corpo();
  } finally {
    for (const [chave, valor] of Object.entries(anterior)) {
      if (valor === undefined) delete process.env[chave];
      else process.env[chave] = valor;
    }
  }
}

describe("modoDados — precedencia Supabase > planilha > demo (sob pedido) > vazio", () => {
  it("sem NENHUMA variavel, o app fica VAZIO -- nunca cai em demonstracao", () => {
    expect(supabaseConfigurado()).toBe(false);
    expect(planilhaConfigurada()).toBe(false);
    expect(modoDados()).toBe("vazio");
    expect(getDB()).toBe(vazioProvider);
    expect(getDB().modo).toBe("vazio");
  });

  it("so com RARO_MODO=demo o provider de demonstracao entra", () => {
    comAmbiente({ RARO_MODO: "demo" }, () => {
      expect(modoDados()).toBe("demo");
      expect(getDB()).toBe(demoProvider);
      expect(getDB().modo).toBe("demo");
    });
  });

  it("RARO_MODO com qualquer outro valor NAO liga a demonstracao", () => {
    comAmbiente({ RARO_MODO: "producao" }, () => {
      expect(modoDados()).toBe("vazio");
    });
  });

  it("so com RARO_SHEETS_ID, o modo vira planilha", () => {
    comAmbiente({ RARO_SHEETS_ID: "1abcDEF" }, () => {
      expect(planilhaConfigurada()).toBe(true);
      expect(modoDados()).toBe("planilha");
      expect(getDB().modo).toBe("planilha");
    });
  });

  it("com as duas fontes configuradas, o banco relacional ganha da planilha", () => {
    comAmbiente(
      {
        RARO_SHEETS_ID: "1abcDEF",
        NEXT_PUBLIC_SUPABASE_URL: "https://exemplo.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "chave-anonima",
      },
      () => {
        expect(modoDados()).toBe("supabase");
      }
    );
  });

  it("RARO_MODO=demo NAO derruba uma base real: o Supabase continua ganhando", () => {
    comAmbiente(
      {
        RARO_MODO: "demo",
        NEXT_PUBLIC_SUPABASE_URL: "https://exemplo.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "chave-anonima",
      },
      () => {
        expect(modoDados()).toBe("supabase");
      }
    );
  });

  it("RARO_MODO=demo tambem perde para a planilha", () => {
    comAmbiente({ RARO_MODO: "demo", RARO_SHEETS_ID: "1abcDEF" }, () => {
      expect(modoDados()).toBe("planilha");
    });
  });

  it("Supabase pela metade nao ativa Supabase (URL sem chave nao autentica)", () => {
    comAmbiente({ NEXT_PUBLIC_SUPABASE_URL: "https://exemplo.supabase.co" }, () => {
      expect(supabaseConfigurado()).toBe(false);
      expect(modoDados()).toBe("vazio");
    });
  });
});

describe("vazioProvider — leitura vazia de verdade, escrita que nao mente", () => {
  it("nao devolve linha nenhuma nem numero nenhum diferente de zero", async () => {
    const dataset = await vazioProvider.dataset();
    expect(dataset).toEqual({ matriculas: [], despesas: [], comissoes: [], reembolsos: [] });

    const caixa = await vazioProvider.datasetCaixa();
    expect(caixa.contas).toEqual([]);
    expect(caixa.movimentos).toEqual([]);
    expect(caixa.recebiveis).toEqual([]);
    expect(caixa.pagaveis).toEqual([]);
    expect(caixa.chargebacks).toEqual([]);
    expect(caixa.parametros.saldoInicialCaixa).toBe(0);
    expect(caixa.parametros.custoFixoMensal).toBe(0);
    expect(caixa.parametros.reservaMinimaCaixa).toBe(0);
    expect(caixa.parametros.aliquotaImposto).toBe(0);

    expect(await vazioProvider.listMatriculas()).toEqual([]);
    expect(await vazioProvider.listMetas()).toEqual([]);
    expect(await vazioProvider.listAlunos()).toEqual([]);
    expect(await vazioProvider.getAluno("al-1")).toBeNull();
    expect(await vazioProvider.getLancamento("la-1")).toBeNull();
    expect(await vazioProvider.getConteudo("ct-1")).toBeNull();
  });

  it("escrever sem base LANCA -- fingir sucesso seria perder o registro em silencio", async () => {
    const esperado = /Sem base de dados conectada/;
    await expect(
      vazioProvider.addDespesa({ data: "2026-01-01", descricao: "x", categoria: "Equipe", tipo: "fixa", valor: 10 })
    ).rejects.toThrow(esperado);
    await expect(
      vazioProvider.setMeta({ indicador: "faturamento", escopo: "global", escopoRef: null, periodo: "2026-01", valor: 1 })
    ).rejects.toThrow(esperado);
    await expect(vazioProvider.baixarRecebivel("rc-1", "2026-01-01")).rejects.toThrow(esperado);
    await expect(vazioProvider.toggleTarefa("ta-1")).rejects.toThrow(esperado);
  });
});
