import { describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const { verificarGoogleServidor } = await import("./verificar-google-servidor.mjs");

const URL_AUTORIZADA = "https://cymwaroayxngplwswzwk.supabase.co";
const CHAVE_DE_TESTE = "service-role-test-key";

function ambiente(url = URL_AUTORIZADA, chave = CHAVE_DE_TESTE) {
  return {
    NODE_ENV: "test" as const,
    NEXT_PUBLIC_SUPABASE_URL: url,
    SUPABASE_SERVICE_ROLE_KEY: chave,
  };
}

function respostaJson(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("verificarGoogleServidor", () => {
  it("fecha o entrypoint se o construtor do SDK lançar antes da consulta", () => {
    const marcador = "MARCADOR-SENSIVEL-NAO-EXIBIR";
    const sdkSintetico = `export const createClient = () => { throw new Error(${JSON.stringify(marcador)}); };`;
    const loader = `
      import { registerHooks } from "node:module";
      const sdk = ${JSON.stringify(`data:text/javascript,${encodeURIComponent(sdkSintetico)}`)};
      registerHooks({
        resolve(specifier, context, nextResolve) {
          if (specifier === "@supabase/supabase-js") return { url: sdk, shortCircuit: true };
          return nextResolve(specifier, context);
        },
      });
    `;
    const processo = spawnSync(
      process.execPath,
      ["--import", `data:text/javascript,${encodeURIComponent(loader)}`, fileURLToPath(new URL("./verificar-google-servidor.mjs", import.meta.url))],
      {
        encoding: "utf8",
        env: {
          NODE_ENV: "test",
          NEXT_PUBLIC_SUPABASE_URL: URL_AUTORIZADA,
          SUPABASE_SERVICE_ROLE_KEY: CHAVE_DE_TESTE,
        },
      }
    );

    expect(processo.status).toBe(1);
    expect(processo.stderr).not.toContain(marcador);
    expect(processo.stdout).not.toContain(marcador);
    expect(processo.stderr).toBe("");
    expect(JSON.parse(processo.stdout)).toEqual({
      prefixo: "GOOGLE_SERVER_PREFLIGHT",
      resultados: [
        { tabela: "google_oauth_estado", status_http: null, codigo: "erro_inesperado", codigo_origem: null, motivo: "falha_nao_classificada" },
        { tabela: "google_calendar_conexao", status_http: null, codigo: "erro_inesperado", codigo_origem: null, motivo: "falha_nao_classificada" },
      ],
    });
  });

  it("faz somente GET com limit=0 nas duas tabelas, usando o host autorizado", async () => {
    const fetchMock = vi.fn(async (entrada: RequestInfo | URL, opcoes?: RequestInit) => {
      const url = new URL(String(entrada));

      expect(url.origin).toBe(URL_AUTORIZADA);
      expect(url.pathname).toMatch(/^\/rest\/v1\/(google_oauth_estado|google_calendar_conexao)$/);
      expect(url.searchParams.get("limit")).toBe("0");
      expect(url.searchParams.get("select")).toBe(url.pathname.endsWith("google_oauth_estado") ? "state,workspace_id,usuario_id,conexao,expira_em,consumido_em" : "workspace_id,refresh_token_cifrado,iv,tag_autenticacao,versao_chave,escopos,conectado_por,conectado_em,atualizado_em,revogado_em");
      expect(opcoes?.method).toBe("GET");
      expect(opcoes?.redirect).toBe("error");

      return respostaJson([]);
    });

    await expect(verificarGoogleServidor({ env: ambiente(`${URL_AUTORIZADA}/`), fetch: fetchMock })).resolves.toEqual([
      { tabela: "google_oauth_estado", status_http: 200, codigo: "ok", codigo_origem: null, motivo: "leitura_vazia_confirmada" },
      { tabela: "google_calendar_conexao", status_http: 200, codigo: "ok", codigo_origem: null, motivo: "leitura_vazia_confirmada" },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["configuração ausente", ambiente("", ""), "configuracao_ausente"],
    ["host divergente", ambiente("https://supabase.example.test", CHAVE_DE_TESTE), "url_divergente"],
    ["chave com espaços", ambiente(URL_AUTORIZADA, ` ${CHAVE_DE_TESTE} `), "chave_com_espacos"],
  ])("falha fechada para %s sem fazer requisição", async (_cenario, env, codigo) => {
    const fetchMock = vi.fn();
    const resultado = await verificarGoogleServidor({ env, fetch: fetchMock });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(resultado).toEqual([
      { tabela: "google_oauth_estado", status_http: null, codigo, codigo_origem: null, motivo: codigo },
      { tabela: "google_calendar_conexao", status_http: null, codigo, codigo_origem: null, motivo: codigo },
    ]);
  });

  it("classifica autenticação sem serializar mensagem, código ou status adversarial", async () => {
    const segredo = "nao-vazar-service-role-123";
    const resultado = await verificarGoogleServidor({
      env: ambiente(),
      fetch: vi.fn(async () => respostaJson({ message: segredo, code: segredo, status: segredo }, 401)),
    });

    expect(resultado).toEqual([
      { tabela: "google_oauth_estado", status_http: 401, codigo: "invalid_key", codigo_origem: null, motivo: "autenticacao_recusada" },
      { tabela: "google_calendar_conexao", status_http: 401, codigo: "invalid_key", codigo_origem: null, motivo: "autenticacao_recusada" },
    ]);
    expect(JSON.stringify(resultado)).not.toContain(segredo);
  });

  it("falha fechada se uma resposta 200 tentar devolver qualquer registro", async () => {
    const segredo = "registro-que-nao-deve-sair";
    const resultado = await verificarGoogleServidor({
      env: ambiente(),
      fetch: vi.fn(async () => respostaJson([{ state: segredo }])),
    });

    expect(resultado[0]).toEqual({ tabela: "google_oauth_estado", status_http: 200, codigo: "erro_inesperado", codigo_origem: null, motivo: "falha_nao_classificada" });
    expect(JSON.stringify(resultado)).not.toContain(segredo);
  });

  it("classifica timeout e redirect sem expor detalhes da exceção", async () => {
    const timeout = await verificarGoogleServidor({
      env: ambiente(),
      fetch: vi.fn(async () => { throw new DOMException("segredo de timeout", "TimeoutError"); }),
    });
    const redirect = await verificarGoogleServidor({
      env: ambiente(),
      fetch: vi.fn(async () => { throw new TypeError("redirect para segredo"); }),
    });

    expect(timeout[0]).toEqual({ tabela: "google_oauth_estado", status_http: null, codigo: "timeout", codigo_origem: null, motivo: "tempo_esgotado" });
    expect(redirect[0]).toEqual({ tabela: "google_oauth_estado", status_http: null, codigo: "redirect", codigo_origem: null, motivo: "redirecionamento_bloqueado" });
    expect(JSON.stringify([...timeout, ...redirect])).not.toContain("segredo");
  }, 30_000);
});
