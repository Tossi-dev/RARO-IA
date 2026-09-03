import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "scripts/uat/criar-massa-sintetica-t112.sql"),
  "utf8",
).toLowerCase();

describe("massa sintética isolada da T-112", () => {
  it("é transacional e fixa o workspace sintético", () => {
    expect(sql).toMatch(/^begin;/);
    expect(sql.trimEnd()).toMatch(/commit;$/);
    expect(sql).toContain("00000000-0000-0000-0000-000000000112");
    expect(sql).toContain("[audit] t-112 — workspace sintetico");
  });

  it("falha fechado para perfis, dados prévios e Storage", () => {
    expect(sql).toContain("rls-audit-gestor@audit.invalid");
    expect(sql).toContain("rls-audit-comercial@audit.invalid");
    expect(sql).toContain("rls-audit-mentorado@audit.invalid");
    expect(sql).toContain("information_schema.columns");
    expect(sql).toContain("storage.objects");
    expect(sql).toContain("raise exception");
  });

  it("cria a jornada mínima de mentoria sem fabricar CRM", () => {
    for (const tabela of [
      "mentorado", "programa", "matricula", "sessao", "documento",
      "atendimento_mapa", "atendimento_consentimento", "atendimento_meta",
      "atendimento_passo", "atendimento_grafo_no", "atendimento_grafo_relacao",
      "mensagem_mentoria", "contrato",
    ]) {
      expect(sql).toContain(`insert into public.${tabela}`);
    }
    expect(sql).not.toContain("insert into public.alunos");
    expect(sql).not.toContain("insert into public.oportunidade");
    expect(sql).not.toContain("insert into public.proposta");
  });

  it("mantém conteúdo sintético, contrato zero e consentimentos limitados", () => {
    expect(sql.match(/\[audit\] t-112/g)?.length).toBeGreaterThanOrEqual(8);
    expect(sql).toContain("valor_total");
    expect(sql).toMatch(/0\.00/);
    expect(sql).toContain("array['mapa', 'meta', 'portal']");
    expect(sql).not.toContain("'transcricao', true");
  });

  it("só desfaz o vínculo de portal da massa sintética anterior", () => {
    expect(sql).not.toMatch(/\b(create|alter|drop|truncate)\s+(table|policy|function|type)\b/);
    expect(sql).not.toContain("update public.profiles");
    expect(sql).not.toContain("delete from");
    expect(sql).not.toContain("insert into storage.objects");
    expect(sql).toContain("update public.mentorado");
    expect(sql).toContain("set perfil_id = null");
    expect(sql).toContain("select id into strict v_mentorado_antigo_id");
    expect(sql).toContain("where id = v_mentorado_antigo_id");
    expect(sql).toContain("nome ilike '%[audit]%'");
    expect(sql.match(/update public\./g)).toHaveLength(1);
    expect(sql).toContain("on conflict do nothing");
  });
});
