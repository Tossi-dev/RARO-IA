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
import { Badge, Botao, Campo, Card, Input, PageHeader, Tabela, Td, TextArea, Th, Vazio } from "@/components/ui";
import { salvarTrilhaDaGestao } from "@/lib/conteudo/acoes-gestao-trilha";
import type { ListaTrilhas } from "@/lib/conteudo/dados-trilha";

export function TrilhasVisao({ lista, erro = "" }: { lista: ListaTrilhas; erro?: string }) {
  return (
    <>
      <PageHeader
        titulo="Trilhas"
        sub="A esteira de aulas — o que abre, quando abre e para quem"
      />

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
          {lista.parcial && lista.motivo ? (
            <p className="mb-4 rounded-xl border border-aviso/40 bg-aviso/10 px-4 py-3 text-sm text-aviso">
              {lista.motivo}
            </p>
          ) : null}

          {lista.trilhas.length === 0 ? (
            <Card>
              <Vazio>
                Nenhuma trilha criada ainda. Uma trilha é a sequência de aulas que o mentorado
                percorre — crie a primeira abaixo e depois acrescente as aulas.
              </Vazio>
            </Card>
          ) : (
            <Card titulo={`Trilhas (${lista.trilhas.length})`}>
              <Tabela>
                <thead>
                  <tr>
                    <Th>Trilha</Th>
                    <Th num>Aulas</Th>
                    <Th>Situação</Th>
                  </tr>
                </thead>
                <tbody>
                  {lista.trilhas.map(({ trilha, aulas }) => (
                    <tr key={trilha.id}>
                      <Td principal rotulo="Trilha">
                        <Link href={`/trilhas/${trilha.id}`} className="text-primaria-2 hover:underline">
                          {trilha.nome}
                        </Link>
                        {trilha.descricao ? (
                          <span className="mt-0.5 block text-xs text-texto-3">{trilha.descricao}</span>
                        ) : null}
                      </Td>
                      <Td num rotulo="Aulas">
                        {aulas.length}
                      </Td>
                      <Td rotulo="Situação">
                        <Badge tom={trilha.ativa ? "verde" : "cinza"}>
                          {trilha.ativa ? "Ativa" : "Inativa"}
                        </Badge>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Tabela>
            </Card>
          )}

          {/* O formulário só existe quando há banco para receber o que ele
              manda — oferecer "criar trilha" desconectado é prometer o que
              não vai acontecer. */}
          <details className="mt-4 rounded-2xl border border-borda-sutil bg-poco px-4 py-3">
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
    </>
  );
}
