// Cliente de ESCRITA na planilha Base_Financeira_Operacao.
//
// MODULO NEUTRO (sem diretiva de cliente): usa fetch no servidor e le variaveis
// de ambiente server-only. Um modulo marcado como cliente nao pode exportar
// valor de runtime consumido por Server Component -- da "React Client Manifest"
// e 500 em runtime com o build verde.
//
// A leitura da planilha e publica (gviz, sem login). A ESCRITA passa por um Web
// App do Apps Script publicado a partir da propria planilha
// (scripts/planilha/raro-sync.gs). O protocolo dele e:
//
//   POST <RARO_SHEETS_WEBAPP_URL>
//   corpo JSON: { segredo, acao, aba, dados }
//   acoes: ping | criarAbas | inserir | atualizar | lista
//   resposta: sempre JSON, sempre com a chave `ok`
//
// Principio que rege o arquivo inteiro: NADA AQUI LANCA. Toda falha -- rede,
// timeout, segredo errado, aba proibida, JSON quebrado -- volta como
// `RespostaEscrita` com `ok: false` e um `erro` legivel. Escrita e acionada por
// Server Action; excecao ali vira 500 na cara do usuario sem dizer o que houve.

import { podeEscrever } from "@/lib/sheets/abas";
import {
  sheetsEscritaConfigurada,
  sheetsId,
  sheetsSegredo,
  sheetsWebAppUrl,
} from "@/lib/sheets/config";

/**
 * Resposta normalizada de qualquer escrita.
 * `ids` so vem em `inserir` (sao os IDs que o Apps Script gerou -- sem eles o
 * sistema nao consegue casar o registro local com a linha da planilha depois).
 * `dados` carrega o corpo inteiro devolvido pelo Web App, para diagnostico.
 */
export type RespostaEscrita = {
  ok: boolean;
  erro: string | null;
  ids?: string[];
  dados?: unknown;
};

/** Acoes aceitas pelo Web App. Espelha o switch de `executar` no .gs. */
type AcaoEscrita = "ping" | "criarAbas" | "inserir" | "atualizar" | "lista";

/**
 * Teto de espera de uma requisicao ao Apps Script, em milissegundos.
 *
 * Por que existir: o Web App do Apps Script pendura. Ele pode ficar esperando o
 * LockService (que sozinho aguarda 20 s la dentro), pode estar acordando um
 * projeto frio, pode simplesmente nao responder. Sem AbortController o fetch do
 * Node fica pendente ate o runtime desistir, e a Server Action que chamou fica
 * segurando a resposta da pagina junto. Quinze segundos e o ponto em que ja
 * vale mais devolver "a planilha nao respondeu" do que continuar esperando.
 */
const TIMEOUT_MS = 15_000;

/** Nomes das variaveis de ambiente que a escrita exige, na ordem do diagnostico. */
const VARIAVEIS_DE_ESCRITA = [
  ["RARO_SHEETS_ID", sheetsId],
  ["RARO_SHEETS_WEBAPP_URL", sheetsWebAppUrl],
  ["RARO_SHEETS_SEGREDO", sheetsSegredo],
] as const;

/** Quais variaveis de escrita estao faltando agora. Vazio = tudo configurado. */
export function variaveisDeEscritaFaltando(): string[] {
  return VARIAVEIS_DE_ESCRITA.filter(([, ler]) => ler() === null).map(([nome]) => nome);
}

/**
 * Recusa por falta de configuracao, com o nome exato do que falta.
 *
 * Dizer QUAL variavel falta e o ponto: "escrita nao configurada" manda a pessoa
 * conferir tres coisas; "falta RARO_SHEETS_SEGREDO" manda conferir uma. O valor
 * das variaveis nunca aparece -- so o nome.
 */
function erroDeConfiguracao(): RespostaEscrita {
  const faltando = variaveisDeEscritaFaltando();
  return {
    ok: false,
    erro:
      `escrita na planilha nao configurada: falta ${faltando.join(", ")}. ` +
      `Defina no ambiente do deploy (todas server-only, nunca com prefixo NEXT_PUBLIC_).`,
    dados: { faltando },
  };
}

