// Auditoria executável de RLS da Fase 2. Não usa chave de serviço: cada
// tentativa acontece com o JWT efêmero do papel que deve ser recusado.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type Papel = "anon" | "mentorado" | "comercial" | "gestor";
type TipoOperacao = "select" | "patch" | "proposta_publica";

export interface AlvosAuditoria {
  leituraAlheia: Record<string, string>;
  patchAlheio: Record<string, string>;
  patchProprio: Record<string, string>;
  mentoradoAlheioId?: string;
  tokenPropostaPublica: string;
}

export interface OperacaoAuditoria {
  tipo: TipoOperacao;
  papel: Papel;
  tabela: string;
  alvo?: string;
}

export interface ResultadoAuditoria {
  linhas: number;
  campos?: string[];
}

export interface ExecutorAuditoria {
  executar(operacao: OperacaoAuditoria): Promise<ResultadoAuditoria>;
}

export interface ConfiguracaoAuditoria {
  url: string;
  chaveAnonima: string;
  tokens: Record<Exclude<Papel, "anon">, string>;
  alvos: AlvosAuditoria;
}

const TABELAS_LEITURA_NEGADA = [
  "cobranca",
  "oportunidade",
  "analise_sessao",
  "analise_call",
  "patrimonio",
  "investimento",
  "renda_pessoal",
] as const;
const TABELAS_GESTOR_NEGADAS = ["patrimonio", "investimento", "renda_pessoal"] as const;
const TABELAS_PATCH_NEGADO = ["progresso_trilha", "onboarding_progresso", "post_destinatario"] as const;
const CAMPOS_PROPOSTA_PUBLICA = ["titulo", "corpo", "valor", "validade", "status"] as const;
type Ambiente = Record<string, string | undefined>;

function obrigatorio(env: Ambiente, nome: string): string {
  const valor = env[nome]?.trim();
  if (!valor) throw new Error(`Configuração ausente: ${nome}`);
  return valor;
}

function alvosValidos(valor: unknown): valor is AlvosAuditoria {
  if (!valor || typeof valor !== "object") return false;
  const alvos = valor as Partial<AlvosAuditoria>;
  return Boolean(
    alvos.leituraAlheia &&
      alvos.patchAlheio &&
      alvos.patchProprio &&
      typeof alvos.tokenPropostaPublica === "string" &&
      alvos.tokenPropostaPublica
  );
}

/** Lê apenas os nomes de configuração necessários; nunca tem fallback de credencial. */
export function carregarConfiguracao(env: Ambiente): ConfiguracaoAuditoria {
  const url = obrigatorio(env, "SUPABASE_AUDIT_URL");
  const chaveAnonima = obrigatorio(env, "SUPABASE_AUDIT_ANON_KEY");
  const tokens = {
    mentorado: obrigatorio(env, "SUPABASE_AUDIT_MENTORADO_A_TOKEN"),
    comercial: obrigatorio(env, "SUPABASE_AUDIT_COMERCIAL_TOKEN"),
    gestor: obrigatorio(env, "SUPABASE_AUDIT_GESTOR_TOKEN"),
  };
  let lido: unknown;
  try {
    lido = JSON.parse(obrigatorio(env, "SUPABASE_AUDIT_ALVOS_JSON"));
  } catch {
    throw new Error("Configuração inválida: SUPABASE_AUDIT_ALVOS_JSON");
  }
  if (!alvosValidos(lido)) throw new Error("Configuração inválida: SUPABASE_AUDIT_ALVOS_JSON");
  return { url, chaveAnonima, tokens, alvos: lido };
}

function alvoDe(mapa: Record<string, string>, tabela: string): string {
  const alvo = mapa[tabela];
  if (!alvo) throw new Error(`Alvo ausente para ${tabela}`);
  return alvo;
}

/** O plano é puro para que a cobertura não dependa do projeto Supabase. */
export function montarPlanoAuditoria(alvos: AlvosAuditoria): OperacaoAuditoria[] {
  const plano: OperacaoAuditoria[] = [];
  for (const tabela of TABELAS_LEITURA_NEGADA) {
    const alvo = alvoDe(alvos.leituraAlheia, tabela);
    plano.push({ tipo: "select", papel: "mentorado", tabela, alvo });
    plano.push({ tipo: "select", papel: "comercial", tabela, alvo });
  }
  for (const tabela of TABELAS_GESTOR_NEGADAS) {
    plano.push({ tipo: "select", papel: "gestor", tabela, alvo: alvoDe(alvos.leituraAlheia, tabela) });
  }
  for (const tabela of TABELAS_PATCH_NEGADO) {
    plano.push({ tipo: "patch", papel: "mentorado", tabela, alvo: alvoDe(alvos.patchAlheio, tabela) });
  }
  plano.push({ tipo: "patch", papel: "mentorado", tabela: "progresso_trilha", alvo: alvoDe(alvos.patchProprio, "progresso_trilha") });
  plano.push({ tipo: "select", papel: "anon", tabela: "proposta", alvo: "*" });
  plano.push({ tipo: "proposta_publica", papel: "anon", tabela: "proposta_publica" });
  return plano;
}

