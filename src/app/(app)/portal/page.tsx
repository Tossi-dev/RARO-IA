// /portal — o Portal do Mentorado: a tela que o Jefson mostra PRIMEIRO para
// um cliente novo. Quem entra aqui é o MENTORADO, não o time do Jefson —
// zero jargão interno, zero número inventado, zero emoji (regra de estilo
// da casa, ver `./textos.ts`).
//
// Server Component: lê tudo de `lerPortal` (src/lib/mentoria/portal.ts)
// numa ida só, sem cliente, sem estado — mesma forma de `/mentoria` e
// `/mentoria/[id]`. `new Date()` mora AQUI, na borda da rota, e só aqui:
// `portal.ts` e `textos.ts` são módulos puros que recebem "agora" como
// parâmetro (mesma regra documentada no topo de `progresso.ts`).
//
// A MARCAÇÃO em si (as três telas — desconectado, "ainda não ligado" e o
// portal cheio) mora em `./visao.tsx`, um componente puro que só recebe o
// `Portal` já resolvido: esta página cuida só da BORDA (buscar o dado, ler
// `searchParams`), nunca do desenho. É essa separação que deixa a mesma
// marcação ser alimentada por dado fixo numa prévia visual sem duplicar
// nada — ver `./visao.tsx` para o porquê completo.
//
// TRÊS ESTADOS, sempre nesta ordem de checagem — ver o comentário de cada
// um em `./visao.tsx`:
//   1) `conectado: false` — sem Supabase, ou a leitura falhou.
//   2) `conectado: true, ehMentorado: false` — conectou, mas quem está
//      logado não tem ficha de mentorado vinculada (ver regra 4 de
//      `lerPortal`). Mesma cautela de `/sem-acesso`: não diz qual papel a
//      pessoa tem, não lista o que existe do outro lado.
//   3) o portal de verdade.

import { lerMeuFeed } from "@/lib/feed/dados";
import { lerMeuOnboarding } from "@/lib/onboarding/dados";
import { lerPortal } from "@/lib/mentoria/portal";
import { PortalVisao } from "./visao";

export const dynamic = "force-dynamic";

export default async function Portal({ searchParams }: { searchParams: { erro?: string } }) {
  // borda: "agora" nasce aqui, uma vez, e desce como string para tudo que
  // precisar dele — leitura, próxima sessão, dias até ela, tom de prazo.
  const agoraIso = new Date().toISOString();

  // Em paralelo, e tolerando falha separada: `lerMeuFeed` devolve
  // `conectado: false` em vez de lançar, e o card some sozinho nesse caso
  // (ver `./avisos.tsx`). Uma falha nos avisos não pode derrubar o portal
  // inteiro — a jornada da pessoa não depende de ter recado novo.
  const [portal, feed, onboarding] = await Promise.all([
    lerPortal(agoraIso),
    lerMeuFeed(agoraIso),
    lerMeuOnboarding(),
  ]);

  return (
    <PortalVisao
      portal={portal}
      agoraIso={agoraIso}
      erro={searchParams.erro}
      feed={feed}
      onboarding={onboarding}
    />
  );
}
