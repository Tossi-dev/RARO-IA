// Sync de redes sociais (APIs oficiais) — REST puro atrás de env.
// Sem tokens → modo demo: os dados fictícios do demo-db já cobrem as telas.
//
// ATENÇÃO: pré-requisitos externos (ver plano v2, seção 6):
//   Meta: app aprovado no App Review + conta business (META_ACCESS_TOKEN, IG_USER_ID, FB_PAGE_ID)
//   TikTok: app no TikTok for Developers (TIKTOK_ACCESS_TOKEN)
// Este módulo foi escrito contra as APIs públicas documentadas e deve ser
// validado ponta a ponta na primeira conexão com tokens reais.

export interface ConteudoSync {
  externoId: string;
  plataforma: "instagram" | "tiktok" | "facebook";
  tipo: "reel" | "post" | "video" | "carrossel";
  titulo: string;
  url: string;
  publicadoEm: string; // ISO date
  duracaoSeg: number;
  metrica: {
    views: number;
    likes: number;
    comentarios: number;
    compartilhamentos: number;
    salvamentos: number;
    alcance: number;
    tempoMedioSeg: number;
    retencaoMedia: number;
  };
}

export function metaConfigurada(): boolean {
  return Boolean(process.env.META_ACCESS_TOKEN && process.env.IG_USER_ID);
}
export function tiktokConfigurado(): boolean {
  return Boolean(process.env.TIKTOK_ACCESS_TOKEN);
}
export function algumaRedeConfigurada(): boolean {
  return metaConfigurada() || tiktokConfigurado();
}

const GRAPH = "https://graph.facebook.com/v21.0";

/** Instagram Graph API: mídia recente + insights de reels. */
export async function syncInstagram(): Promise<ConteudoSync[]> {
  const token = process.env.META_ACCESS_TOKEN!;
  const igUser = process.env.IG_USER_ID!;
  const campos = "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count";
  const r = await fetch(`${GRAPH}/${igUser}/media?fields=${campos}&limit=25&access_token=${token}`);
  if (!r.ok) throw new Error(`IG media ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = (await r.json()) as { data?: Record<string, unknown>[] };
  const out: ConteudoSync[] = [];
  for (const m of data.data ?? []) {
    const ehReel = m.media_product_type === "REELS";
    let views = 0, alcance = 0, salvos = 0, compart = 0, tempoMedio = 0;
    try {
      const metricas = ehReel
        ? "plays,reach,saved,shares,ig_reels_avg_watch_time"
        : "impressions,reach,saved";
      const ri = await fetch(`${GRAPH}/${m.id}/insights?metric=${metricas}&access_token=${token}`);
      if (ri.ok) {
        const ins = (await ri.json()) as { data?: { name: string; values?: { value?: number }[] }[] };
        const val = (nome: string) =>
          ins.data?.find((d) => d.name === nome)?.values?.[0]?.value ?? 0;
        views = val("plays") || val("impressions");
        alcance = val("reach");
        salvos = val("saved");
        compart = val("shares");
        tempoMedio = (val("ig_reels_avg_watch_time") || 0) / 1000; // ms → s
      }
    } catch {
      /* insights podem falhar por permissão — segue com o básico */
    }
    out.push({
      externoId: String(m.id),
      plataforma: "instagram",
      tipo: ehReel ? "reel" : m.media_type === "CAROUSEL_ALBUM" ? "carrossel" : "post",
      titulo: String(m.caption ?? "(sem legenda)").slice(0, 120),
      url: String(m.permalink ?? ""),
      publicadoEm: String(m.timestamp ?? "").slice(0, 10),
      duracaoSeg: 0,
      metrica: {
        views,
        likes: Number(m.like_count ?? 0),
        comentarios: Number(m.comments_count ?? 0),
        compartilhamentos: compart,
        salvamentos: salvos,
        alcance,
        tempoMedioSeg: tempoMedio,
        retencaoMedia: 0, // curva de retenção detalhada não é exposta pela API — anotação manual
      },
    });
  }
  return out;
}

/** TikTok Display/Content API: lista de vídeos + métricas básicas. */
export async function syncTikTok(): Promise<ConteudoSync[]> {
  const token = process.env.TIKTOK_ACCESS_TOKEN!;
  const r = await fetch(
    "https://open.tiktokapis.com/v2/video/list/?fields=id,title,create_time,share_url,duration,view_count,like_count,comment_count,share_count",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ max_count: 20 }),
    }
  );
  if (!r.ok) throw new Error(`TikTok ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = (await r.json()) as {
    data?: { videos?: Record<string, unknown>[] };
  };
  return (data.data?.videos ?? []).map((v) => ({
    externoId: String(v.id),
    plataforma: "tiktok" as const,
    tipo: "video" as const,
    titulo: String(v.title ?? "(sem título)").slice(0, 120),
    url: String(v.share_url ?? ""),
    publicadoEm: new Date(Number(v.create_time ?? 0) * 1000).toISOString().slice(0, 10),
    duracaoSeg: Number(v.duration ?? 0),
    metrica: {
      views: Number(v.view_count ?? 0),
      likes: Number(v.like_count ?? 0),
      comentarios: Number(v.comment_count ?? 0),
      compartilhamentos: Number(v.share_count ?? 0),
      salvamentos: 0,
      alcance: 0,
      tempoMedioSeg: 0,
      retencaoMedia: 0,
    },
  }));
}

export async function sincronizarRedes(): Promise<{
  provider: "demo" | "apis";
  conteudos: ConteudoSync[];
  avisos: string[];
}> {
  if (!algumaRedeConfigurada()) {
    return {
      provider: "demo",
      conteudos: [],
      avisos: [
        "Nenhum token configurado (META_ACCESS_TOKEN / TIKTOK_ACCESS_TOKEN) — telas seguem com dados de demonstração.",
      ],
    };
  }
  const conteudos: ConteudoSync[] = [];
  const avisos: string[] = [];
  if (metaConfigurada()) {
    try {
      conteudos.push(...(await syncInstagram()));
    } catch (e) {
      avisos.push(`Instagram: ${(e as Error).message}`);
    }
  }
  if (tiktokConfigurado()) {
    try {
      conteudos.push(...(await syncTikTok()));
    } catch (e) {
      avisos.push(`TikTok: ${(e as Error).message}`);
    }
  }
  return { provider: "apis", conteudos, avisos };
}
