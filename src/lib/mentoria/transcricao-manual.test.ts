import { describe, expect, it } from "vitest";
import {
  MOTIVO_TRANSCRICAO_MANUAL_ACESSO_NEGADO,
  MOTIVO_TRANSCRICAO_MANUAL_SEM_CONSENTIMENTO,
  MOTIVO_TRANSCRICAO_MANUAL_VAZIA,
  prepararTranscricaoManual,
  referenciaTranscricaoParaGrafo,
} from "./transcricao-manual";

const consentimentos = { mapa: true, reflexao: true, meta: true, transcricao: true, portal: true };
const base = { texto: "  relato digitado pelo profissional  ", visibilidade: "privada_profissional" as const, consentimentos, acessoPermitido: true };

describe("transcrição manual autorizada", () => {
  it("aceita entrada local e preserva o texto exatamente como digitado", () => {
    const resultado = prepararTranscricaoManual(base);
    expect(resultado).toEqual({ ok: true, valor: { texto: base.texto, origem: "manual", visibilidade: "privada_profissional", compartilhavel: false } });
  });

  it("recusa consentimento ausente ou revogado", () => {
    expect(prepararTranscricaoManual({ ...base, consentimentos: null })).toEqual({ ok: false, erro: MOTIVO_TRANSCRICAO_MANUAL_SEM_CONSENTIMENTO });
    expect(prepararTranscricaoManual({ ...base, consentimentos: { ...consentimentos, transcricao: false } })).toEqual({ ok: false, erro: MOTIVO_TRANSCRICAO_MANUAL_SEM_CONSENTIMENTO });
  });

  it("recusa acesso indevido antes de processar o texto", () => {
    expect(prepararTranscricaoManual({ ...base, acessoPermitido: false })).toEqual({ ok: false, erro: MOTIVO_TRANSCRICAO_MANUAL_ACESSO_NEGADO });
  });

  it("exige portal consentido quando a visibilidade é compartilhável", () => {
    expect(prepararTranscricaoManual({ ...base, visibilidade: "compartilhavel", consentimentos: { ...consentimentos, portal: false } })).toEqual({ ok: false, erro: MOTIVO_TRANSCRICAO_MANUAL_SEM_CONSENTIMENTO });
    expect(prepararTranscricaoManual({ ...base, visibilidade: "compartilhavel" }).ok).toBe(true);
  });

  it("recusa texto ausente/vazio", () => {
    expect(prepararTranscricaoManual({ ...base, texto: " \n " })).toEqual({ ok: false, erro: MOTIVO_TRANSCRICAO_MANUAL_VAZIA });
  });
});

describe("referência de transcrição no grafo", () => {
  it("não carrega texto mesmo quando a entrada original tinha texto", () => {
    const no = referenciaTranscricaoParaGrafo("t-1", "m-1", true) as Record<string, unknown>;
    expect(no).toEqual({ id: "t-1", clienteId: "m-1", tipo: "transcricao_referencia", transcricaoAutorizada: true });
    expect(no).not.toHaveProperty("texto");
  });
});
