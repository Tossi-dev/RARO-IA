import { describe, expect, it } from "vitest";

import {
  conexaoAssistidaPorId,
  INTEGRACOES_ASSISTIDAS,
  inicioAssistido,
  proximaConexaoAssistidaPendente,
  type IdConexaoAssistida,
} from "./conexao-assistida";

const IDS_ESPERADOS: IdConexaoAssistida[] = [
  "supabase",
  "planilha",
  "gateway",
  "agenda-leitura",
  "calendar",
  "stt",
  "ia",
  "meta",
  "tiktok",
];

describe("catálogo de conexão assistida", () => {
  it("cobre cada integração exposta no diagnóstico, sem criar id implícito", () => {
    expect(INTEGRACOES_ASSISTIDAS.map((conexao) => conexao.id)).toEqual(IDS_ESPERADOS);
    expect(conexaoAssistidaPorId("desconhecida")).toBeNull();
  });

  it("direciona somente o Google Calendar para o início OAuth do MentorOS", () => {
    expect(inicioAssistido("calendar")).toEqual({
      tipo: "oauth",
      href: "/api/agenda/google/entrar",
    });
    expect(inicioAssistido("agenda-leitura")).toBeNull();
  });

  it("não oferece coleta de segredo pelo browser para integrações por API key", () => {
    for (const id of ["stt", "ia"] as const) {
      const conexao = conexaoAssistidaPorId(id);
      expect(conexao?.modo).toBe("cofre_por_organizacao");
      expect(inicioAssistido(id)).toBeNull();
      expect(conexao?.clientePodeIniciar).toBe(false);
    }
  });

  it("explica os limites humanos de redes, planilha e pagamentos", () => {
    expect(conexaoAssistidaPorId("meta")?.modo).toBe("oauth");
    expect(conexaoAssistidaPorId("tiktok")?.modo).toBe("oauth");
    expect(conexaoAssistidaPorId("planilha")?.modo).toBe("oauth");
    expect(conexaoAssistidaPorId("gateway")?.modo).toBe("decisao_de_fornecedor");
  });

  it("pula o iCal opcional quando o OAuth do Calendar já cobre a leitura", () => {
    expect(proximaConexaoAssistidaPendente(["supabase", "calendar"])).toMatchObject({
      id: "planilha",
      estado: "em_preparacao",
    });
  });

  it("não inventa uma próxima conexão quando todas já foram tratadas", () => {
    expect(proximaConexaoAssistidaPendente(IDS_ESPERADOS)).toBeNull();
  });
});
