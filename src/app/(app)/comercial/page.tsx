// /comercial — o funil de negociação. Server Component.
//
// Dono, gestor e COMERCIAL chegam aqui; mentorado, afiliado e aluno não —
// `rotaPermitida` (src/lib/papeis.ts) nega por omissão, e quem faz valer isso
// é a RLS de 0024: nenhuma das seis políticas menciona o papel do mentorado,
// porque `oportunidade` carrega valor negociado, probabilidade e motivo de
// perda.
//
// O relógio entra aqui, na borda, e desce por parâmetro — é o que decide
// quais propostas aparecem vencidas.

import { lerPipeline } from "@/lib/comercial/dados";
import { ComercialVisao } from "./visao";

export const dynamic = "force-dynamic";

export default async function Comercial({ searchParams }: { searchParams: { erro?: string } }) {
  const pipeline = await lerPipeline(new Date().toISOString());
  return (
    <ComercialVisao
      pipeline={pipeline}
      erro={typeof searchParams.erro === "string" ? searchParams.erro : ""}
    />
  );
}
