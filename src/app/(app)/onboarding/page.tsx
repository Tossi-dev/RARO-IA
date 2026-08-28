// /onboarding — o modelo do roteiro de entrada. Server Component.
//
// Só dono e gestor chegam aqui: `rotaPermitida` (src/lib/papeis.ts) nega
// `/onboarding` para comercial, mentorado, afiliado e aluno, e o item de menu
// nem chega a ser desenhado para eles. Quem faz valer isso é a RLS de 0023 —
// as políticas de insert e update de `onboarding_etapa` são de dono/gestor, e
// o mentorado só lê o que está ativo.
//
// A leitura é `lerModeloDeOnboarding`, e não `lerOnboarding(id)`: esta tela
// configura a RÉGUA, não mede ninguém. Nenhum nome de cliente atravessa para
// cá — o progresso de uma pessoa aparece na ficha dela.

import { lerModeloDeOnboarding } from "@/lib/onboarding/dados";
import { OnboardingEstruturado, OnboardingVisao } from "./visao";

export const dynamic = "force-dynamic";

export default async function Onboarding({ searchParams }: { searchParams: { erro?: string } }) {
  const modelo = await lerModeloDeOnboarding();
  return (
    <>
      <OnboardingVisao modelo={modelo} erro={typeof searchParams.erro === "string" ? searchParams.erro : ""} />
      <div className="mt-6">
        <OnboardingEstruturado />
      </div>
    </>
  );
}
