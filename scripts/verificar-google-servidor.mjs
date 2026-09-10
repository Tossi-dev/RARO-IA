import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const URL_AUTORIZADA = "https://cymwaroayxngplwswzwk.supabase.co";
const TEMPO_LIMITE_MS = 10_000;

export const TABELAS_GOOGLE = Object.freeze([
  Object.freeze({ tabela: "google_oauth_estado", coluna: "state,workspace_id,usuario_id,conexao,expira_em,consumido_em" }),
  Object.freeze({ tabela: "google_calendar_conexao", coluna: "workspace_id,refresh_token_cifrado,iv,tag_autenticacao,versao_chave,escopos,conectado_por,conectado_em,atualizado_em,revogado_em" }),
]);

const STATUS_HTTP_PERMITIDOS = new Set([200, 400, 401, 403, 404, 406, 408, 429, 500, 502, 503, 504]);
const CODIGOS_ORIGEM_SEGUROS = new Set(["PGRST205", "42501", "42703", "42P01", "PGRST301", "PGRST303"]);
const MOTIVOS = Object.freeze({
  ok: "leitura_vazia_confirmada",
  configuracao_ausente: "configuracao_ausente",
  url_divergente: "url_divergente",
  chave_com_espacos: "chave_com_espacos",
  legacy_disabled: "chave_legacy_desativada",
  invalid_key: "autenticacao_recusada",
  schema_missing: "estrutura_ausente",
  permission: "permissao_recusada",
  network: "rede_indisponivel",
  timeout: "tempo_esgotado",
  redirect: "redirecionamento_bloqueado",
  erro_inesperado: "falha_nao_classificada",
});

function statusSeguro(status) {
  return typeof status === "number" && STATUS_HTTP_PERMITIDOS.has(status) ? status : null;
}

function codigoOrigemSeguro(erro) {
  const codigo = typeof erro?.code === "string" ? erro.code.toUpperCase() : "";
  return CODIGOS_ORIGEM_SEGUROS.has(codigo) ? codigo : null;
}

function resultado(tabela, status_http, codigo, erro) {
  return { tabela, status_http: statusSeguro(status_http), codigo, codigo_origem: codigoOrigemSeguro(erro), motivo: MOTIVOS[codigo] };
}

function resultadosIguais(codigo) {
  return TABELAS_GOOGLE.map(({ tabela }) => resultado(tabela, null, codigo));
}

function urlAutorizada(url) {
  if (typeof url !== "string") return false;
  try {
    const normalizada = new URL(url);
    return normalizada.origin === URL_AUTORIZADA
      && normalizada.protocol === "https:"
      && normalizada.hostname === "cymwaroayxngplwswzwk.supabase.co"
      && normalizada.port === ""
      && normalizada.pathname === "/"
      && normalizada.search === ""
      && normalizada.hash === ""
      && normalizada.username === ""
      && normalizada.password === "";
  } catch {
    return false;
  }
}

function classificarFalha(erro, status) {
  const nome = typeof erro?.name === "string" ? erro.name.toLowerCase() : "";
  const codigo = typeof erro?.code === "string" ? erro.code.toUpperCase() : "";
  const mensagem = typeof erro?.message === "string" ? erro.message.toLowerCase() : "";

  if (mensagem.includes("legacy") && mensagem.includes("disabled")) return "legacy_disabled";
  if (mensagem.includes("invalid api key") || mensagem.includes("invalid key")) return "invalid_key";
  if (nome === "timeouterror" || nome === "aborterror" || mensagem.includes("timeout") || mensagem.includes("timed out")) return "timeout";
  if (mensagem.includes("redirect")) return "redirect";
  if (codigo === "42P01" || codigo === "PGRST205" || mensagem.includes("does not exist")) return "schema_missing";
  if (codigo === "42501" || mensagem.includes("permission denied")) return "permission";
  if (status === 401) return "invalid_key";
  if (status === 403) return "permission";
  if (status === 404) return "schema_missing";
  if (status === 408) return "timeout";
  if (status === 429 || (typeof status === "number" && status >= 500)) return "network";
  if (nome === "typeerror") return "network";
  return "erro_inesperado";
}

function criarFetchSeguro(fetchOriginal, estado) {
  return async (entrada, opcoes = {}) => {
    const controlador = new AbortController();
    let temporizador;
    try {
      const tentativa = Promise.resolve(fetchOriginal(entrada, {
        ...opcoes,
        redirect: "error",
        signal: controlador.signal,
      })).then((resposta) => ({ resposta }), (erro) => ({ erro }));
      const limite = new Promise((resolver) => {
        temporizador = setTimeout(() => {
          controlador.abort();
          resolver({ erro: new DOMException("", "TimeoutError") });
        }, TEMPO_LIMITE_MS);
      });
      const resposta = await Promise.race([tentativa, limite]);
      if (resposta.erro) {
        estado.erro = resposta.erro;
        return new Response('{"code":"PREFLIGHT_FETCH_FAILURE"}', { status: 400, headers: { "content-type": "application/json" } });
      }
      estado.status = statusSeguro(resposta.resposta?.status);
      return resposta.resposta;
    } finally {
      clearTimeout(temporizador);
    }
  };
}

/** Executa leituras vazias do schema Google no projeto MentorOS fixo. */
export async function verificarGoogleServidor({ env = process.env, fetch: fetchOriginal = globalThis.fetch } = {}) {
  try {
    const url = env?.NEXT_PUBLIC_SUPABASE_URL;
    const chave = env?.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !chave) return resultadosIguais("configuracao_ausente");
    if (!urlAutorizada(url)) return resultadosIguais("url_divergente");
    if (typeof chave !== "string" || chave !== chave.trim()) return resultadosIguais("chave_com_espacos");
    if (typeof fetchOriginal !== "function") return resultadosIguais("network");

    const estado = { status: null };
    const cliente = createClient(URL_AUTORIZADA, chave, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: criarFetchSeguro(fetchOriginal, estado) },
    });

    const resultados = [];
    for (const { tabela, coluna } of TABELAS_GOOGLE) {
      estado.status = null;
      estado.erro = null;
      try {
        const { data, error } = await cliente.from(tabela).select(coluna).limit(0);
        const erro = estado.erro ?? error;
        const codigo = erro ? classificarFalha(erro, estado.status) : Array.isArray(data) && data.length === 0 && estado.status === 200 ? "ok" : "erro_inesperado";
        resultados.push(resultado(tabela, estado.status, codigo, erro));
      } catch (erro) {
        resultados.push(resultado(tabela, estado.status, classificarFalha(erro, estado.status)));
      }
    }
    return resultados;
  } catch {
    return resultadosIguais("erro_inesperado");
  }
}

function executadoDiretamente() {
  return Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

async function executarCli() {
  let resultados;
  try {
    resultados = await verificarGoogleServidor();
  } catch {
    resultados = resultadosIguais("erro_inesperado");
  }
  process.stdout.write(`${JSON.stringify({ prefixo: "GOOGLE_SERVER_PREFLIGHT", resultados })}\n`);
  if (resultados.some(({ codigo }) => codigo !== "ok")) process.exitCode = 1;
}

if (executadoDiretamente()) await executarCli();
