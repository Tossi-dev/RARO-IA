import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const fonte = readFileSync(path.join(__dirname, "app-frame.tsx"), "utf8");
const topbar = readFileSync(path.join(__dirname, "topbar.tsx"), "utf8");

describe("AppFrame", () => {
  it("preserva a area de trabalho na raiz e aplica o novo shell somente nas telas internas", () => {
    expect(fonte).toContain('pathname === "/"');
    expect(fonte).toContain('data-shell="launcher"');
    expect(fonte).toContain('data-shell="interno"');
    expect(fonte).toContain("<SidebarNav grupos={grupos} modoPainel />");
  });

  it("mantem os controles globais acessiveis no shell interno", () => {
    expect(topbar).toContain('aria-label="Abrir navegação rápida"');
    expect(topbar).toContain('aria-label="Abrir controles do painel"');
    expect(topbar).toContain("<TemaToggle tema={tema} />");
    expect(topbar).toContain("<DensidadeToggle densidade={densidade} />");
    expect(topbar).toContain('aria-label="Filtrar por fonte de renda"');
    expect(topbar).toContain('aria-label="Período global"');
    expect(topbar).toContain("rotuloPapel[papel]");
    expect(topbar).not.toContain('<p className="text-xs text-[#8f99ad]">Mentor</p>');
  });
});
