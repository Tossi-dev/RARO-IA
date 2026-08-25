"use server";

import { gerarTexto } from "../integracoes/ia";
import { criarSupabaseServer } from "../supabase/server";
import { lerResposta, montarPrompt } from "./analise-sessao";

export async function analisarSessao(formData: FormData): Promise<void> {
  const mentoradoId = String(formData.get("mentoradoId") ?? "").trim();
  const sessaoId = String(formData.get("sessaoId") ?? "").trim();
  const nome = String(formData.get("nome") ?? "").trim();
  const resumo = String(formData.get("resumo") ?? "").trim();
  if (!mentoradoId || !sessaoId || !nome || !resumo) return;
  const resposta = await gerarTexto(montarPrompt({ resumo }, { nome }, []));
  if (resposta.provider === "demo") return;
  const analise = lerResposta(resposta.texto);
  if (!analise) return;
  const supabase = criarSupabaseServer();
  const { data: usuario } = await supabase.auth.getUser();
  if (!usuario.user?.id) return;
  await supabase.from("analise_sessao").insert({
    sessao_id: sessaoId, mentorado_id: mentoradoId, pontos_fortes: analise.pontosFortes,
    riscos: analise.riscos, recomendacoes: analise.recomendacoes, modelo: resposta.provider, gerada_por: usuario.user.id,
  });
}