/** Recusa local de aba protegida, ANTES de qualquer rede. */
function erroDeAbaProibida(aba: string): RespostaEscrita {
  return {
    ok: false,
    erro:
      `escrita recusada na aba ${aba}: aba derivada, de configuracao ou fora do contrato. ` +
      `PAINEL, DRE e FLUXO_CAIXA sao calculadas por formula e escrever nelas apaga o trabalho ` +
      `do dono da planilha; CONFIG e INSTRUCOES sao alteradas so a mao.`,
    dados: { aba },
  };
}

/**
 * Texto do erro devolvido pelo Web App, ja normalizado.
 * O .gs as vezes manda `erro: undefined` junto com `ok: true` (caso do
 * `atualizar` sem pendencia), entao "sem erro" tambem precisa virar `null`.
 */
function erroDoCorpo(corpo: Record<string, unknown>): string | null {
  const bruto = corpo.erro;
  if (typeof bruto === "string" && bruto.trim() !== "") return bruto.trim();
  return null;
}

/** `ids` do `inserir`, so quando vier de fato um array de strings. */
function idsDoCorpo(corpo: Record<string, unknown>): string[] | undefined {
  const bruto = corpo.ids;
  if (!Array.isArray(bruto)) return undefined;
  return bruto.map((x) => String(x ?? "")).filter((x) => x !== "");
}

/**
 * Envia uma acao ao Web App e devolve a resposta normalizada.
 *
 * Detalhes que a integracao real exige:
 *  - `cache: "no-store"`: escrita nunca pode ser servida de cache. O Next cacheia
 *    fetch por padrao no App Router, e uma insercao respondida do cache seria uma
 *    venda que o usuario ve como salva e que nunca chegou na planilha.
 *  - `redirect: "follow"` (padrao): o Apps Script responde 302 para
 *    script.googleusercontent.com e so entrega o JSON depois do redirecionamento.
 *  - o segredo vai no CORPO, nunca na URL: URL entra em log de proxy e em
 *    historico; corpo de POST nao.
 *  - nada do segredo entra em mensagem de erro, em `dados` ou em log.
 */
async function chamar(
  acao: AcaoEscrita,
  aba: string | null,
  dados: unknown
): Promise<RespostaEscrita> {
  if (!sheetsEscritaConfigurada()) return erroDeConfiguracao();

  // Depois do guard acima os tres valores existem; o `?? ""` e so para o tipo.
  const url = sheetsWebAppUrl() ?? "";
  const segredo = sheetsSegredo() ?? "";

  // O AbortController e criado por chamada: reaproveitar um ja abortado deixa
  // toda requisicao seguinte nascer cancelada.
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TIMEOUT_MS);

  try {
    const resposta = await fetch(url, {
      method: "POST",
      // text/plain evita o preflight CORS do Apps Script; o corpo continua JSON.
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ segredo, acao, aba, dados }),
      cache: "no-store",
      signal: controle.signal,
    });

    if (!resposta.ok) {
      return {
        ok: false,
        erro:
          `o Web App da planilha respondeu ${resposta.status} na acao ${acao}. ` +
          `Confira se a implantacao esta publicada com acesso "qualquer pessoa" ` +
          `e se RARO_SHEETS_WEBAPP_URL aponta para a versao atual.`,
      };
    }

    const texto = await resposta.text();

    let corpo: unknown;
    try {
      corpo = JSON.parse(texto);
    } catch {
      // Corpo em HTML e o sintoma classico de implantacao exigindo login: o
      // Google devolve a pagina de autenticacao no lugar do JSON.
      return {
        ok: false,
        erro:
          `o Web App da planilha devolveu uma resposta que nao e JSON na acao ${acao}. ` +
          `Normalmente isso e a implantacao pedindo login: republique com ` +
          `"Executar como: eu" e "Quem pode acessar: qualquer pessoa".`,
      };
    }

    if (typeof corpo !== "object" || corpo === null) {
      return { ok: false, erro: `resposta inesperada do Web App na acao ${acao}.` };
    }

    const objeto = corpo as Record<string, unknown>;
    const ok = objeto.ok === true;
    const erro = erroDoCorpo(objeto);

    return {
      ok,
      // Sucesso sem erro devolve null; falha sem texto ganha uma frase minima,
      // porque `ok: false, erro: null` nao diz nada a quem for depurar.
      erro: ok ? erro : erro ?? `a planilha recusou a acao ${acao} sem informar o motivo.`,
      ids: idsDoCorpo(objeto),
      dados: objeto,
    };
  } catch (e) {
    // AbortError e o nosso proprio timeout; o resto e falha de rede/DNS/TLS.
    const abortado = e instanceof Error && e.name === "AbortError";
    const detalhe = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      erro: abortado
        ? `a planilha nao respondeu em ${TIMEOUT_MS / 1000}s na acao ${acao}. ` +
          `O Apps Script as vezes pendura esperando o lock de escrita; tente de novo.`
        : `falha de rede ao falar com o Web App da planilha na acao ${acao}: ${detalhe}`,
    };
  } finally {
    clearTimeout(relogio);
  }
}

