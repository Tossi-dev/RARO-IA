// /trilhas — a lista de trilhas do workspace. Server Component: lê tudo de
// `lerTrilhas` (src/lib/conteudo/dados-trilha.ts) numa ida só, sem cliente e
// sem estado — mesma forma de /mentoria.
//
// Só dono e gestor chegam aqui: `rotaPermitida` (src/lib/papeis.ts) nega
// `/trilhas` para comercial, mentorado, afiliado e aluno, e o tile e o item
// de menu nem chegam a ser desenhados para eles (tarefa 29). Quem faz valer
// isso de verdade, porém, não é esta tela nem o middleware: é a RLS de
// `trilha` (migração 0019).
//
// A MARCAÇÃO mora em `./visao.tsx` — borda aqui, desenho lá.

import { lerTrilhas } from "@/lib/conteudo/dados-trilha";
import { TrilhasVisao } from "./visao";

export const dynamic = "force-dynamic";

export default async function Trilhas({ searchParams }: { searchParams: { erro?: string; q?: string; situacao?: string } }) {
  const lista = await lerTrilhas();
  return (
    <TrilhasVisao
      lista={lista}
      erro={typeof searchParams.erro === "string" ? searchParams.erro : ""}
      busca={typeof searchParams.q === "string" ? searchParams.q : ""}
      situacao={typeof searchParams.situacao === "string" ? searchParams.situacao : "todas"}
    />
  );
}
