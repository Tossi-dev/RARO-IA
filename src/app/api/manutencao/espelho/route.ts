// GET /api/manutencao/espelho — cron diário (ver `vercel.json`) que mantém a
// planilha do Google como ESPELHO DE LEITURA do que existe no Supabase.
//
// DECISÃO DE ARQUITETURA: o Supabase é a base; a planilha deixou de ser onde
// se digita. O sistema escreve nela, o dono lê e exporta — ele não digita
// mais lá.
//
// POR QUE ISTO É SÓ ESQUELETO POR ENQUANTO: as tabelas de mentoria
// (`mentorado`, `matricula`, `sessao`, `tarefa_mentoria` — ver
// `supabase/migrations/0006_mentoros_mentoria.sql`) acabaram de nascer e
// ainda não têm dado real. Espelhar tabela vazia é espelhar nada; inventar a
// escrita agora seria código sem caso real para provar que funciona, e o
// primeiro dado de verdade que chegar vai exigir revisitar isto de qualquer
// jeito. Por isso a rota já existe, já sabe QUAIS abas pretende manter
// atualizadas, e responde honestamente que ainda não há o que espelhar — em
// vez de fingir uma sincronização que não acontece.
//
// POR QUE UMA FALHA AQUI NUNCA PODE DERRUBAR NADA: espelho quebrado é
// espelho desatualizado, não é sistema fora do ar — o dono continua operando
// pelo Supabase (a base) mesmo que a planilha (o espelho) esteja fora do ar,
// com a aba renomeada, ou recusando a conexão. Por isso qualquer falha aqui
// — configurada ou inesperada — volta 200 com `ok: false`, nunca 500 (mesmo
// motivo do keepalive: a Vercel marca cron 5xx como falho e dispara alerta
// por um problema que não impede ninguém de trabalhar).

import { NextResponse } from "next/server";
import { planilhaConfigurada } from "@/lib/data";
import { pingPlanilha } from "@/lib/sheets/escrever";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Abas que este espelho vai manter atualizadas assim que houver dado real de
 * mentoria para espelhar. Cada uma corresponde a uma tabela de
 * `0006_mentoros_mentoria.sql`.
 */
const ABAS_ESPELHO = ["MENTORADOS", "SESSOES", "TAREFAS_MENTORIA"] as const;

export async function GET() {
  if (!planilhaConfigurada()) {
    // Sem planilha configurada não há espelho para manter — não é falha,
    // é a instalação não ter esse recurso ligado.
    return NextResponse.json(
      { ok: true, espelhado: [], nota: "planilha nao configurada — nada a espelhar" },
      { status: 200 }
    );
  }

  try {
    // `pingPlanilha` confere que o Web App do Apps Script responde e que o
    // segredo bate — sem escrever nada. É o único jeito honesto de testar o
    // espelho hoje: as tabelas de mentoria ainda não têm linha para mandar.
    const diagnostico = await pingPlanilha();
    if (!diagnostico.ok) {
      return NextResponse.json(
        {
          ok: false,
          espelho: "falhou",
          motivo: diagnostico.erro ?? "planilha recusou a conexão",
        },
        { status: 200 }
      );
    }

    // TODO (quando as tabelas de mentoria tiverem dado real): para cada aba
    // de ABAS_ESPELHO, ler a tabela correspondente via `criarSupabaseServer`
    // e escrever com `inserirLinhas`/`atualizarLinha`
    // (src/lib/sheets/escrever.ts). Até lá, honesto é dizer que não há nada.
    return NextResponse.json(
      { ok: true, espelhado: [], nota: "sem dado para espelhar ainda", abas: ABAS_ESPELHO },
      { status: 200 }
    );
  } catch (e) {
    // Defesa extra: `pingPlanilha` por contrato nunca lança, mas o espelho
    // não pode derrubar o cron por causa de uma falha imprevista aqui dentro.
    return NextResponse.json(
      { ok: false, espelho: "falhou", motivo: (e as Error).message.slice(0, 200) },
      { status: 200 }
    );
  }
}