/**
 * Diagnostico: confirma que a URL responde, que o segredo bate e devolve a lista
 * de abas com contagem de linhas. Nao escreve nada.
 */
export async function pingPlanilha(): Promise<RespostaEscrita> {
  return chamar("ping", null, null);
}

/**
 * Acrescenta linhas no fim de uma aba. As chaves de cada objeto sao os TITULOS
 * das colunas da planilha (o .gs casa por titulo, ignorando acento e caixa),
 * nunca indices -- coluna arrastada de lugar continua caindo no lugar certo.
 *
 * A checagem de `podeEscrever` acontece ANTES da rede, mesmo o .gs tendo a sua
 * propria lista de abas proibidas. Defesa em duas camadas de proposito: a
 * checagem local garante que um erro de codigo nunca chegue perto das formulas
 * do dono, e ainda economiza uma ida ao Google para uma requisicao que ja se
 * sabe recusada.
 */
export async function inserirLinhas(
  aba: string,
  linhas: Record<string, unknown>[]
): Promise<RespostaEscrita> {
  if (!podeEscrever(aba)) return erroDeAbaProibida(aba);
  if (linhas.length === 0) {
    return { ok: false, erro: `nenhuma linha para inserir na aba ${aba}.` };
  }
  return chamar("inserir", aba, linhas);
}

/**
 * Sobrescreve SO as colunas enviadas da linha com aquele ID. Nunca cria linha e
 * nunca apaga: ID inexistente volta como erro do proprio .gs, porque criar a
 * linha no lugar de atualizar duplicaria faturamento em silencio.
 */
export async function atualizarLinha(
  aba: string,
  id: string,
  campos: Record<string, unknown>
): Promise<RespostaEscrita> {
  if (!podeEscrever(aba)) return erroDeAbaProibida(aba);

  const alvo = String(id ?? "").trim();
  if (alvo === "") {
    return { ok: false, erro: `atualizacao na aba ${aba} sem ID: nao ha linha para localizar.` };
  }

  // O ID vai por ultimo de proposito: se `campos` trouxer um ID divergente, o
  // parametro explicito da funcao e que vale.
  return chamar("atualizar", aba, { ...campos, ID: alvo });
}

/**
 * Cria na planilha as 15 abas novas que ainda nao existirem. Idempotente: rodar
 * duas vezes nao faz nada na segunda, nao reordena aba, nao apaga nada e nao
 * toca nas abas que o dono ja tinha.
 */
export async function criarAbasDoSistema(): Promise<RespostaEscrita> {
  return chamar("criarAbas", null, null);
}
