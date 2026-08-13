// /mentoria/[id] — a ficha do mentorado: matrículas, histórico de sessões,
// tarefas em aberto, marcos e a variação do score. Server Component, mesma
// forma de /crm/[id] (src/app/(app)/crm/[id]/page.tsx) — mas com uma
// diferença deliberada: NÃO usa `notFound()`. `lerFicha` distingue "não
// existe" (`conectado: true`, `mentorado: null`) de "não consegui ler"
// (`conectado: false`), e a tela precisa deixar essa diferença visível —
// `notFound()` apagaria os dois casos no mesmo 404 genérico. Ver `./visao.tsx`
// para o desenho dos três estados.
//
// A MARCAÇÃO em si mora em `./visao.tsx` (`FichaVisao`, componente puro que
// só recebe a `Ficha` já resolvida) — mesma separação de `../visao.tsx` e
// `../../portal/visao.tsx`: borda aqui, desenho lá.

import { lerFicha } from "@/lib/mentoria/dados";
import { FichaVisao } from "./visao";

export const dynamic = "force-dynamic";

export default async function FichaMentorado({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { erro?: string };
}) {
  const agoraIso = new Date().toISOString();
  const ficha = await lerFicha(params.id, agoraIso);

  return <FichaVisao ficha={ficha} erro={searchParams.erro} />;
}
