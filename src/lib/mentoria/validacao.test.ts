// Testes de `validacao.ts` — regras PURAS, sem dublê nenhum: é aqui que
// mora o teste de verdade da B2.4 (ver cabeçalho de `validacao.ts`).

import { describe, expect, it } from "vitest";
import { AgendarSchema, BaixaSchema, linkGravacaoValido, validarVinculo } from "./validacao";

// ============================================================
// validarVinculo — os quatro casos (espelha a CHECK sessao_vinculo_unico)
// ============================================================

describe("validarVinculo", () => {
  it("só matriculaId preenchido: ok", () => {
    expect(validarVinculo({ matriculaId: "mat-1" })).toEqual({ ok: true });
  });

  it("só turmaId preenchido: ok", () => {
    expect(validarVinculo({ turmaId: "tur-1" })).toEqual({ ok: true });
  });

  it("os dois preenchidos: erro", () => {
    const r = validarVinculo({ matriculaId: "mat-1", turmaId: "tur-1" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro.length).toBeGreaterThan(0);
  });

  it("nenhum preenchido: erro", () => {
    const r = validarVinculo({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro.length).toBeGreaterThan(0);
  });
});

// ============================================================
// linkGravacaoValido — vazio + esquemas aceitos/rejeitados, caso a caso
// ============================================================

describe("linkGravacaoValido", () => {
  it("vazio é válido (gravação é opcional)", () => {
    expect(linkGravacaoValido("")).toBe(true);
  });

  it("espaços em branco (equivalente a vazio) é válido", () => {
    expect(linkGravacaoValido("   ")).toBe(true);
  });

  it("http:// é válido", () => {
    expect(linkGravacaoValido("http://drive.google.com/gravacao-1")).toBe(true);
  });

  it("https:// é válido", () => {
    expect(linkGravacaoValido("https://drive.google.com/gravacao-1")).toBe(true);
  });

  it('rejeita "javascript:alert(1)" (XSS via link colado)', () => {
    expect(linkGravacaoValido("javascript:alert(1)")).toBe(false);
  });

  it('rejeita "data:text/html,..." (XSS via link colado)', () => {
    expect(linkGravacaoValido("data:text/html,<script>alert(1)</script>")).toBe(false);
  });

  it('rejeita "//evil.com" (protocol-relative, herda o esquema da página)', () => {
    expect(linkGravacaoValido("//evil.com")).toBe(false);
  });

  it('rejeita "ftp://..." (esquema fora da lista permitida)', () => {
    expect(linkGravacaoValido("ftp://exemplo.com/arquivo")).toBe(false);
  });

  it("rejeita texto solto sem esquema", () => {
    expect(linkGravacaoValido("drive.google.com/gravacao-1")).toBe(false);
  });
});

// ============================================================
// AgendarSchema
// ============================================================

describe("AgendarSchema — duracaoMin", () => {
  const base = { matriculaId: "mat-1", turmaId: "", quando: "2026-08-20T10:00:00.000Z", numero: "" };

  it("aceita duração dentro de 5 a 600", () => {
    const r = AgendarSchema.safeParse({ ...base, duracaoMin: "60" });
    expect(r.success).toBe(true);
  });

  it("aceita o limite inferior (5)", () => {
    expect(AgendarSchema.safeParse({ ...base, duracaoMin: "5" }).success).toBe(true);
  });

  it("aceita o limite superior (600)", () => {
    expect(AgendarSchema.safeParse({ ...base, duracaoMin: "600" }).success).toBe(true);
  });

  it("rejeita zero", () => {
    expect(AgendarSchema.safeParse({ ...base, duracaoMin: "0" }).success).toBe(false);
  });

  it("rejeita negativo", () => {
    expect(AgendarSchema.safeParse({ ...base, duracaoMin: "-10" }).success).toBe(false);
  });

  it("rejeita acima de 600", () => {
    expect(AgendarSchema.safeParse({ ...base, duracaoMin: "601" }).success).toBe(false);
  });

  it("rejeita não inteiro", () => {
    expect(AgendarSchema.safeParse({ ...base, duracaoMin: "5.5" }).success).toBe(false);
  });
});

describe("AgendarSchema — numero (opcional)", () => {
  const base = { matriculaId: "mat-1", turmaId: "", quando: "2026-08-20T10:00:00.000Z", duracaoMin: "60" };

  it("ausente (string vazia do formulário) é válido", () => {
    const r = AgendarSchema.safeParse({ ...base, numero: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.numero).toBeNull();
  });

  it("quando vem, aceita inteiro >= 1", () => {
    const r = AgendarSchema.safeParse({ ...base, numero: "8" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.numero).toBe(8);
  });

  it("rejeita zero", () => {
    expect(AgendarSchema.safeParse({ ...base, numero: "0" }).success).toBe(false);
  });

  it("rejeita negativo", () => {
    expect(AgendarSchema.safeParse({ ...base, numero: "-1" }).success).toBe(false);
  });

  it("rejeita não inteiro", () => {
    expect(AgendarSchema.safeParse({ ...base, numero: "1.5" }).success).toBe(false);
  });
});

describe("AgendarSchema — vínculo (matricula xor turma)", () => {
  const base = { quando: "2026-08-20T10:00:00.000Z", duracaoMin: "60", numero: "" };

  it("só matriculaId: válido", () => {
    expect(AgendarSchema.safeParse({ ...base, matriculaId: "mat-1", turmaId: "" }).success).toBe(true);
  });

  it("só turmaId: válido", () => {
    expect(AgendarSchema.safeParse({ ...base, matriculaId: "", turmaId: "tur-1" }).success).toBe(true);
  });

  it("os dois preenchidos: inválido", () => {
    expect(
      AgendarSchema.safeParse({ ...base, matriculaId: "mat-1", turmaId: "tur-1" }).success
    ).toBe(false);
  });

  it("nenhum preenchido: inválido", () => {
    expect(AgendarSchema.safeParse({ ...base, matriculaId: "", turmaId: "" }).success).toBe(false);
  });
});

describe("AgendarSchema — quando", () => {
  it("rejeita data/hora vazia", () => {
    expect(
      AgendarSchema.safeParse({ matriculaId: "mat-1", turmaId: "", quando: "", duracaoMin: "60", numero: "" })
        .success
    ).toBe(false);
  });

  it("rejeita texto que não é data", () => {
    expect(
      AgendarSchema.safeParse({
        matriculaId: "mat-1",
        turmaId: "",
        quando: "não é uma data",
        duracaoMin: "60",
        numero: "",
      }).success
    ).toBe(false);
  });
});

// ============================================================
// BaixaSchema
// ============================================================

describe("BaixaSchema — status", () => {
  const base = { sessaoId: "ses-1", linkGravacao: "", resumo: "" };

  it.each(["realizada", "faltou", "cancelada"] as const)("aceita status %s", (status) => {
    expect(BaixaSchema.safeParse({ ...base, status }).success).toBe(true);
  });

  it('rejeita "agendada" (dar baixa é sair de agendada, remarcar é outra ação)', () => {
    expect(BaixaSchema.safeParse({ ...base, status: "agendada" }).success).toBe(false);
  });

  it("rejeita status inventado", () => {
    expect(BaixaSchema.safeParse({ ...base, status: "concluida" }).success).toBe(false);
  });
});

describe("BaixaSchema — linkGravacao", () => {
  const base = { sessaoId: "ses-1", status: "realizada" as const, resumo: "" };

  it("aceita vazio", () => {
    expect(BaixaSchema.safeParse({ ...base, linkGravacao: "" }).success).toBe(true);
  });

  it("aceita http(s)", () => {
    expect(BaixaSchema.safeParse({ ...base, linkGravacao: "https://drive.google.com/x" }).success).toBe(
      true
    );
  });

  it("rejeita javascript: (o mesmo caso de XSS coberto em linkGravacaoValido)", () => {
    expect(BaixaSchema.safeParse({ ...base, linkGravacao: "javascript:alert(1)" }).success).toBe(false);
  });

  it("rejeita acima de 500 caracteres", () => {
    const longo = "https://exemplo.com/" + "a".repeat(500);
    expect(BaixaSchema.safeParse({ ...base, linkGravacao: longo }).success).toBe(false);
  });
});

describe("BaixaSchema — resumo", () => {
  const base = { sessaoId: "ses-1", status: "realizada" as const, linkGravacao: "" };

  it("aceita até 5000 caracteres", () => {
    expect(BaixaSchema.safeParse({ ...base, resumo: "a".repeat(5000) }).success).toBe(true);
  });

  it("rejeita acima de 5000 caracteres", () => {
    expect(BaixaSchema.safeParse({ ...base, resumo: "a".repeat(5001) }).success).toBe(false);
  });
});

describe("BaixaSchema — sessaoId", () => {
  it("rejeita vazio", () => {
    expect(
      BaixaSchema.safeParse({ sessaoId: "", status: "realizada", linkGravacao: "", resumo: "" }).success
    ).toBe(false);
  });
});
