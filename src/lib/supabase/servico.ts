// Cliente Supabase com a chave de SERVIÇO — só para escrita de máquina.
//
// LEIA ISTO ANTES DE IMPORTAR ESTE ARQUIVO EM QUALQUER LUGAR
// ----------------------------------------------------------
// Esta chave IGNORA o RLS. Ela não checa papel, não checa workspace e não
// checa sessão: o que ela mandar, o banco faz. Por isso o resto do projeto
// usa `criarSupabaseServer()` (chave anônima + cookie da sessão) até para
// ações de gestão — a decisão de "esta pessoa pode fazer isto" é do banco,
// não do código, e é assim que uma falha de lógica na aplicação vira erro de
// permissão em vez de vazamento.
//
// A EXCEÇÃO QUE ESTE ARQUIVO ATENDE
// ---------------------------------
// O diagnóstico da landing não tem pessoa do outro lado. Quem preenche as
// cinco perguntas é anônimo por decisão de produto (a landing não pede nome,
// e-mail nem telefone), e quem manda o lote de mensagens do WhatsApp é um
// programa, não um usuário. Nos dois casos não existe sessão para o RLS
// avaliar — e criar um "usuário robô" com login seria inventar uma identidade
// só para enganar a regra.
//
// AS TRÊS TRAVAS QUE COMPENSAM O PODER DA CHAVE
// ---------------------------------------------
//   1. Nome da variável SEM `NEXT_PUBLIC_`. Uma variável com esse prefixo é
//      embutida no JavaScript que vai para o navegador. Este nome garante que
//      o Next se recuse a expô-la.
//   2. Explosão se alguém importar isto no cliente. Sem essa checagem, o erro
//      apareceria como "undefined" em produção, e não como quebra no primeiro
//      build de quem cometeu o engano.
//   3. Falha FECHADA. Sem a variável, devolve `null` e quem chamou responde
//      503 dizendo o que falta configurar — nunca cai para a chave anônima
//      "para funcionar assim mesmo", que gravaria com o RLS de outra pessoa.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** `true` quando o servidor tem a chave de serviço configurada. */
export function servicoConfigurado(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * O cliente de serviço, ou `null` quando falta configuração.
 *
 * Devolve `null` em vez de lançar porque quem chama precisa distinguir
 * "não configurado" (503, com o nome da variável que falta) de "falhou ao
 * gravar" (500). São duas conversas diferentes com quem for consertar.
 */
export function criarSupabaseServico(): SupabaseClient | null {
  if (typeof window !== "undefined") {
    throw new Error(
      "criarSupabaseServico() foi importado no navegador. Esta chave ignora o RLS e " +
        "nunca pode sair do servidor."
    );
  }
  if (!servicoConfigurado()) return null;

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      // Sem sessão, sem refresh, sem cookie: este cliente é usado uma vez por
      // requisição e morre. Persistir sessão aqui guardaria a chave de serviço
      // em disco no servidor sem nenhum ganho.
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}

/** O nome da variável que falta, para a mensagem de erro dizer o que fazer. */
export const VARIAVEL_DA_CHAVE = "SUPABASE_SERVICE_ROLE_KEY";
