// O que estes testes protegem: duas coisas que só aparecem tarde demais.
//
// (1) Configuração errada aceita em silêncio faz o agente capturar a semana
// inteira numa fila que nunca sobe, e o dono só descobre quando abre o CRM e
// acha que "o WhatsApp não funciona".
// (2) Segredo em log é o vazamento mais fácil de cometer e o mais difícil de
// desfazer: basta um print mandado para o suporte.

import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lerEnv, montarConfig, TAMANHO_MINIMO_SEGREDO } from "../src/config.js";
import { inicioDaVarredura, MARGEM_RETOMADA_MIN } from "../src/estado.js";
import { criarLog, redigir } from "../src/log.js";

describe("lerEnv", () => {
  it("aguenta o arquivo do jeito que uma pessoa preenche", () => {
    const r = lerEnv(
      [
        "# comentário",
        "",
        "BASE_URL=https://crm.exemplo.app",
        'RARO_AGENTE_SEGREDO="com aspas e espaço"',
        "export DIAS_HISTORICO=14",
        "SEM_IGUAL",
        "=sem_chave",
      ].join("\n")
    );
    expect(r).toEqual({
      BASE_URL: "https://crm.exemplo.app",
      RARO_AGENTE_SEGREDO: "com aspas e espaço",
      DIAS_HISTORICO: "14",
    });
  });

  it("não quebra com arquivo vazio ou ausente", () => {
    expect(lerEnv("")).toEqual({});
    expect(lerEnv(undefined)).toEqual({});
  });
});

describe("montarConfig", () => {
  const bom = {
    BASE_URL: "https://crm.exemplo.app/",
    RARO_AGENTE_SEGREDO: "um-segredo-bem-comprido",
  };

  it("aceita o mínimo e tira a barra do fim da URL", () => {
    const { erros, config } = montarConfig(bom, { home: "/Users/dono" });
    expect(erros).toEqual([]);
    expect(config.baseUrl).toBe("https://crm.exemplo.app");
    expect(config.diasHistorico).toBe(7);
    // Montado com `join` porque o separador muda com o sistema: no Windows a
    // mesma configuração correta produz "\\" e a comparação com texto fixo
    // reprovava um código que estava certo.
    expect(config.pastaSessao).toBe(
      join("/Users/dono", "Library", "Application Support", "RaroAgenteWhatsApp", "sessao")
    );
  });

  it("recusa configuração faltando, listando tudo de uma vez", () => {
    const { erros } = montarConfig({}, { home: "/Users/dono" });
    expect(erros).toHaveLength(2);
    expect(erros.join(" ")).toContain("BASE_URL");
    expect(erros.join(" ")).toContain("RARO_AGENTE_SEGREDO");
  });

  it("recusa segredo curto e nunca repete o valor lido na mensagem", () => {
    const { erros } = montarConfig({ ...bom, RARO_AGENTE_SEGREDO: "curto" });
    expect(erros).toHaveLength(1);
    expect(erros[0]).toContain(String(TAMANHO_MINIMO_SEGREDO));
    expect(erros[0]).not.toContain("curto");
  });

  it("recusa http:// na internet, porque o segredo viaja em header", () => {
    expect(montarConfig({ ...bom, BASE_URL: "http://crm.exemplo.app" }).erros).toHaveLength(1);
    // Localhost é o caso de teste do próprio desenvolvedor: passa.
    expect(montarConfig({ ...bom, BASE_URL: "http://localhost:3000" }).erros).toEqual([]);
  });

  it("prende os intervalos em faixas sensatas", () => {
    const { config } = montarConfig({ ...bom, SEGUNDOS_ENTRE_FILA: "0", DIAS_HISTORICO: "999" });
    expect(config.segundosEntreFila).toBe(5);
    expect(config.diasHistorico).toBe(30);
  });
});

describe("redigir", () => {
  it("apaga o segredo de qualquer texto que vá para o log", () => {
    const segredo = "um-segredo-bem-comprido";
    const linha = redigir(`falhou com header ${segredo} na chamada`, segredo);
    expect(linha).not.toContain(segredo);
    expect(linha).toContain("«segredo oculto»");
  });

  it("apaga também quando o segredo vem dentro de um erro de biblioteca", () => {
    const segredo = "um-segredo-bem-comprido";
    const capturado = [];
    const log = criarLog({
      segredo,
      arquivo: "",
      saida: { log: (l) => capturado.push(l), error: (l) => capturado.push(l) },
    });

    log.erro("Falha na requisição", new Error(`401 com x-raro-agente: ${segredo}`));
    log.info("estado", { header: segredo });

    expect(capturado).toHaveLength(2);
    expect(capturado.join("\n")).not.toContain(segredo);
  });
});

describe("inicioDaVarredura", () => {
  const agora = Date.parse("2026-08-10T12:00:00.000Z");
  const dia = 24 * 60 * 60 * 1000;

  it("sem memória, volta os N dias configurados", () => {
    expect(inicioDaVarredura({}, agora, 7)).toBe(agora - 7 * dia);
  });

  it("com memória, retoma de onde parou com uma margem de segurança", () => {
    const ultima = new Date(agora - 2 * 60 * 60 * 1000).toISOString();
    expect(inicioDaVarredura({ ultimaVarredura: ultima }, agora, 7)).toBe(
      Date.parse(ultima) - MARGEM_RETOMADA_MIN * 60 * 1000
    );
  });

  it("memória velha demais não faz varrer um mês inteiro", () => {
    const ultima = new Date(agora - 90 * dia).toISOString();
    expect(inicioDaVarredura({ ultimaVarredura: ultima }, agora, 7)).toBe(agora - 7 * dia);
  });

  it("data no futuro (relógio torto) não trava a varredura para sempre", () => {
    const ultima = new Date(agora + 30 * dia).toISOString();
    expect(inicioDaVarredura({ ultimaVarredura: ultima }, agora, 7)).toBe(agora);
  });
});
