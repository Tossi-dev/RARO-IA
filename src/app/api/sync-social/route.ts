// Sync agendado das redes sociais (Vercel Cron: vercel.json → 06:00 diário).
// Sem tokens → responde em modo demo (nada a sincronizar; telas usam o seed).
// Com tokens + Supabase → upsert de conteúdos e métricas nas tabelas reais.

import { NextResponse } from "next/server";
import { supabaseConfigurado } from "@/lib/data";
import { algumaRedeConfigurada, sincronizarRedes } from "@/lib/integracoes/social";
import { criarSupabaseServer } from "@/lib/supabase/server";

export const maxDuration = 60;

function autorizado(req: Request): boolean {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return true; // sem segredo definido, endpoint aberto (demo)
  const auth = req.headers.get("authorization") ?? "";
  const url = new URL(req.url);
  return auth === `Bearer ${segredo}` || url.searchParams.get("secret") === segredo;
}

export async function GET(req: Request) {
  if (!autorizado(req)) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  if (!algumaRedeConfigurada()) {
    return NextResponse.json({
      modo: "demo",
      mensagem:
        "Nenhum token de rede social configurado — as telas de Conteúdo seguem com dados de demonstração.",
    });
  }
  const r = await sincronizarRedes();
  if (!supabaseConfigurado()) {
    return NextResponse.json({
      modo: "apis-sem-banco",
      coletados: r.conteudos.length,
      avisos: [...r.avisos, "Supabase não configurado — dados coletados mas não persistidos."],
    });
  }

  const s = criarSupabaseServer();
  let gravados = 0;
  const avisos = [...r.avisos];
  for (const c of r.conteudos) {
    try {
      const { data: perfil } = await s
        .from("perfis_sociais")
        .select("id")
        .eq("plataforma", c.plataforma)
        .maybeSingle();
      if (!perfil) {
        avisos.push(`Perfil ${c.plataforma} não cadastrado — pulei ${c.externoId}`);
        continue;
      }
      const { data: existente } = await s
        .from("conteudos")
        .select("id")
        .eq("externo_id", c.externoId)
        .maybeSingle();
      let conteudoId = existente?.id as string | undefined;
      if (!conteudoId) {
        const { data: novo, error } = await s
          .from("conteudos")
          .insert({
            perfil_id: perfil.id,
            tipo: c.tipo,
            titulo: c.titulo,
            url: c.url,
            publicado_em: c.publicadoEm || new Date().toISOString().slice(0, 10),
            duracao_seg: c.duracaoSeg,
            externo_id: c.externoId,
          })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        conteudoId = novo.id;
      }
      await s.from("conteudo_metricas").insert({
        conteudo_id: conteudoId,
        views: c.metrica.views,
        likes: c.metrica.likes,
        comentarios: c.metrica.comentarios,
        compartilhamentos: c.metrica.compartilhamentos,
        salvamentos: c.metrica.salvamentos,
        alcance: c.metrica.alcance,
        tempo_medio_seg: c.metrica.tempoMedioSeg,
        retencao_media: c.metrica.retencaoMedia,
      });
      gravados++;
    } catch (e) {
      avisos.push(`${c.plataforma}/${c.externoId}: ${(e as Error).message}`);
    }
  }
  return NextResponse.json({ modo: "apis", coletados: r.conteudos.length, gravados, avisos });
}
