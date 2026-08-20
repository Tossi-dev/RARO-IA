// /portal/trilha — as aulas do mentorado. Server Component, mesma forma de
// /portal: a borda busca, `./visao.tsx` desenha.
//
// `lerMinhaTrilha` recebe UM parâmetro, e ele é o relógio. O id da pessoa
// NÃO entra por aqui: sai de `rpc("mentorado_atual")`, que pergunta ao banco
// quem é o usuário da sessão. É a defesa contra o buraco clássico de trocar o
// número na URL — e a aridade daquela função é travada por teste justamente
// para ninguém acrescentar um segundo parâmetro sem perceber o que abre.
//
// `new Date()` mora AQUI, na borda da rota, e só aqui: a liberação das aulas
// é calculada em dias civis de São Paulo a partir deste instante, e um
// segundo `new Date()` mais abaixo faria duas partes da mesma tela responderem
// a momentos diferentes.

import { lerMinhaTrilha } from "@/lib/conteudo/dados-trilha";
import { MinhaTrilhaVisao } from "./visao";

export const dynamic = "force-dynamic";

export default async function MinhaTrilha({ searchParams }: { searchParams: { erro?: string } }) {
  const minha = await lerMinhaTrilha(new Date().toISOString());
  return <MinhaTrilhaVisao minha={minha} erro={typeof searchParams.erro === "string" ? searchParams.erro : ""} />;
}
