// O bloco de CONTEÚDOS LIBERADOS da ficha do mentorado — o que já foi
// entregue a esta pessoa, e o formulário que entrega mais um. Componente puro
// de apresentação, no mesmo molde de `./documentos.tsx`: recebe a lista já
// resolvida por `lerFicha` e só desenha. As Server Actions entram como
// `action={...}`, nunca chamadas.
//
// O BURACO QUE ESTE BLOCO FECHA
// -----------------------------
// A tabela `conteudo_liberado` existe desde a migração 0006 e o portal desenha
// a lista dela desde que o portal existe. Até a Tarefa 21, NADA no sistema
// escrevia nessa tabela: a tela do cliente mostrava, com toda a honestidade,
// uma lista que ninguém tinha como preencher.
//
// REVOGADO SAI DA LISTA DO CLIENTE, MAS NÃO SOME DA FICHA
// -------------------------------------------------------
// Revogar liga `arquivado` (0018) e nunca apaga. O mentorado deixa de enxergar
// a linha — e não por filtro de tela, mas pela política de select, que exige
// `arquivado = false` no ramo dele. Aqui, na ficha da gestão, o revogado
// CONTINUA visível, marcado como tal: "não é mais oferecido a ele" e "nunca
// aconteceu" são coisas diferentes, e quem opera precisa saber qual das duas
// está olhando. Conteúdo liberado é uma promessa feita a um cliente; apagar a
// linha apagaria a prova de que a promessa existiu.
//
// O QUE ESTA TELA NÃO FAZ
// -----------------------
// Não decide se um endereço é seguro. Quem decide é `linkGravacaoValido`
// (`validacao.ts`), a MESMA checagem que a Server Action usa na escrita e que
// o portal usa para decidir se vira `<a href>`. Se a regra morasse aqui
// também, seriam três opiniões sobre a mesma pergunta, e a terceira seria a
// que ninguém lembra de atualizar.

import { Botao, Campo, Card, Input, Vazio } from "@/components/ui";
import { liberarConteudoDaFicha, revogarConteudoDaFicha } from "@/lib/mentoria/acoes-ficha";
import type { ConteudoLiberado } from "@/lib/mentoria/tipos";
import { linkGravacaoValido } from "@/lib/mentoria/validacao";
// `dataHoraBr`, e não `dataBr`: `liberado_em` é `timestamptz` (0006), e
// `dataBr` só aceita data pura -- de propósito, para não existir conversão de
// fuso nenhuma para dar errado. Cortar a string em 10 caracteres seria o
// atalho errado: um instante gravado às 02:00 UTC é do dia ANTERIOR em São
// Paulo, e a lista mostraria a data de ontem.
import { dataHoraBr } from "../textos";

export function ConteudosLiberados({
  mentoradoId,
  conteudos,
}: {
  mentoradoId: string;
  conteudos: readonly ConteudoLiberado[];
}) {
  const ativos = conteudos.filter((c) => !c.arquivado);
  const revogados = conteudos.filter((c) => c.arquivado);

  return (
    <Card titulo={`Conteúdos liberados (${ativos.length})`}>
      {ativos.length ? (
        <ul className="space-y-2.5 text-sm">
          {ativos.map((conteudo) => (
            <li
              key={conteudo.id}
              className="flex flex-wrap items-baseline justify-between gap-2 border-b border-borda-sutil pb-2.5 last:border-0 last:pb-0"
            >
              <span className="min-w-0">
                {linkGravacaoValido(conteudo.url) && conteudo.url.trim() !== "" ? (
                  <a
                    href={conteudo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primaria-2 hover:underline"
                  >
                    {conteudo.titulo}
                  </a>
                ) : (
                  // Endereço que a escrita não deixaria passar só pode ter
                  // vindo de antes desta tarefa, ou direto do banco. O título
                  // aparece assim mesmo — sumir com a linha esconderia da
                  // gestão um conteúdo que o mentorado talvez esteja vendo.
                  <span>{conteudo.titulo}</span>
                )}
                {dataHoraBr(conteudo.liberadoEm) ? (
                  <span className="ml-2 text-xs text-texto-3">
                    liberado em {dataHoraBr(conteudo.liberadoEm)}
                  </span>
                ) : null}
              </span>
              <form action={revogarConteudoDaFicha}>
                <input type="hidden" name="mentoradoId" value={mentoradoId} />
                <input type="hidden" name="conteudoId" value={conteudo.id} />
                <Botao tipo="fantasma">Revogar</Botao>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <Vazio>Nenhum conteúdo liberado para este mentorado ainda.</Vazio>
      )}

      {revogados.length ? (
        <details className="mt-3 rounded-lg border border-borda-sutil bg-poco px-3 py-2">
          <summary className="trans list-none cursor-pointer text-xs font-medium text-primaria-2 [&::-webkit-details-marker]:hidden">
            + {revogados.length} {revogados.length === 1 ? "revogado" : "revogados"}
          </summary>
          <ul className="mt-2 space-y-1.5 text-xs text-texto-2">
            {revogados.map((conteudo) => (
              <li key={conteudo.id}>
                {conteudo.titulo}
                {dataHoraBr(conteudo.liberadoEm) ? (
                  <span className="ml-2 text-texto-3">liberado em {dataHoraBr(conteudo.liberadoEm)}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <details className="mt-4 rounded-lg border border-borda-sutil bg-poco px-3 py-2">
        <summary className="trans list-none cursor-pointer text-xs font-medium text-primaria-2 [&::-webkit-details-marker]:hidden">
          + Liberar conteúdo
        </summary>
        <form action={liberarConteudoDaFicha} className="mt-3 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="mentoradoId" value={mentoradoId} />
          <Campo label="Título">
            <Input name="titulo" maxLength={200} required placeholder="Como o mentorado vai reconhecer o material" />
          </Campo>
          <Campo label="Endereço (http ou https)">
            <Input type="url" name="url" required placeholder="https://…" />
          </Campo>
          <div className="sm:col-span-2">
            <Botao>Liberar</Botao>
            <p className="mt-1.5 text-xs text-texto-2">
              O mentorado passa a ver este item no portal dele — só ele, mais ninguém.
            </p>
          </div>
        </form>
      </details>
    </Card>
  );
}
