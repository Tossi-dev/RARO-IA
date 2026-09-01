// Vínculo privado do áudio de uma sessão antes de qualquer transcrição.
// Esta ação não chama fornecedor e não aceita workspace/mentorado do formulário.

import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { criarSupabaseServer } from "../supabase/server";
import { validarArquivo } from "./acoes-transcricao";

const BUCKET_TRANSCRICOES = "transcricoes";

export const MOTIVO_CONSENTIMENTO_NAO_CONFIRMADO =
  "Confirme o consentimento explícito para vincular o áudio desta sessão.";
const MOTIVO_SESSAO_INVALIDA = "Sessão inválida.";
const MOTIVO_SESSAO_NAO_ENCONTRADA = "Sessão não encontrada.";
const MOTIVO_ERRO_LEITURA = "Não foi possível carregar os dados da sessão agora. Tente novamente em instantes.";
const MOTIVO_ERRO_ENVIO = "Não foi possível vincular o áudio privado agora. Tente novamente em instantes.";
const MOTIVO_AUDIO_JA_VINCULADO = "Esta sessão já tem um áudio privado vinculado. Não substitua o registro sem arquivamento explícito.";

export type ResultadoVinculoAudio = { ok: true } | { ok: false; erro: string };

const EntradaSchema = z.object({
  sessaoId: z.string().trim().min(1, MOTIVO_SESSAO_INVALIDA).max(100, MOTIVO_SESSAO_INVALIDA),
  confirmarConsentimento: z.literal("1"),
});

function linha(valor: unknown): Record<string, unknown> | null {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null;
}

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

function avisar(ponto: string, erro: unknown): void {
  const codigo = erro && typeof erro === "object" && "code" in erro ? String((erro as { code?: unknown }).code ?? "") : "";
  console.warn(`[transcricao/arquivo] ${ponto} falhou`, codigo);
}

function extensaoSegura(nome: string): string {
  const encontrada = /\.([A-Za-z0-9]{1,8})$/.exec(nome);
  return encontrada ? `.${encontrada[1].toLowerCase()}` : ".audio";
}

function caminhoPrivado(workspaceId: string, sessaoId: string, nome: string): string {
  return `${workspaceId}/sessao/${sessaoId}/${randomUUID()}${extensaoSegura(nome)}`;
}

async function sha256(arquivo: Blob): Promise<string> {
  return createHash("sha256").update(Buffer.from(await arquivo.arrayBuffer())).digest("hex");
}

/**
 * Registra a autorização por sessão e vincula o objeto privado antes da ação
 * de transcrever. O arquivo permanece inacessível pelo portal e a próxima
 * etapa recebe apenas `sessaoId`, não um Blob livre do navegador.
 */
export async function vincularAudioDaSessao(formData: FormData): Promise<ResultadoVinculoAudio> {
  const entrada = EntradaSchema.safeParse({
    sessaoId: String(formData.get("sessaoId") ?? ""),
    confirmarConsentimento: String(formData.get("confirmarConsentimento") ?? ""),
  });
  if (!entrada.success) {
    const confirmou = String(formData.get("confirmarConsentimento") ?? "") === "1";
    return { ok: false, erro: confirmou ? MOTIVO_SESSAO_INVALIDA : MOTIVO_CONSENTIMENTO_NAO_CONFIRMADO };
  }
  const arquivo = validarArquivo(formData.get("arquivo"));
  if (!arquivo.ok) return arquivo;

  try {
    const s = criarSupabaseServer();
    const { data: sessaoData, error: erroSessao } = await s
      .from("sessao")
      .select("id, workspace_id, matricula_id")
      .eq("id", entrada.data.sessaoId)
      .maybeSingle();
    if (erroSessao) {
      avisar("sessao", erroSessao);
      return { ok: false, erro: MOTIVO_ERRO_LEITURA };
    }
    const sessao = linha(sessaoData);
    const workspaceId = texto(sessao?.workspace_id);
    const matriculaId = texto(sessao?.matricula_id);
    if (!sessao || texto(sessao.id) !== entrada.data.sessaoId || workspaceId === "" || matriculaId === "") {
      return { ok: false, erro: MOTIVO_SESSAO_NAO_ENCONTRADA };
    }

    const { data: matriculaData, error: erroMatricula } = await s
      .from("matricula")
      .select("id, mentorado_id")
      .eq("id", matriculaId)
      .maybeSingle();
    if (erroMatricula) {
      avisar("matricula", erroMatricula);
      return { ok: false, erro: MOTIVO_ERRO_LEITURA };
    }
    const mentoradoId = texto(linha(matriculaData)?.mentorado_id);
    if (mentoradoId === "") return { ok: false, erro: MOTIVO_SESSAO_NAO_ENCONTRADA };

    const base = { workspace_id: workspaceId, mentorado_id: mentoradoId, sessao_id: entrada.data.sessaoId };
    const { error: erroConsentimento } = await s
      .from("sessao_transcricao_consentimento")
      .upsert({ ...base, consentido: true }, { onConflict: "workspace_id,sessao_id" });
    if (erroConsentimento) {
      avisar("consentimento", erroConsentimento);
      return { ok: false, erro: MOTIVO_ERRO_ENVIO };
    }

    // Não sobrescrevemos a referência única: trocar o caminho criaria um
    // objeto anterior sem trilha. Arquivamento/substituição é fluxo próprio.
    const { data: referenciaExistenteData, error: erroReferenciaExistente } = await s
      .from("sessao_transcricao_arquivo")
      .select("caminho_storage")
      .eq("sessao_id", entrada.data.sessaoId)
      .maybeSingle();
    if (erroReferenciaExistente) {
      avisar("referencia/existente", erroReferenciaExistente);
      return { ok: false, erro: MOTIVO_ERRO_LEITURA };
    }
    const caminhoExistente = texto(linha(referenciaExistenteData)?.caminho_storage);
    if (caminhoExistente !== "") return { ok: false, erro: MOTIVO_AUDIO_JA_VINCULADO };

    const caminho = caminhoPrivado(workspaceId, entrada.data.sessaoId, arquivo.nome);
    const { error: erroUpload } = await s.storage
      .from(BUCKET_TRANSCRICOES)
      .upload(caminho, arquivo.blob, { contentType: arquivo.blob.type, upsert: false });
    if (erroUpload) {
      avisar("upload", erroUpload);
      return { ok: false, erro: MOTIVO_ERRO_ENVIO };
    }

    const { error: erroReferencia } = await s
      .from("sessao_transcricao_arquivo")
      .insert({ ...base, caminho_storage: caminho, sha256: await sha256(arquivo.blob), mime: arquivo.blob.type, bytes: arquivo.blob.size, arquivado: false });
    if (erroReferencia) {
      avisar("referencia", erroReferencia);
      // Este é o único delete permitido no fluxo: o objeto acabou de ser
      // criado nesta tentativa e não ganhou referência auditável. A chave é
      // aleatória e exata; falhar ao limpar não mascara a falha original.
      const { error: erroLimpeza } = await s.storage.from(BUCKET_TRANSCRICOES).remove([caminho]);
      if (erroLimpeza) avisar("referencia/limpeza", erroLimpeza);
      return { ok: false, erro: MOTIVO_ERRO_ENVIO };
    }
    return { ok: true };
  } catch (erro) {
    avisar("vincular", erro);
    return { ok: false, erro: MOTIVO_ERRO_ENVIO };
  }
}
