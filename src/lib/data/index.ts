// Seleção do provider de dados:
// - Com NEXT_PUBLIC_SUPABASE_URL + ANON_KEY: dados reais (Postgres + RLS)
// - Com RARO_SHEETS_ID: dados reais lidos da planilha Base_Financeira_Operacao
// - Com RARO_MODO=demo: dados fictícios em memória, pedidos explicitamente
// - Sem nenhuma das três: modo VAZIO — nada na tela, e a tela diz que é nada
//
// Este módulo é NEUTRO (sem diretiva de cliente) de propósito: ele exporta valor
// de runtime que Server Component consome. Marcar como cliente derrubaria o app
// em runtime ("React Client Manifest") com o build ainda verde.

import { sheetsConfigurado } from "@/lib/sheets/config";
import { demoProvider } from "./demo-db";
import type { DataProvider } from "./provider";
import { sheetsProvider } from "./sheets-db";
import { simulacaoLigada } from "./simulacao";
import { supabaseProvider } from "./supabase-db";
import { vazioProvider } from "./vazio-db";

/** As quatro origens possíveis de dados. */
export type ModoDados = "demo" | "supabase" | "planilha" | "vazio";

export function supabaseConfigurado(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

/**
 * A planilha só precisa do ID para LER (o endpoint gviz é público, sem login).
 * Escrever exige mais duas variáveis, e quem cobra isso é `escrever.ts` — aqui
 * a pergunta é só "dá para mostrar dados vindos da planilha?".
 */
export function planilhaConfigurada(): boolean {
  return sheetsConfigurado();
}

/** A demonstração é opt-in explícito, nunca herdada da ausência de configuração. */
export function demoPedidoExplicitamente(): boolean {
  return process.env.RARO_MODO === "demo";
}

/**
 * Precedência: Supabase > planilha > demo (só sob pedido) > vazio.
 *
 * Por que Supabase ganha da planilha quando os dois estão configurados: só o
 * banco relacional tem integridade referencial (chave estrangeira, unicidade,
 * transação). Na planilha um "ID_Venda" é texto digitado — nada impede uma
 * linha órfã. Com as duas fontes disponíveis, a que garante consistência é a
 * que manda.
 *
 * Por que demo deixou de ser o padrão: o argumento antigo era "sem variável
 * nenhuma o app precisa continuar idêntico ao de hoje". Esse raciocínio protegia
 * a aparência do app e custava a confiança do cliente. Em produção, sem nenhuma
 * variável definida, o dono do produto abriu o painel e leu faturamento, meta de
 * afiliado e parcelas vencidas que jamais existiram — e acreditou. Quem abre a
 * tela não sabe qual variável de ambiente está faltando; ele só vê um número e
 * assume que é o dele. Erro de configuração pode custar uma tela vazia; nunca
 * pode custar uma decisão tomada em cima de dado inventado.
 *
 * Por isso a demonstração agora exige `RARO_MODO=demo`: dado fictício só entra
 * quando alguém digitou que quer dado fictício. Na falta de tudo, o modo é
 * `vazio` — que não mente nem por omissão.
 */
export function modoDados(): ModoDados {
  if (supabaseConfigurado()) return "supabase";
  if (planilhaConfigurada()) return "planilha";
  if (demoPedidoExplicitamente()) return "demo";
  return "vazio";
}

/**
 * O modo que está REALMENTE valendo nesta requisição.
 *
 * `modoDados()` responde "o que a configuração deste servidor permite" e é
 * pura de propósito (só variáveis de ambiente) — é ela que os testes travam.
 * `modoDadosEfetivo()` responde "o que este navegador está vendo agora", e aí
 * entra a simulação, que é uma escolha por navegador e não do servidor.
 *
 * Quem desenha tela (faixa, selo, avisos) usa esta. Quem decide arquitetura
 * usa a outra.
 */
export function modoDadosEfetivo(): ModoDados {
  return simulacaoLigada() ? "demo" : modoDados();
}

/**
 * A simulação entra AQUI, num ponto só, e não nos ~40 lugares que chamam
 * `getDB()`. Nenhuma página precisou saber que a simulação existe.
 */
export function getDB(): DataProvider {
  if (simulacaoLigada()) return demoProvider;
  const modo = modoDados();
  if (modo === "supabase") return supabaseProvider;
  if (modo === "planilha") return sheetsProvider;
  if (modo === "demo") return demoProvider;
  return vazioProvider;
}

export { demoProvider, sheetsProvider, supabaseProvider, vazioProvider };
export type { AlunoDetalhe, DataProvider, LancamentoDetalhe } from "./provider";
