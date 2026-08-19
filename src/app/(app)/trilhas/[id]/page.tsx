// /trilhas/[id] — o editor de uma trilha. Server Component, mesma forma de
// /mentoria/[id]: a borda busca, `./visao.tsx` desenha.
//
// POR QUE LÊ A LISTA INTEIRA EM VEZ DE UMA TRILHA SÓ
// ---------------------------------------------------
// `lerTrilhas()` já existe, já trata falha parcial e já ordena as aulas pela
// mesma regra do resto do sistema. Uma leitura nova só para esta tela seria
// um segundo lugar para a mesma pergunta — e o volume aqui é de dezenas de
// linhas, não de milhares. Quando passar a doer, o lugar de consertar é
// `dados-trilha.ts`, e esta tela não muda.
//
// E NÃO usa `notFound()`, de propósito: "não consegui ler o banco" e "essa
// trilha não existe" são estados diferentes, e o 404 genérico do Next
// apagaria os dois no mesmo lugar (mesma decisão de /mentoria/[id]).

import { lerTrilhas } from "@/lib/conteudo/dados-trilha";
import { TrilhaVisao } from "./visao";

export const dynamic = "force-dynamic";

export default async function EditorDeTrilha({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { erro?: string };
}) {
  const lista = await lerTrilhas();
  const achado = lista.trilhas.find((t) => t.trilha.id === params.id) ?? null;

  return (
    <TrilhaVisao
      conectado={lista.conectado}
      motivo={lista.motivo}
      trilha={achado?.trilha ?? null}
      aulas={achado?.aulas ?? []}
      erro={typeof searchParams.erro === "string" ? searchParams.erro : ""}
    />
  );
}
