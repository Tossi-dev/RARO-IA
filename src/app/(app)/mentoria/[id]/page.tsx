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

import { lerDocumentosDoMentorado } from "@/lib/documentos/dados";
import { googleConectado } from "@/lib/integracoes/google-agenda";
import { lerFicha } from "@/lib/mentoria/dados";
import { lerHistorico } from "@/lib/mentoria/dados-historico";
import { FichaVisao } from "./visao";

export const dynamic = "force-dynamic";

export default async function FichaMentorado({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { erro?: string };
}) {
  // Um `agoraIso` só para as duas leituras: as duas datam a mesma abertura de
  // tela, e dois `new Date()` fariam a saúde e a linha do tempo responderem a
  // instantes diferentes — diferença pequena, mas é a porta por onde entra um
  // número que ninguém consegue reproduzir.
  const agoraIso = new Date().toISOString();

  // Em paralelo, e tolerando falha separada: `lerHistorico` já devolve
  // `conectado: false`/`parcial: true` em vez de lançar (ver o cabeçalho de
  // `dados-historico.ts`), então a ficha continua de pé quando o histórico
  // não vem — e a tela DIZ que ele não veio, em vez de mostrar uma linha do
  // tempo vazia com cara de "não aconteceu nada".
  // A leitura dos documentos entra na mesma leva, e tolera falha do mesmo
  // jeito: `lerDocumentosDoMentorado` devolve `conectado: false` com um
  // motivo humano em vez de lançar, então uma falha ali derruba o bloco de
  // arquivos — que DIZ que não conseguiu ler —, nunca a ficha inteira.
  //
  // Sem `incluirArquivados`: a lista do dia a dia é a dos ativos, e o bloco
  // conta quantos arquivados existem a partir do que recebeu (ver
  // `./documentos.tsx`).
  const [ficha, historico, documentos] = await Promise.all([
    lerFicha(params.id, agoraIso),
    lerHistorico(params.id, agoraIso),
    lerDocumentosDoMentorado(params.id),
  ]);

  // Lido AQUI, na borda, e não dentro da visão: `googleConectado()` lê cookie,
  // e a visão é uma função sync pura que os testes chamam direto.
  return (
    <FichaVisao
      ficha={ficha}
      historico={historico}
      documentos={documentos}
      erro={searchParams.erro}
      agendaConectada={googleConectado()}
      agoraIso={agoraIso}
    />
  );
}
