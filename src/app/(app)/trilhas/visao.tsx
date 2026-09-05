// A parte PURA de apresentação da LISTA de trilhas — recebe a `ListaTrilhas`
// já resolvida por `lerTrilhas` e só desenha. `page.tsx` cuida da busca;
// nenhuma consulta e nenhum `new Date()` aqui, mesma disciplina de
// `../mentoria/visao.tsx` e `../portal/visao.tsx`.
//
// OS QUATRO ESTADOS, E POR QUE NENHUM DELES É "TABELA VAZIA"
// ----------------------------------------------------------
// 1. não conectado          — frase com o motivo que a leitura preparou;
// 2. conectado e sem trilha — convite, com o formulário logo abaixo;
// 3. parcial                — a lista aparece E o aviso de que veio incompleta;
// 4. tudo certo             — a tabela.
//
// O estado 3 é o que costuma ser esquecido: `lerTrilhas` devolve as trilhas
// com zero aula quando só a leitura das aulas falha, e mostrar isso calado
// diria ao mentor "nenhuma trilha sua tem aula cadastrada" — uma afirmação
// sobre o trabalho dele que o sistema não tem como fazer.

import Link from "next/link";
import { BookOpen, CirclePause, Layers3, Plus, Route, Search } from "lucide-react";
import { Badge, Botao, Campo, Card, Input, Select, TextArea, Vazio } from "@/components/ui";
import { salvarTrilhaDaGestao } from "@/lib/conteudo/acoes-gestao-trilha";
import type { ListaTrilhas } from "@/lib/conteudo/dados-trilha";

function quantidadeDeAulas(valor: number): string {
  return `${valor} ${valor === 1 ? "aula" : "aulas"}`;
}