function mesmosCampos(campos: string[] | undefined): boolean {
  if (!campos || campos.length !== CAMPOS_PROPOSTA_PUBLICA.length) return false;
  return [...campos].sort().every((campo, indice) => campo === [...CAMPOS_PROPOSTA_PUBLICA].sort()[indice]);
}

/** Toda leitura/escrita proibida precisa afetar zero linhas; uma linha é falha crítica. */
export async function executarAuditoria(
  executor: ExecutorAuditoria,
  plano: OperacaoAuditoria[]
): Promise<{ operacoes: number }> {
  for (const operacao of plano) {
    const resultado = await executor.executar(operacao);
    if (operacao.tipo === "proposta_publica") {
      if (resultado.linhas !== 1 || !mesmosCampos(resultado.campos)) {
        throw new Error("proposta_publica não retornou exatamente os campos públicos esperados");
      }
    } else if (resultado.linhas !== 0) {
      throw new Error(`${operacao.tabela}: ${operacao.papel} afetou ${resultado.linhas} linha(s)`);
    }
  }
  return { operacoes: plano.length };
}

function clientePara(configuracao: ConfiguracaoAuditoria, papel: Papel): SupabaseClient {
  const token = papel === "anon" ? undefined : configuracao.tokens[papel];
  return createClient(configuracao.url, configuracao.chaveAnonima, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
  });
}

function numeroDeLinhas(data: unknown): number {
  return Array.isArray(data) ? data.length : data === null ? 0 : 1;
}

/** Adaptador real, separado do plano e sem saída de dados ou tokens. */
export function criarExecutorSupabase(configuracao: ConfiguracaoAuditoria): ExecutorAuditoria {
  return {
    async executar(operacao) {
      const cliente = clientePara(configuracao, operacao.papel);
      if (operacao.tipo === "proposta_publica") {
        const { data, error } = await cliente.rpc("proposta_publica", {
          p_token: configuracao.alvos.tokenPropostaPublica,
          p_ip_hash: "",
          p_agente_hash: "",
        });
        if (error) throw new Error(`proposta_publica: ${error.code ?? "erro"}`);
        const linha = Array.isArray(data) ? data[0] : data;
        return { linhas: numeroDeLinhas(data), campos: linha && typeof linha === "object" ? Object.keys(linha) : [] };
      }

      if (operacao.tipo === "select") {
        const consulta = cliente.from(operacao.tabela).select("id");
        const { data, error } = operacao.alvo === "*" ? await consulta : await consulta.eq("id", operacao.alvo!);
        if (error) throw new Error(`${operacao.tabela}: ${error.code ?? "erro"}`);
        return { linhas: numeroDeLinhas(data) };
      }

      const tentativa =
        operacao.alvo === configuracao.alvos.patchProprio[operacao.tabela]
          ? { mentorado_id: configuracao.alvos.mentoradoAlheioId ?? "00000000-0000-0000-0000-000000000000" }
          : { id: operacao.alvo };
      const { data, error } = await cliente.from(operacao.tabela).update(tentativa).eq("id", operacao.alvo!).select("id");
      if (error) throw new Error(`${operacao.tabela}: ${error.code ?? "erro"}`);
      return { linhas: numeroDeLinhas(data) };
    },
  };
}

async function main(): Promise<void> {
  const configuracao = carregarConfiguracao(process.env);
  const resultado = await executarAuditoria(criarExecutorSupabase(configuracao), montarPlanoAuditoria(configuracao.alvos));
  console.log(`Auditoria RLS aprovada: ${resultado.operacoes} operações negativas verificadas.`);
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/auditar-rls-fase2.ts")) {
  main().catch((erro: unknown) => {
    console.error(erro instanceof Error ? erro.message : "Falha na auditoria RLS");
    process.exitCode = 1;
  });
}
