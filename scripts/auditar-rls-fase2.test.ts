import { describe, expect, it } from "vitest";
import {
  carregarConfiguracao,
  executarAuditoria,
  montarPlanoAuditoria,
  recusaRlsEsperada,
  type ExecutorAuditoria,
} from "./auditar-rls-fase2";

const alvos = {
  leituraAlheia: Object.fromEntries(
    [
      "cobranca",
      "oportunidade",
      "analise_sessao",
      "analise_call",
      "alerta_risco",
      "patrimonio",
      "investimento",
      "renda_pessoal",
    ].map((tabela) => [tabela, "00000000-0000-4000-8000-000000000001"])
  ),
  patchAlheio: Object.fromEntries(
    ["progresso_trilha", "onboarding_progresso", "post_destinatario"].map((tabela) => [
      tabela,
      "00000000-0000-4000-8000-000000000002",
    ])
  ),
  patchProprio: { progresso_trilha: "00000000-0000-4000-8000-000000000003" },
  tokenPropostaPublica: "token-de-auditoria",
};

describe("auditar-rls-fase2", () => {
  it("falha fechada quando faltam tokens, alvos ou chave anônima", () => {
    expect(() => carregarConfiguracao({})).toThrow("SUPABASE_AUDIT_URL");
    expect(() =>
      carregarConfiguracao({
        SUPABASE_AUDIT_URL: "https://exemplo.supabase.co",
        SUPABASE_AUDIT_ANON_KEY: "anon",
      })
    ).toThrow("SUPABASE_AUDIT_MENTORADO_A_TOKEN");
  });

  it("reconhece somente a recusa RLS esperada de PATCH", () => {
    expect(recusaRlsEsperada({ code: "42501" })).toBe(true);
    expect(recusaRlsEsperada({ code: "42P01" })).toBe(false);
    expect(recusaRlsEsperada(new Error("rede"))).toBe(false);
  });

  it("monta as leituras e PATCHs proibidos da fase, por papel", () => {
    const plano = montarPlanoAuditoria(alvos);

    expect(plano.some((operacao) => operacao.papel === "mentorado" && operacao.tabela === "cobranca")).toBe(true);
    expect(plano.some((operacao) => operacao.papel === "comercial" && operacao.tabela === "cobranca")).toBe(true);
    expect(plano.some((operacao) => operacao.papel === "comercial" && operacao.tabela === "alerta_risco")).toBe(true);
    expect(plano.some((operacao) => operacao.papel === "comercial" && operacao.tabela === "oportunidade")).toBe(false);
    expect(plano.some((operacao) => operacao.papel === "comercial" && operacao.tabela === "analise_call")).toBe(false);
    expect(plano.some((operacao) => operacao.papel === "gestor" && operacao.tabela === "patrimonio")).toBe(true);
    expect(plano.filter((operacao) => operacao.tipo === "patch")).toHaveLength(4);
    expect(plano.some((operacao) => operacao.tipo === "proposta_publica")).toBe(true);
  });

  it("reprova a auditoria se uma leitura ou PATCH proibido afetar uma linha", async () => {
    const executor: ExecutorAuditoria = {
      executar: async (operacao) => (operacao.tabela === "cobranca" ? { linhas: 1 } : { linhas: 0 }),
    };

    await expect(executarAuditoria(executor, montarPlanoAuditoria(alvos))).rejects.toThrow("cobranca");
  });

  it("aceita somente zero linhas e uma proposta pública com campos mínimos", async () => {
    const executor: ExecutorAuditoria = {
      executar: async (operacao) =>
        operacao.tipo === "proposta_publica"
          ? { linhas: 1, campos: ["titulo", "corpo", "valor", "validade", "status"] }
          : { linhas: 0 },
    };

    await expect(executarAuditoria(executor, montarPlanoAuditoria(alvos))).resolves.toEqual({ operacoes: 23 });
  });
});
