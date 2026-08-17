// A escrita do diagnóstico — a única parte deste módulo que toca no banco.
//
// Duas operações, as duas de máquina, as duas com a chave de serviço
// (`supabase/servico.ts` explica por que essa exceção existe):
//
//   1. `gravarDiagnostico` — a landing terminou as cinco perguntas.
//   2. `casarJuncoes`      — chegou a mensagem de WhatsApp com o código.
//
// Nenhuma delas roda a partir do navegador de ninguém.

import { acharPorTelefone, formatarTelefone } from "@/lib/atendimento/telefone";
import { criarSupabaseServico } from "@/lib/supabase/servico";
import type { Faixa, Inacabados, MotivoRecusa, Trava, Urgencia } from "./codigo";
import type { JuncaoPlanejada } from "./juncao";

export interface EntradaDiagnostico {
  codigo: string;
  faturamento: Faixa | MotivoRecusa;
  papel: "D" | "G" | "N" | null;
  trava: Trava | null;
  inacabados: Inacabados | null;
  urgencia: Urgencia | null;
  origem: string;
}

export type ResultadoGravacao =
  | { estado: "gravado" }
  | { estado: "repetido" }
  | { estado: "sem-configuracao" }
  | { estado: "falhou"; motivo: string };

/**
 * Grava as cinco respostas. Idempotente por código.
 *
 * QUALIFICAÇÃO É CALCULADA AQUI, NÃO RECEBIDA
 * -------------------------------------------
 * O que vem do browser é resposta; veredito é do servidor. Aceitar um campo
 * `qualificado` do corpo deixaria qualquer pessoa entrar na fila de
 * atendimento com uma linha de curl.
 *
 * REPETIDO NÃO É ERRO
 * -------------------
 * Rede de celular repete POST, e a pessoa pode apertar o botão duas vezes. O
 * `on conflict do nothing` transforma isso em nada — e é seguro justamente
 * porque o código carrega um sufixo sorteado por preenchimento: dois leads
 * diferentes nunca colidem, então conflito aqui só pode ser a mesma pessoa.
 */
export async function gravarDiagnostico(e: EntradaDiagnostico): Promise<ResultadoGravacao> {
  const s = criarSupabaseServico();
  if (!s) return { estado: "sem-configuracao" };

  const qualificado = ["A", "B", "C"].includes(e.faturamento) && e.papel === "D";

  const { data, error } = await s
    .from("diagnostico_lead")
    .upsert(
      {
        codigo: e.codigo,
        faturamento: e.faturamento,
        papel: e.papel,
        trava: e.trava,
        inacabados: e.inacabados,
        urgencia: e.urgencia,
        qualificado,
        origem: e.origem,
      },
      { onConflict: "codigo", ignoreDuplicates: true }
    )
    .select("codigo");

  if (error) return { estado: "falhou", motivo: error.message };
  // `ignoreDuplicates` devolve lista vazia quando não gravou nada: já existia.
  return (data?.length ?? 0) > 0 ? { estado: "gravado" } : { estado: "repetido" };
}

export interface ResultadoJuncao {
  /** Diagnósticos que ganharam dono agora. */
  casados: number;
  /** Fichas de cliente que precisaram nascer para a mensagem ter dono. */
  fichasCriadas: number;
  /**
   * Códigos que chegaram na mensagem sem linha correspondente no banco.
   * Não são descarte: viram registro montado a partir do próprio código.
   */
  reconstruidos: number;
}

const VAZIO: ResultadoJuncao = { casados: 0, fichasCriadas: 0, reconstruidos: 0 };

