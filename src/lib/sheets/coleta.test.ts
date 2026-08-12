// O contrato de coleta so vale se ele nao mentir. Estes testes guardam as duas
// mentiras possiveis: apontar para uma aba que nao existe (a tela mostraria um
// caminho para lugar nenhum) e marcar como pronta uma rota que ainda depende de
// alguma coisa (a mesma classe de erro do dado fabricado).

import { describe, expect, it } from "vitest";
import { ABAS } from "./abas";
import { ROTAS_COLETA, rotaPrincipal, rotasQueAlimentam } from "./coleta";

const NOMES = new Set(ABAS.map((a) => a.nome));
const ENTRADA = new Set(ABAS.filter((a) => a.papel === "entrada").map((a) => a.nome));

describe("contrato de coleta", () => {
  it("toda aba de destino existe no contrato de abas", () => {
    for (const r of ROTAS_COLETA) {
      for (const aba of r.destino) {
        expect(NOMES.has(aba), `rota ${r.id} aponta para aba inexistente ${aba}`).toBe(true);
      }
    }
  });

  it("nenhuma rota grava em aba derivada ou de config", () => {
    for (const r of ROTAS_COLETA) {
      for (const aba of r.destino) {
        expect(ENTRADA.has(aba), `rota ${r.id} gravaria em ${aba}, que nao e aba de entrada`).toBe(true);
      }
    }
  });

  it("rota que nao esta ativa declara o que falta", () => {
    for (const r of ROTAS_COLETA) {
      if (r.status === "ativa") continue;
      expect(r.bloqueio, `rota ${r.id} nao esta ativa e nao diz o que falta`).toBeTruthy();
    }
  });

  it("rota ativa nao carrega bloqueio pendurado", () => {
    for (const r of ROTAS_COLETA.filter((x) => x.status === "ativa")) {
      expect(r.bloqueio, `rota ${r.id} esta ativa mas ainda declara bloqueio`).toBeUndefined();
    }
  });

  it("id de rota e unico", () => {
    const ids = ROTAS_COLETA.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// O describe "casamento de dados" (TELAS/telasQueUsam) saiu daqui: testava
// um catalogo que so a tela /coleta usava, removida na virada para mentoria.

describe("toda aba de entrada tem coleta", () => {
  it("toda aba de entrada tem pelo menos uma rota que a alimenta", () => {
    for (const aba of ENTRADA) {
      expect(rotasQueAlimentam(aba).length, `aba ${aba} nao tem rota de coleta`).toBeGreaterThan(0);
    }
  });
});

describe("rotaPrincipal", () => {
  it("devolve null para aba fora de qualquer rota", () => {
    expect(rotaPrincipal("ABA_QUE_NAO_EXISTE")).toBeNull();
  });

  it("prefere rota ativa a rota pendente", () => {
    // VENDAS e alimentada pela digitacao direta (ativa) e pelo formulario
    // (pendente). Enquanto a escrita nao subir, a resposta honesta e a manual.
    const r = rotaPrincipal("VENDAS");
    expect(r).not.toBeNull();
    expect(r!.status).toBe("ativa");
  });

  it("entre rotas de mesmo status, prefere a mais automatica", () => {
    // DESPESAS tem a digitacao direta (manual/ativa), o formulario
    // (semiautomatica/pendente) e a recorrente (automatica/pendente).
    const candidatas = rotasQueAlimentam("DESPESAS").filter((x) => x.status === "pendente");
    expect(candidatas.length).toBeGreaterThan(1);
    expect(candidatas.some((x) => x.modo === "automatica")).toBe(true);
  });
});