export function TrilhasVisao({
  lista,
  erro = "",
  busca = "",
  situacao = "todas",
}: {
  lista: ListaTrilhas;
  erro?: string;
  busca?: string;
  situacao?: string;
}) {
  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  const filtroSituacao = situacao === "ativas" || situacao === "inativas" ? situacao : "todas";
  const trilhasVisiveis = lista.trilhas.filter(({ trilha }) => {
    const correspondeAoTexto = termo === "" || `${trilha.nome} ${trilha.descricao}`.toLocaleLowerCase("pt-BR").includes(termo);
    const correspondeASituacao = filtroSituacao === "todas" || (filtroSituacao === "ativas" ? trilha.ativa : !trilha.ativa);
    return correspondeAoTexto && correspondeASituacao;
  });
  const ativas = lista.trilhas.filter(({ trilha }) => trilha.ativa).length;
  const inativas = lista.trilhas.length - ativas;
  const aulas = lista.trilhas.reduce((total, item) => total + item.aulas.length, 0);
  const proximasAcoes = lista.trilhas
    .filter(({ trilha, aulas: aulasDaTrilha }) => !trilha.ativa || (!lista.parcial && aulasDaTrilha.length === 0))
    .slice(0, 3);

  return (
    <div data-trilhas-visual="referencia-aprovada" className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[clamp(28px,3vw,38px)] font-fino leading-[0.98] tracking-[-0.045em]">Jornadas e trilhas</h1>
          <p className="mt-1.5 text-sm text-texto-2">Estruture o caminho de desenvolvimento sem entregar respostas prontas.</p>
        </div>
        {lista.conectado ? (
          <Link href="#nova-trilha" className="trans inline-flex items-center gap-2 rounded-lg border border-primaria px-4 py-2.5 text-sm font-medium text-primaria-2 hover:bg-primaria/10">
            <Plus size={17} aria-hidden="true" /> Nova trilha
          </Link>
        ) : null}
      </header>

      {/* Mensagem de `salvarTrilha`, já humana, vinda em `?erro=`. Mesmo
          banner de /mentoria/[id]. */}
      {erro ? (
        <p className="mb-4 rounded-xl border border-negativo/40 bg-negativo/10 px-4 py-3 text-sm text-negativo">
          {erro}
        </p>
      ) : null}

      {!lista.conectado ? (
        <Card>
          <p className="text-sm text-texto-2">{lista.motivo}</p>
        </Card>
      ) : (
        <>
          <section aria-label="Indicadores das trilhas" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Trilhas cadastradas", valor: lista.trilhas.length, Icone: Route, tom: "text-primaria-2 bg-primaria/10" },
              { label: "Trilhas ativas", valor: ativas, Icone: BookOpen, tom: "text-positivo bg-positivo/10" },
              { label: "Aulas planejadas", valor: lista.parcial ? "—" : aulas, Icone: Layers3, tom: "text-info bg-info/10" },
              { label: "Trilhas inativas", valor: inativas, Icone: CirclePause, tom: "text-ouro bg-ouro/10" },
            ].map(({ label, valor, Icone, tom }) => (
              <div key={label} className="flex items-center gap-4 rounded-xl border border-borda-sutil bg-painel px-4 py-4">
                <span className={`grid size-11 shrink-0 place-items-center rounded-full ${tom}`}><Icone size={21} aria-hidden="true" /></span>
                <div><p className="text-sm text-texto-2">{label}</p><p className="mt-0.5 text-2xl font-medium tabular-nums text-texto">{valor}</p></div>
              </div>
            ))}
          </section>

          {lista.parcial && lista.motivo ? (
            <p className="mb-4 rounded-xl border border-aviso/40 bg-aviso/10 px-4 py-3 text-sm text-aviso">
              {lista.motivo}
            </p>
          ) : null}

          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
            <section className="overflow-hidden rounded-xl border border-borda-sutil bg-painel" aria-labelledby="titulo-trilhas">
              <div className="border-b border-borda-sutil p-4">
                <h2 id="titulo-trilhas" className="text-lg font-medium">Trilhas de desenvolvimento</h2>
                <form method="get" className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_190px_auto]">
                  <label className="relative"><span className="sr-only">Buscar trilha</span><Search aria-hidden="true" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-texto-3" /><Input name="q" defaultValue={busca} placeholder="Buscar trilha" className="pl-9" /></label>
                  <label><span className="sr-only">Situação</span><Select name="situacao" defaultValue={filtroSituacao}><option value="todas">Situação: todas</option><option value="ativas">Ativas</option><option value="inativas">Inativas</option></Select></label>
                  <Botao tipo="fantasma">Filtrar</Botao>
                </form>
              </div>

              {lista.trilhas.length === 0 ? (
                <div className="p-5"><Vazio>Nenhuma trilha criada ainda. Uma trilha é a sequência de aulas que o mentorado percorre — crie a primeira abaixo e depois acrescente as aulas.</Vazio></div>
              ) : trilhasVisiveis.length === 0 ? (
                <div className="p-5"><Vazio>Nenhuma trilha corresponde aos filtros escolhidos.</Vazio></div>
              ) : (
                <ul className="divide-y divide-borda-sutil px-4">
                  {trilhasVisiveis.map(({ trilha, aulas: aulasDaTrilha }) => (
                    <li key={trilha.id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_90px_88px_auto] sm:items-center">
                      <div className="min-w-0"><p className="truncate font-medium text-texto">{trilha.nome}</p>{trilha.descricao ? <p className="mt-1 line-clamp-1 text-xs text-texto-3">{trilha.descricao}</p> : null}</div>
                      <span className="text-sm tabular-nums text-texto-2">{lista.parcial ? "Aulas indisponíveis" : quantidadeDeAulas(aulasDaTrilha.length)}</span>
                      <Badge tom={trilha.ativa ? "verde" : "cinza"}>{trilha.ativa ? "Ativa" : "Inativa"}</Badge>
                      <Link href={`/trilhas/${trilha.id}`} className="text-sm font-medium text-primaria-2 hover:underline">Abrir trilha <span aria-hidden="true">→</span></Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <aside className="space-y-4">
              <section className="rounded-xl border border-borda-sutil bg-painel p-4">
                <h2 className="text-lg font-medium">Próximas ações</h2>
                {proximasAcoes.length === 0 ? <p className="mt-3 text-sm leading-relaxed text-texto-2">{lista.parcial ? "As aulas não foram carregadas; não há base completa para sugerir ações sobre elas." : "Não há trilhas inativas nem trilhas sem aulas para revisar agora."}</p> : (
                  <ul className="mt-3 divide-y divide-borda-sutil">{proximasAcoes.map(({ trilha, aulas: aulasDaTrilha }) => <li key={trilha.id} className="py-3"><Link href={`/trilhas/${trilha.id}`} className="text-sm font-medium text-texto hover:text-primaria-2">{!trilha.ativa ? "Revisar trilha inativa" : aulasDaTrilha.length === 0 ? "Adicionar a primeira aula" : "Abrir trilha"}</Link><p className="mt-1 text-xs text-texto-3">{trilha.nome}</p></li>)}</ul>
                )}
              </section>
              <section className="rounded-xl border border-borda-sutil bg-painel p-4">
                <h2 className="text-lg font-medium">Como funciona</h2>
                <ol className="mt-3 space-y-3 text-sm"><li><strong className="font-medium text-texto">1. Perguntar</strong><p className="mt-0.5 text-xs leading-relaxed text-texto-3">Faça perguntas que provoquem reflexão e ampliem a consciência.</p></li><li><strong className="font-medium text-texto">2. Registrar</strong><p className="mt-0.5 text-xs leading-relaxed text-texto-3">Organize aprendizados, decisões e próximos passos.</p></li><li><strong className="font-medium text-texto">3. Acompanhar</strong><p className="mt-0.5 text-xs leading-relaxed text-texto-3">Acompanhe o progresso e ajuste a jornada quando necessário.</p></li></ol>
                <p className="mt-4 rounded-lg border border-primaria/40 bg-primaria/5 px-3 py-2.5 text-sm leading-relaxed text-primaria-2">O mentor faz perguntas; o cliente constrói o próprio caminho.</p>
              </section>
            </aside>
          </div>

          {/* O formulário só existe quando há banco para receber o que ele
              manda — oferecer "criar trilha" desconectado é prometer o que
              não vai acontecer. */}
          <details id="nova-trilha" open className="rounded-2xl border border-borda-sutil bg-poco px-4 py-3">
            <summary className="trans list-none cursor-pointer text-sm font-medium text-primaria-2 [&::-webkit-details-marker]:hidden">
              + Nova trilha
            </summary>
            <form action={salvarTrilhaDaGestao} className="mt-3 grid gap-3">
              <Campo label="Nome">
                <Input name="nome" maxLength={200} required placeholder="Como o mentorado vai reconhecer esta trilha" />
              </Campo>
              <Campo label="Descrição (opcional)">
                <TextArea name="descricao" maxLength={2000} placeholder="Uma frase sobre o que a pessoa aprende aqui" />
              </Campo>
              <div>
                <Botao>Criar trilha</Botao>
              </div>
            </form>
          </details>
        </>
      )}
    </div>
  );
}
