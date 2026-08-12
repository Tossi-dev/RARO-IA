// Testes do provider de planilha para o vinculo VENDAS -> ALUNOS (coluna
// ID_Aluno, acrescentada em 2026-08). Antes desta coluna, VENDAS nao tinha
// como dizer quem comprou; estes testes travam o contrato dos dois lados:
// venda com dono resolve o nome, venda sem dono continua contando no
// faturamento e nao derruba a leitura.
//
// A planilha e um sistema de terceiro (Google Sheets via CSV publico), entao
// o dublê fica em `@/lib/sheets/ler` -- e o unico ponto de I/O que
// `sheets-db.ts` usa para leitura.

import { describe, expect, it, vi } from "vitest";
import type { LeituraAba } from "@/lib/sheets/ler";

const lerAbasMock = vi.fn();
vi.mock("@/lib/sheets/ler", () => ({
  lerAbas: (nomes: string[]) => lerAbasMock(nomes),
  lerConfig: () => Promise.resolve({ listas: {}, parametros: {}, erro: null }),
}));

// import depois do mock, senao o modulo pega o lerAbas real (fetch de verdade)
const { sheetsProvider } = await import("./sheets-db");

/** Monta a resposta de `lerAbas` a partir de um mapa aba -> linhas. */
function dublePlanilha(abas: Record<string, Record<string, string>[]>) {
  lerAbasMock.mockImplementation((nomes: string[]) => {
    const mapa: Record<string, LeituraAba> = {};
    for (const nome of nomes) {
      mapa[nome] = { aba: nome, linhas: abas[nome] ?? [], erro: null };
    }
    return Promise.resolve(mapa);
  });
}

const linhaVenda = (campos: Partial<Record<string, string>> = {}): Record<string, string> => ({
  ID: "VEN-1",
  Timestamp: "",
  Data: "10/08/2026",
  Responsavel: "",
  Produto: "",
  "Canal de origem": "Instagram",
  "Valor da venda": "1000",
  "Forma de pagamento": "Pix",
  "Valor da entrada": "",
  "N de parcelas": "1",
  "Recebimento cartao": "",
  Comissao: "",
  Status: "Fechada",
  ID_Aluno: "",
  ...campos,
});

const linhaAluno = (campos: Partial<Record<string, string>> = {}): Record<string, string> => ({
  ID: "ALU-1",
  Timestamp: "",
  Nome: "Joana Silva",
  Telefone: "",
  Email: "",
  Responsavel: "",
  "Canal de origem": "",
  "Etapa/Status": "Ganho",
  "Primeiro contato": "01/08/2026",
  Observacoes: "",
  ID_Lead: "",
  ...campos,
});

describe("sheetsProvider.listMatriculas — ID_Aluno cruzado com ALUNOS", () => {
  it("venda com ID_Aluno preenchido resolve o nome do aluno", async () => {
    dublePlanilha({
      VENDAS: [linhaVenda({ ID_Aluno: "ALU-1" })],
      RECEBIVEIS: [],
      PRODUTOS: [],
      RESPONSAVEIS: [],
      ALUNOS: [linhaAluno({ ID: "ALU-1", Nome: "Joana Silva" })],
    });

    const matriculas = await sheetsProvider.listMatriculas();

    expect(matriculas).toHaveLength(1);
    expect(matriculas[0].alunoId).toBe("ALU-1");
    expect(matriculas[0].alunoNome).toBe("Joana Silva");
  });

  it("venda com ID_Aluno vazio NAO e descartada: conta no faturamento sem dono", async () => {
    dublePlanilha({
      VENDAS: [linhaVenda({ ID: "VEN-2", ID_Aluno: "" })],
      RECEBIVEIS: [],
      PRODUTOS: [],
      RESPONSAVEIS: [],
      ALUNOS: [],
    });

    const matriculas = await sheetsProvider.listMatriculas();

    expect(matriculas).toHaveLength(1);
    expect(matriculas[0].alunoId).toBe("");
    expect(matriculas[0].alunoNome).toBe("");
    expect(matriculas[0].valor).toBe(1000);
  });

  it("venda com ID_Aluno que nao existe em ALUNOS nao quebra: alunoNome vazio, venda continua contando", async () => {
    dublePlanilha({
      VENDAS: [linhaVenda({ ID: "VEN-3", ID_Aluno: "ALU-FANTASMA" })],
      RECEBIVEIS: [],
      PRODUTOS: [],
      RESPONSAVEIS: [],
      ALUNOS: [linhaAluno({ ID: "ALU-1", Nome: "Joana Silva" })],
    });

    const matriculas = await sheetsProvider.listMatriculas();

    expect(matriculas).toHaveLength(1);
    expect(matriculas[0].alunoId).toBe("ALU-FANTASMA");
    expect(matriculas[0].alunoNome).toBe("");
    expect(matriculas[0].valor).toBe(1000);
  });
});

describe("sheetsProvider.getAluno — ficha do aluno com as matriculas dele", () => {
  it("devolve as matriculas do aluno, mais recente primeiro", async () => {
    dublePlanilha({
      ALUNOS: [linhaAluno({ ID: "ALU-1", Nome: "Joana Silva" })],
      VENDAS: [
        linhaVenda({ ID: "VEN-1", ID_Aluno: "ALU-1", Data: "10/01/2026", "Valor da venda": "500" }),
        linhaVenda({ ID: "VEN-2", ID_Aluno: "ALU-1", Data: "10/06/2026", "Valor da venda": "700" }),
        linhaVenda({ ID: "VEN-3", ID_Aluno: "ALU-2", Data: "10/07/2026", "Valor da venda": "999" }),
      ],
      RECEBIVEIS: [],
      PRODUTOS: [],
      RESPONSAVEIS: [],
    });

    const detalhe = await sheetsProvider.getAluno("ALU-1");

    expect(detalhe).not.toBeNull();
    expect(detalhe!.matriculas.map((m) => m.id)).toEqual(["VEN-2", "VEN-1"]);
  });
});
