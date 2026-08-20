// /feed — os avisos, do lado de quem escreve. Server Component: lê tudo de
// `lerFeedDoTime` (src/lib/feed/dados.ts) numa ida só.
//
// Só dono e gestor chegam aqui. `rotaPermitida` (src/lib/papeis.ts) nega
// `/feed` para comercial, mentorado, afiliado e aluno — e o item de menu nem
// chega a ser desenhado para eles (tarefa 36). Quem faz valer isso de verdade
// é a RLS de 0022: na política de select de `post` o comercial não tem ramo
// nenhum, então lê zero linhas mesmo que a rota abrisse por engano.
//
// A MARCAÇÃO mora em `./visao.tsx` — borda aqui, desenho lá.

import { lerFeedDoTime } from "@/lib/feed/dados";
import { FeedVisao } from "./visao";

export const dynamic = "force-dynamic";

export default async function Feed({ searchParams }: { searchParams: { erro?: string } }) {
  const feed = await lerFeedDoTime();
  return <FeedVisao feed={feed} erro={typeof searchParams.erro === "string" ? searchParams.erro : ""} />;
}
