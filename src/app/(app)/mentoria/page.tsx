// /mentoria — a carteira: uma linha por mentorado/matrícula, com progresso,
// próxima sessão e alerta de silêncio prolongado. Server Component: lê tudo
// de `lerCarteira` (src/lib/mentoria/dados.ts) numa ida só, sem cliente,
// sem estado — a mesma forma de /crm (src/app/(app)/crm/page.tsx).
//
// `new Date()` mora AQUI, na borda da rota, e só aqui: `dados.ts` e
// `textos.ts` são módulos puros que recebem "agora" como parâmetro, nunca o
// perguntam sozinhos (mesma regra documentada no topo de `progresso.ts`).
//
// A MARCAÇÃO em si mora em `./visao.tsx` (`CarteiraVisao`, componente puro
// que só recebe a `Carteira` já resolvida) — mesma separação de
// `../portal/visao.tsx`, pelo mesmo motivo: borda aqui, desenho lá.

import { lerCarteira } from "@/lib/mentoria/dados";
import { CarteiraVisao } from "./visao";

export const dynamic = "force-dynamic";

export default async function Mentoria() {
  // borda: "agora" nasce aqui, uma vez, e desce como string para tudo que
  // precisar dele (a leitura e a formatação da próxima sessão).
  const agoraIso = new Date().toISOString();
  const carteira = await lerCarteira(agoraIso);

  return <CarteiraVisao carteira={carteira} agoraIso={agoraIso} />;
}
