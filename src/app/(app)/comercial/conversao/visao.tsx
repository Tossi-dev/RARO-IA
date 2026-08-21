// A parte PURA do dashboard de conversão. Recebe o `PipelineDoTime` já
// resolvido e só desenha.
//
// ============================================================
// TODA MÉTRICA SEM BASE É FRASE, NUNCA NÚMERO
// ============================================================
//
// Esta tela existe para uma pergunta só: onde o time perde negócio. Um número
// inventado aqui não é um erro de exibição — é o dono mudando o treinamento
// da equipe por causa de uma conta que ninguém fez. Então:
//
//   - leitura parcial (`conversao: null`) NÃO desenha gráfico nenhum e diz
//     que não deu para calcular;
//   - funil sem ninguém em etapa alguma vira frase, não um gráfico de zeros;
//   - taxa `null` é "sem base", nunca 0%;
//   - ciclo médio `null` é frase, nunca "0 dias";
//   - perda sem motivo escrito é contagem, nunca uma fatia "Outros" (ver o
//     cabeçalho de `motivosDePerda`, em funil.ts).
//
// ============================================================
// BARRAS, E NÃO A ROSCA DE `GraficoFunil`
// ============================================================
//
// O plano pedia para reaproveitar `GraficoFunil`. Ele é a ROSCA do CRM, e as
// cores dele saem de `CORES_FUNIL`, um mapa indexado pelos nomes dos estágios
// do CRM ("Novo", "Qualificado"...). Um funil comercial com as etapas do
// Jefson cairia inteiro no `?? SERIE_1`: cinco fatias da mesma cor, que é
// exatamente o gráfico que não se lê.
//
// Além disso a pergunta é outra. Rosca responde "que proporção do total é
// cada etapa"; funil responde "quanta gente sobrou de uma etapa para a
// outra". Barras horizontais em ordem de etapa dizem isso — e continuam sendo
// reaproveitamento de `charts.tsx`, que é o que a instrução protegia.

import { GraficoBarrasH } from "@/components/charts";
import { Card, PageHeader, Vazio } from "@/components/ui";
import type { PipelineDoTime } from "@/lib/comercial/dados";
import { motivosDePerda } from "@/lib/comercial/funil";
import { fmtBRL } from "@/lib/format";

function taxaEmTexto(taxa: number | null): string {
  return taxa === null ? "sem base" : `${taxa}%`;
}

export function ConversaoVisao({ pipeline }: { pipeline: PipelineDoTime }) {
  const { conversao } = pipeline;
  const perdas = motivosDePerda(pipeline.oportunidades);

  return (
    <>
      <PageHeader
        titulo="Conversão"
        sub="Onde o funil perde negócio — por etapa, por tempo e por motivo"
      />

      {!pipeline.conectado ? (
        <Card>
          <p className="text-sm text-texto-2">{pipeline.motivo}</p>
        </Card>
      ) : conversao === null ? (
        // Leitura parcial. Desenhar o gráfico com o que veio seria mostrar um
        // funil que não corresponde a nada.
        <Card titulo="Conversão">
          <Vazio>
            A leitura veio incompleta e os números não foram calculados. Recarregue a página em
            instantes — número feito com metade dos dados não é número.
          </Vazio>
        </Card>
      ) : (
        <>
          <Card titulo="Quantas entraram em cada etapa">
            {conversao.linhas.every((l) => l.entraram === 0) ? (
              <Vazio>
                Nenhuma negociação passou por etapa alguma ainda. Assim que a primeira entrar, o funil
                aparece aqui.
              </Vazio>
            ) : (
              <div data-funil>
                <GraficoBarrasH
                  formato="num"
                  data={conversao.linhas.map((l) => ({ nome: l.nome || l.chave, valor: l.entraram }))}
                />
              </div>
            )}

            {conversao.parcial ? (
              <p className="mt-2 text-xs text-texto-2">
                O funil conta só o que tem registro de passagem. Negócio que já está adiante de uma
                etapa sem passagem anotada não entra na conta dela.
              </p>
            ) : null}
          </Card>

          <Card titulo="Taxa de avanço, etapa a etapa" className="mt-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-texto-2">
                    <th className="pb-2 pr-3 font-medium">Etapa</th>
                    <th className="pb-2 pr-3 font-medium">Entraram</th>
                    <th className="pb-2 pr-3 font-medium">Avançaram</th>
                    <th className="pb-2 font-medium">Taxa</th>
                  </tr>
                </thead>
                <tbody>
                  {conversao.linhas.map((l) => (
                    <tr key={l.etapaId} className="border-t border-borda-sutil">
                      <td className="py-2 pr-3">{l.nome || l.chave}</td>
                      <td className="py-2 pr-3 tabular-nums">{l.entraram}</td>
                      <td className="py-2 pr-3 tabular-nums">{l.avancaram}</td>
                      <td className="py-2 tabular-nums" data-taxa={l.etapaId}>
                        {taxaEmTexto(l.taxa)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-xs text-texto-2" data-ciclo>
              Ciclo médio ·{" "}
              {pipeline.cicloMedioDias === null
                ? "ainda não há negócio fechado para medir"
                : `${pipeline.cicloMedioDias} dias entre abrir e fechar`}
            </p>
          </Card>

          <Card titulo="Por que perdemos" className="mt-4">
            {perdas.total === 0 ? (
              <Vazio>Nenhuma perda registrada ainda.</Vazio>
            ) : perdas.grupos.length === 0 ? (
              // Todas as perdas estão sem motivo escrito. Um balde "Outros"
              // com 100% aqui pareceria resposta, e não é.
              <Vazio>
                {perdas.semMotivo === 1
                  ? "A única perda registrada não tem motivo escrito."
                  : `As ${perdas.semMotivo} perdas registradas não têm motivo escrito.`}{" "}
                Sem isso, o funil não aprende com elas.
              </Vazio>
            ) : (
              <>
                <div data-motivos>
                  <GraficoBarrasH
                    formato="num"
                    data={perdas.grupos.map((g) => ({ nome: g.motivo, valor: g.quantidade }))}
                  />
                </div>
                <ul className="mt-3 space-y-1.5 text-sm">
                  {perdas.grupos.map((g) => (
                    <li key={g.motivo} className="flex items-baseline justify-between gap-2">
                      <span>{g.motivo}</span>
                      <span className="tabular-nums text-xs text-texto-2">
                        {g.quantidade} · {fmtBRL(g.valor)}
                      </span>
                    </li>
                  ))}
                </ul>
                {perdas.semMotivo > 0 ? (
                  <p className="mt-3 text-xs text-texto-2" data-sem-motivo>
                    {perdas.semMotivo === 1
                      ? "Outra perda não tem motivo escrito e ficou de fora do gráfico."
                      : `Outras ${perdas.semMotivo} perdas não têm motivo escrito e ficaram de fora do gráfico.`}
                  </p>
                ) : null}
              </>
            )}
          </Card>
        </>
      )}
    </>
  );
}
