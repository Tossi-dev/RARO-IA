// A leitura da página PÚBLICA de proposta.
//
// ============================================================
// A SEGUNDA (E ÚLTIMA) LEITURA DO SISTEMA SEM LOGIN
// ============================================================
//
// A primeira é `dados-certificado.ts`, e o cabeçalho de lá vale inteiro aqui:
// não há sessão, então NADA nesta leitura toca em tabela. Quem responde é
// `proposta_publica` (migração 0025), função `security definer` de retorno
// fechado — cinco colunas e nada além delas.
//
// Um `.from("proposta")` aqui não funcionaria (não existe política de select
// para `anon`, e não pode existir), e o dia em que alguém "consertasse" isso
// criando a política estaria publicando o pipeline inteiro — valor negociado
// e motivo de perda de cada cliente — para quem tem a chave pública.
//
// ============================================================
// UMA RESPOSTA SÓ PARA TODOS OS "NÃO"
// ============================================================
//
// Token mal formado, token que não existe, proposta em rascunho, proposta
// vencida: os quatro devolvem EXATAMENTE a mesma coisa. Não é preguiça de
// mensagem — é o contrário.
//
// Respostas diferentes para casos diferentes formam um oráculo: quem estiver
// varrendo tokens aprende, de graça, que aquele token existe (só que a
// proposta está vencida), ou que o formato que está tentando já é o certo. Um
// oráculo desses transforma um espaço de busca inviável num jogo de
// tentativa e erro com pistas.
//
// Por isso a função do banco também não distingue: ela devolve zero linhas
// nos quatro casos, e este módulo devolve o mesmo objeto.
//
// ============================================================
// SEM SAL, SEM HASH — E A VISITA CONTINUA SENDO CONTADA
// ============================================================
//
// `proposta_visita` guarda `ip_hash` e `agente_hash`, nunca o valor cru. O
// hash é feito AQUI, no servidor, e o endereço nunca chega ao banco.
//
// Só que hash de IPv4 sem sal não é anonimato: são quatro bilhões de valores
// possíveis, e uma tabela inteira sai por força bruta numa tarde. Então a
// regra é: SEM `RARO_SAL_VISITA` configurado, não se guarda hash nenhum —
// vai texto vazio. A visita continua virando linha (que é o que interessa:
// "abriram três vezes"), e o que não dá para proteger simplesmente não é
// guardado.

import { createHash } from "node:crypto";
import { tokenValido } from "./proposta-token";
import { supabaseConfigurado } from "../data";
import { criarSupabaseServer } from "../supabase/server";

/** A frase única. Ver o cabeçalho: não descreve o formato do token, não diz
 *  se existe, não diz se venceu. */
export const MOTIVO_INDISPONIVEL =
  "Esta proposta não está disponível. Se você recebeu este link de alguém da equipe, peça um link novo.";
const MOTIVO_SEM_CONEXAO =
  "Não foi possível abrir esta proposta agora. Tente novamente em instantes.";
const MAX_DETALHE_LOG = 40;
/** Metade de um sha-256 já é mais do que suficiente para contar visita, e
 *  guarda menos do que o hash inteiro. */
const TAMANHO_HASH = 32;

export interface PropostaPublica {
  /** `false` = não deu para perguntar ao banco. Diferente de "não existe". */
  conectado: boolean;
  /** Vazio quando há proposta; frase humana nos demais casos. */
  motivo: string;
  encontrada: boolean;
  titulo: string;
  corpo: string;
  valor: number;
  validade: string | null;
  status: string;
}

function indisponivel(motivo: string, conectado: boolean): PropostaPublica {
  return {
    conectado,
    motivo,
    encontrada: false,
    titulo: "",
    corpo: "",
    valor: 0,
    validade: null,
    status: "",
  };
}

function avisar(operacao: string, erro: unknown): void {
  const e = (erro ?? {}) as { code?: string };
  console.warn(
    `[comercial/proposta-publica] ${operacao} falhou`,
    String(e.code ?? "sem-codigo").slice(0, MAX_DETALHE_LOG),
  );
}

/**
 * O hash da visita — ou texto vazio, quando não há sal para protegê-lo.
 *
 * Ver o cabeçalho. O sal entra por PARÂMETRO para esta função ser testável
 * sem mexer no ambiente do processo, no mesmo espírito de `AmbienteAcesso`
 * (acesso.ts).
 */
export function hashDeVisita(valor: unknown, sal: string): string {
  if (typeof valor !== "string" || valor.trim() === "") return "";
  if (typeof sal !== "string" || sal === "") return "";
  return createHash("sha256").update(`${sal}|${valor}`).digest("hex").slice(0, TAMANHO_HASH);
}

/**
 * Abre uma proposta por token e registra a visita.
 *
 * O token é conferido ANTES de qualquer ida ao banco: token fora de forma não
 * vira pergunta. A função do banco confere de novo — ela é a barreira; isto
 * aqui evita transformar lixo de URL em consulta.
 */
export async function lerPropostaPublica(
  token: string,
  ip = "",
  agente = "",
  sal = process.env.RARO_SAL_VISITA ?? "",
): Promise<PropostaPublica> {
  if (!tokenValido(token)) return indisponivel(MOTIVO_INDISPONIVEL, true);
  if (!supabaseConfigurado()) return indisponivel(MOTIVO_SEM_CONEXAO, false);

  try {
    const s = criarSupabaseServer();
    const { data, error } = await s.rpc("proposta_publica", {
      p_token: token,
      p_ip_hash: hashDeVisita(ip, sal),
      p_agente_hash: hashDeVisita(agente, sal),
    });

    if (error) {
      avisar("proposta_publica", error);
      return indisponivel(MOTIVO_SEM_CONEXAO, false);
    }

    const linhas = (data ?? []) as Array<Record<string, unknown>>;
    // Zero linhas: token inexistente, rascunho ou vencida — a mesma resposta
    // para os três, e a mesma que o token mal formado recebeu lá em cima.
    if (linhas.length === 0) return indisponivel(MOTIVO_INDISPONIVEL, true);

    const r = linhas[0];
    return {
      conectado: true,
      motivo: "",
      encontrada: true,
      titulo: String(r.titulo ?? ""),
      corpo: String(r.corpo ?? ""),
      valor: Number(r.valor ?? 0),
      validade: typeof r.validade === "string" ? r.validade : null,
      status: String(r.status ?? ""),
    };
  } catch (excecao) {
    avisar("proposta_publica", { code: excecao instanceof Error ? excecao.name : "excecao" });
    return indisponivel(MOTIVO_SEM_CONEXAO, false);
  }
}
