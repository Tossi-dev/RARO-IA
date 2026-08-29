import { revalidatePath } from "next/cache";
import { criarSupabaseServer } from "../supabase/server";
import { prepararTranscricaoManual, type ResultadoTranscricaoManual } from "./transcricao-manual";
import type { ConsentimentosAtendimento } from "./consentimento";

const MAX_ID = 100;
const MAX_TEXTO = 100_000;
const ERRO = "Não foi possível salvar a transcrição agora. Tente novamente em instantes.";
const ERRO_SESSAO = "Sessão não encontrada.";

type Linha = Record<string, unknown>;
function linha(v: unknown): Linha | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? v as Linha : null;
}
function texto(v: unknown): string { return typeof v === "string" ? v.trim() : ""; }
function booleano(v: unknown): boolean { return v === true; }

function consentimentosDe(linhas: unknown): ConsentimentosAtendimento {
  const resultado: Record<string, boolean> = { mapa: false, reflexao: false, meta: false, transcricao: false, portal: false };
  if (Array.isArray(linhas)) {
    for (const bruto of linhas) {
      const r = linha(bruto);
      const categoria = texto(r?.categoria);
      if (Object.prototype.hasOwnProperty.call(resultado, categoria)) resultado[categoria] = booleano(r?.consentido);
    }
  }
  return resultado as ConsentimentosAtendimento;
}

export type ResultadoAcaoTranscricaoManual =
  | Readonly<{ ok: true; caracteres: number }>
  | Readonly<{ ok: false; erro: string }>;

/**
 * Registra uma transcrição colada/digitada pelo profissional.
 *
 * Identidade, sessão e consentimento são sempre derivados no servidor:
 * `sessao` é lida pelo cliente autenticado (RLS), a matrícula fornece o
 * mentorado e os consentimentos são consultados sem aceitar equivalentes do
 * formulário. Nenhum dado é enviado a fornecedor externo.
 */
export async function registrarTranscricaoManual(formulario: FormData): Promise<ResultadoAcaoTranscricaoManual> {
  const sessaoId = texto(formulario.get("sessaoId"));
  const transcricao = String(formulario.get("texto") ?? "");
  const visibilidade = texto(formulario.get("visibilidade"));
  const substituir = String(formulario.get("substituir") ?? "") === "1";
  if (!sessaoId || sessaoId.length > MAX_ID || transcricao.trim() === "" || transcricao.length > MAX_TEXTO) {
    return { ok: false, erro: ERRO };
  }

  try {
    const supabase = criarSupabaseServer();
    const sessaoResultado = await supabase.from("sessao").select("id, matricula_id, transcricao, transcrita_em").eq("id", sessaoId).maybeSingle();
    if (sessaoResultado.error) return { ok: false, erro: ERRO };
    const sessao = linha(sessaoResultado.data);
    // RLS intentionally collapses another workspace and an unknown id.
    if (!sessao) return { ok: false, erro: ERRO_SESSAO };
    if ((texto(sessao.transcricao) !== "" || texto(sessao.transcrita_em) !== "") && !substituir) return { ok: false, erro: ERRO };

    const matriculaId = texto(sessao.matricula_id);
    if (!matriculaId) return { ok: false, erro: ERRO_SESSAO };
    const matriculaResultado = await supabase.from("matricula").select("mentorado_id").eq("id", matriculaId).maybeSingle();
    if (matriculaResultado.error) return { ok: false, erro: ERRO };
    const mentoradoId = texto(linha(matriculaResultado.data)?.mentorado_id);
    if (!mentoradoId) return { ok: false, erro: ERRO_SESSAO };

    const consentimentoResultado = await supabase.from("atendimento_consentimento").select("categoria, consentido").eq("mentorado_id", mentoradoId);
    if (consentimentoResultado.error) return { ok: false, erro: ERRO };
    const preparado: ResultadoTranscricaoManual = prepararTranscricaoManual({
      texto: transcricao,
      visibilidade,
      // This is the only source of consent. Form fields with similar names
      // are deliberately ignored.
      consentimentos: consentimentosDe(consentimentoResultado.data),
      acessoPermitido: true,
    });
    if (!preparado.ok) return { ok: false, erro: preparado.erro };

    const { error: erroAtualizacao } = await supabase.from("sessao").update({
      transcricao: preparado.valor.texto,
      transcrita_em: new Date().toISOString(),
      transcricao_origem: "manual",
      transcricao_liberada: preparado.valor.compartilhavel,
    }).eq("id", sessaoId);
    if (erroAtualizacao) return { ok: false, erro: ERRO };
    revalidatePath(`/mentoria/${mentoradoId}`);
    revalidatePath("/portal");
    return { ok: true, caracteres: preparado.valor.texto.length };
  } catch {
    return { ok: false, erro: ERRO };
  }
}
