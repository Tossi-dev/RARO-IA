import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const raiz = resolve(__dirname, "..");
const script = resolve(__dirname, "executar-auditoria-rls.ps1");

describe("executar-auditoria-rls.ps1", () => {
  it("oferece modo -Verificar sem rede, prompt ou segredo", () => {
    expect(existsSync(script)).toBe(true);
    const saida = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-Verificar"],
      { cwd: raiz, encoding: "utf8" }
    );

    expect(saida).toContain("T74_CHECK_OK");
  });

  it("não persiste nem imprime os valores secretos", () => {
    const fonte = readFileSync(script, "utf8");

    expect(fonte).toContain("Read-Host -AsSecureString");
    expect(fonte).not.toMatch(/Write-(?:Host|Output).*\$(?:chave|senha|token)/i);
    expect(fonte).not.toContain("Set-Content");
    expect(fonte).not.toContain("Out-File");
  });

  it("trata a segunda visita da RPC pública como efeito sintético único e verificável", () => {
    const fonte = readFileSync(script, "utf8");

    expect(fonte).toContain('"proposta_visita"');
    expect(fonte).toContain("visita sintética antes da auditoria");
    expect(fonte).toContain("visita sintética depois da auditoria");
  });

  it("aceita coleção vazia para falhar fechada com mensagem de alvo sintético", () => {
    const fonte = readFileSync(script, "utf8");

    expect(fonte).toContain("[AllowEmptyCollection()][object[]]$Linhas");
  });

  it("obtém a proposta somente pela oportunidade sintética já validada", () => {
    const fonte = readFileSync(script, "utf8");

    expect(fonte).toContain('"select=id,token&oportunidade_id=eq.$($oportunidade.id)"');
    expect(fonte).not.toContain("titulo=eq.%5BAUDIT%20Proposta%20RLS");
  });
});
