// A leitura do diagnóstico para a ficha do lead.
//
// POR QUE ISTO NÃO PASSA PELO `DataProvider`
// ------------------------------------------
// Toda leitura do app passa por `getDB()`, que tem quatro implementações
// (Supabase, planilha, demonstração, vazio). Esta não passa, de propósito.
//
// O diagnóstico é a resposta que uma pessoa real deu sobre a empresa dela. Não
// existe versão fictícia disso: um `demo-db` devolvendo "Ricardo, faixa B, T5"
// colocaria na tela uma abordagem de venda pronta para um lead que não existe —
// e quem abre a ficha não sabe qual variável de ambiente está faltando, ele só
// vê a tela e acredita. É o mesmo raciocínio que fez a demonstração deixar de
// ser o padrão do projeto: erro de configuração pode custar uma tela vazia;
// nunca pode custar uma conversa de venda começada em cima de dado inventado.
//
// Então: sem Supabase configurado, devolve `null`, e a ficha não mostra a
// seção. Nada de meio-termo.
//
// A leitura usa o cliente de SESSÃO (não o de serviço): quem pode ver lead é o
// RLS que decide — dono, gestor e comercial, dentro do próprio workspace.

import { criarSupabaseServer } from "@/lib/supabase/server";
import { supabaseConfigurado } from "@/lib/data";
import type { Faixa, Inacabados, Trava, Urgencia } from "./codigo";

export interface DiagnosticoDoLead {
  codigo: string;
  faturamento: Faixa | "F";
  papel: "D" | "G" | "N" | null;
  trava: Trava | null;
  inacabados: Inacabados | null;
  urgencia: Urgencia | null;
  qualificado: boolean;
  origem: string;
  criadoEm: string;
  casadoEm: string | null;
}

/**
 * O diagnóstico de um cliente, ou `null` quando ele não veio pelo funil (que é
 * o caso da maioria das fichas) ou quando o banco não está configurado.
 *
 * Erro de consulta também devolve `null`, sem lançar: a ficha do cliente é
 * grande e útil sem esta seção, e derrubar a página inteira porque uma tabela
 * ainda não foi migrada seria trocar um bloco a menos por uma tela de erro.
 */
export async function lerDiagnosticoDoAluno(alunoId: string): Promise<DiagnosticoDoLead | null> {
  if (!supabaseConfigurado() || !alunoId) return null;

  try {
    const s = criarSupabaseServer();
    const { data, error } = await s
      .from("diagnostico_lead")
      .select("codigo, faturamento, papel, trava, inacabados, urgencia, qualificado, origem, criado_em, casado_em")
      .eq("aluno_id", alunoId)
      // Alguém pode preencher duas vezes, em dias diferentes. A ficha mostra o
      // mais recente: é o que descreve a empresa dele hoje.
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    return {
      codigo: String(data.codigo),
      faturamento: data.faturamento,
      papel: data.papel ?? null,
      trava: data.trava ?? null,
      inacabados: data.inacabados ?? null,
      urgencia: data.urgencia ?? null,
      qualificado: Boolean(data.qualificado),
      origem: String(data.origem ?? ""),
      criadoEm: String(data.criado_em),
      casadoEm: data.casado_em ? String(data.casado_em) : null,
    };
  } catch {
    return null;
  }
}
