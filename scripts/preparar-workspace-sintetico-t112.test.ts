import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const caminho = resolve(process.cwd(), "scripts/uat/preparar-workspace-sintetico-t112.sql");
const lerSql = () => readFileSync(caminho, "utf8");

describe("workspace sintético da T-112", () => {
  it("é uma operação transacional e idempotente", () => {
    const sql = lerSql();
    expect(sql).toMatch(/^begin;/i);
    expect(sql).toMatch(/insert into public\.workspace[\s\S]*on conflict \(id\) do nothing/i);
    expect(sql).not.toMatch(/set nome = excluded\.nome/i);
    expect(sql).toMatch(/commit;\s*$/i);
  });

  it("aceita exatamente as três identidades audit.invalid esperadas", () => {
    const sql = lerSql().toLowerCase();
    for (const papel of ["gestor", "comercial", "mentorado"]) {
      expect(sql).toContain(`rls-audit-${papel}@audit.invalid`);
    }
    expect(sql).toMatch(/if v_usuarios <> 3[\s\S]*raise exception/i);
    expect(sql).toMatch(/if v_perfis <> 3[\s\S]*raise exception/i);
  });

  it("altera somente o workspace dos profiles sintéticos e falha diante de intruso", () => {
    const sql = lerSql();
    expect(sql).toMatch(/update public\.profiles[\s\S]*set workspace_id = v_workspace_id[\s\S]*from auth\.users/i);
    expect(sql).toMatch(/if exists[\s\S]*workspace_id = v_workspace_id[\s\S]*not[\s\S]*any \(v_emails\)[\s\S]*raise exception/i);
    expect(sql).not.toMatch(/delete\s+from|truncate|drop\s+(table|policy)|create\s+policy|alter\s+table/i);
  });

  it("recusa UUID incompatível e qualquer dado de negócio já ligado ao workspace", () => {
    const sql = lerSql();
    expect(sql).toMatch(/from public\.workspace[\s\S]*id = v_workspace_id[\s\S]*nome <> v_workspace_nome[\s\S]*raise exception/i);
    expect(sql).toMatch(/information_schema\.columns[\s\S]*column_name = 'workspace_id'/i);
    expect(sql).toMatch(/if v_tem_dados then[\s\S]*raise exception/i);
    expect(sql).toMatch(/table_name not in \('workspace', 'profiles'\)/i);
    expect(sql).toMatch(/from storage\.objects[\s\S]*storage\.foldername\(name\)\)\[1\] = v_workspace_id::text[\s\S]*raise exception/i);
  });

  it("não contém segredo nem cliente de rede", () => {
    const sql = lerSql();
    expect(sql).not.toMatch(/sb_secret|service_role|authorization|https?:\/\//i);
  });
});