/**
 * Junta as mensagens que trazem código com os diagnósticos já gravados.
 *
 * POR QUE ESTA FUNÇÃO ACHA OU CRIA A FICHA DO CLIENTE POR CONTA PRÓPRIA
 * ---------------------------------------------------------------------
 * `registrarInteracoes` já faz isso para o lote inteiro, e o normal é que a
 * ficha já exista quando esta função roda. Ela procura mesmo assim, e cria se
 * não achar, por um motivo: as duas escritas usam chaves diferentes (aquela vai
 * pela sessão, esta pela chave de serviço) e portanto podem falhar
 * separadamente. Um lead que respondeu as cinco perguntas, mandou a mensagem e
 * sumiu porque a gravação do lote quebrou seria a pior falha possível deste
 * funil — o único caso em que a pessoa fez tudo certo e o sistema perdeu.
 * Aqui a junção se vira sozinha, e o custo é uma consulta a mais por lote.
 *
 * CÓDIGO SEM REGISTRO NÃO SE DESCARTA
 * -----------------------------------
 * Se `/api/diagnostico` estava fora do ar quando a pessoa preencheu, a linha
 * não existe — mas a mensagem chegou, e o código carrega o segmento inteiro.
 * O registro é reconstruído a partir dele, marcado na origem. É a rota de
 * degradação do funil: o sistema cai, o papel continua funcionando.
 */
export async function casarJuncoes(plano: JuncaoPlanejada[]): Promise<ResultadoJuncao> {
  if (plano.length === 0) return { ...VAZIO };

  const s = criarSupabaseServico();
  if (!s) return { ...VAZIO };

  const r: ResultadoJuncao = { ...VAZIO };

  const { data: fichas } = await s.from("alunos").select("id, telefone");
  const conhecidos = (fichas ?? []).map((f) => ({ id: String(f.id), telefone: String(f.telefone ?? "") }));

  for (const j of plano) {
    // a. de quem é esta mensagem
    let alunoId = acharPorTelefone(conhecidos, j.telefone)?.id ?? "";

    if (alunoId === "") {
      const { data: nova, error } = await s
        .from("alunos")
        .insert({
          nome: j.nomeExibicao !== "" ? j.nomeExibicao : formatarTelefone(j.telefone),
          telefone: j.telefone,
          email: "",
          status_funil: "potencial",
          // A origem distingue quem chegou pelo diagnóstico de quem só mandou
          // mensagem. É por ela que se mede o funil inteiro depois.
          origem: "landing-diagnostico",
          primeiro_contato: (j.quando || new Date().toISOString()).slice(0, 10),
          observacoes: "",
        })
        .select("id")
        .single();
      if (error || !nova) continue;
      alunoId = String(nova.id);
      conhecidos.push({ id: alunoId, telefone: j.telefone });
      r.fichasCriadas++;
    }

    // b. casar — só quando ainda não tem dono. `casado_em` responde "quando ele
    //    te procurou", e reescrever isso a cada reconexão do agente trocaria a
    //    data do primeiro contato pela data do último reenvio.
    const { data: casado } = await s
      .from("diagnostico_lead")
      .update({ aluno_id: alunoId, casado_em: j.quando || new Date().toISOString() })
      .eq("codigo", j.codigo)
      .is("aluno_id", null)
      .select("codigo");

    if ((casado?.length ?? 0) > 0) {
      r.casados++;
      continue;
    }

    // c. não casou: ou já tinha dono (reenvio — nada a fazer), ou a linha não
    //    existe e precisa ser reconstruída a partir do próprio código.
    const { data: existe } = await s
      .from("diagnostico_lead")
      .select("codigo")
      .eq("codigo", j.codigo)
      .maybeSingle();
    if (existe) continue;

    const seg = j.segmento;
    const { error: erroReconstrucao } = await s.from("diagnostico_lead").insert({
      codigo: j.codigo,
      faturamento: seg.faixa,
      // Só quem é dono recebe botão de WhatsApp na landing. Uma mensagem com
      // código qualificado só pode ter vindo de um.
      papel: "D",
      trava: seg.travaDeclarada,
      inacabados: seg.inacabados,
      urgencia: seg.urgencia,
      qualificado: true,
      origem: "mensagem-sem-registro",
      aluno_id: alunoId,
      casado_em: j.quando || new Date().toISOString(),
    });
    if (!erroReconstrucao) r.reconstruidos++;
  }

  return r;
}
