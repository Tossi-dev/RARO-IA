// /comercial/conversao — o dashboard de conversão do funil. Server Component.
//
// Mesma leitura da tela do quadro (`lerPipeline`) e mesma permissão: cai sob
// `/comercial` em `rotaPermitida`, e a RLS de 0024 é quem impede de verdade.
//
// O relógio entra aqui, na borda.

import { lerPipeline } from "@/lib/comercial/dados";
import { ConversaoVisao } from "./visao";

export const dynamic = "force-dynamic";

export default async function Conversao() {
  const pipeline = await lerPipeline(new Date().toISOString());
  return <ConversaoVisao pipeline={pipeline} />;
}
