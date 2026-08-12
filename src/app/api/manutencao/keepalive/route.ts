// GET /api/manutencao/keepalive — bate no Supabase uma vez por dia (cron em
// `vercel.json`) só para o projeto não morrer sozinho.
//
// POR QUE ISTO EXISTE: no plano gratuito do Supabase, um projeto sem NENHUMA
// consulta em 7 dias é pausado automaticamente. O dono deste sistema é mentor
// de poucos alunos e pode passar uma semana inteira sem abrir o app — nesse
// caso o banco pausa sozinho, e o primeiro sintoma parece bug ("não consigo
// conectar"), não uma regra de plano gratuito que ninguém lembra que existe.
// Uma consulta mínima e diária (ver `vercel.json`: por que diário e não
// semanal) resolve isso sem custar nada.
//
// POR QUE ESTA ROTA PRECISA FICAR FORA DO PORTÃO DE ACESSO: o cron da Vercel
// não tem cookie, sessão nem senha para apresentar. Se esta rota caísse atrás
// do portão (`src/middleware.ts`), o cron levaria um redirecionamento para a
// tela de senha, o Supabase nunca seria consultado, e o projeto morreria
// exatamente como se este arquivo não existisse — só que em silêncio, com o
// disparo do cron marcado como sucesso (redirecionamento não é erro HTTP).
// Isto NÃO exigiu mudar `src/middleware.ts`: o `matcher` de lá já exclui a
// árvore `/api/*` inteira (`"/((?!...|api/).*)"`) — rota de API nenhuma passa
// pelo portão de página. A prova disso mora em
// `src/app/api/manutencao/manutencao.test.ts`, que reproduz esse regex e
// confere que `/api/manutencao/keepalive` não é interceptado.
//
// POR QUE A RESPOSTA É SEMPRE 200: a Vercel marca um cron que responde 5xx
// como falho e manda e-mail de alerta a cada disparo. Um Supabase
// temporariamente fora do ar não é motivo para acordar ninguém de madrugada —
// o que importa para o cron é que a batida foi TENTADA. O resultado
// (`ok: true/false`) fica no corpo da resposta para quem quiser auditar
// depois, sem virar incidente sozinho.

import { NextResponse } from "next/server";
import { criarSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function supabaseConfiguradoNoAmbiente(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export async function GET() {
  if (!supabaseConfiguradoNoAmbiente()) {
    // Instalação de demonstração, sem Supabase — não há o que manter vivo.
    // Ainda assim 200: falta de configuração não é o cron falhando.
    return NextResponse.json({ ok: false, erro: "supabase nao configurado" }, { status: 200 });
  }

  try {
    const supabase = criarSupabaseServer();
    // Consulta mínima de propósito: não importa QUAL dado volta, importa que
    // o Supabase registre uma requisição dentro da janela de 7 dias.
    // `profiles` é a tabela mais antiga do schema (0001) — a mais improvável
    // de sumir numa migração futura.
    const { error } = await supabase.from("profiles").select("id").limit(1);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, quando: new Date().toISOString() }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, erro: (e as Error).message.slice(0, 200) },
      { status: 200 }
    );
  }
}
