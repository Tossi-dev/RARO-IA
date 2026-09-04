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
import { CarteiraVisao, type CarteiraVisual } from "./visao";

export const dynamic = "force-dynamic";

export default async function Mentoria() {
  // borda: "agora" nasce aqui, uma vez, e desce como string para tudo que
  // precisar dele (a leitura e a formatação da próxima sessão).
  const agoraIso = new Date().toISOString();
  const carteira = await lerCarteira(agoraIso);
  // A parte interativa roda no navegador, mas recebe somente o mínimo que
  // desenha. A carteira de domínio também contém telefone, preço, resumo,
  // transcrição e links das sessões; nenhum desses campos atravessa a
  // fronteira cliente desta listagem.
  const carteiraVisual: CarteiraVisual = {
    conectado: carteira.conectado,
    motivo: carteira.motivo,
    linhas: carteira.linhas.map((linha) => ({
      id: linha.matricula.id,
      matricula: { id: linha.matricula.id },
      mentorado: {
        id: linha.mentorado.id,
        nome: linha.mentorado.nome,
        email: linha.mentorado.email,
      },
      programa: linha.programa ? { nome: linha.programa.nome } : null,
      status: linha.matricula.status,
      progresso: {
        percentual: linha.progresso.percentual,
        rotulo: linha.progresso.rotulo,
      },
      proxima: linha.proxima ? { quando: linha.proxima.quando } : null,
      ultimaRealizada: linha.ultimaRealizada ? { quando: linha.ultimaRealizada.quando } : null,
      silencio: linha.silencio,
    })),
  };

  return <CarteiraVisao carteira={carteiraVisual} agoraIso={agoraIso} />;
}
