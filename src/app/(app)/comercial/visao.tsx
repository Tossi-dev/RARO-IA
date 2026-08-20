// A parte PURA de apresentação do funil comercial. Recebe o `PipelineDoTime`
// já resolvido e só desenha; `page.tsx` cuida da busca.
//
// ============================================================
// FUNIL VAZIO NÃO VIRA FUNIL DESENHADO COM ZEROS
// ============================================================
//
// Sem negociação nenhuma, esta tela NÃO mostra a tabela de conversão com
// tudo em 0%. Mostra uma frase dizendo que ainda não há o que medir.
//
// A diferença não é estética. Um funil desenhado com zeros parece um
// diagnóstico ("perdemos tudo na primeira etapa"), e é só a ausência de dado.
// É a mesma decisão da barra de progresso do onboarding, que some com
// `pct: null`, e da taxa `null` de `funil.ts`, que existe justamente para a
// tela poder dizer coisas diferentes.
//
// Pelo mesmo motivo, taxa `null` aparece como PALAVRA ("sem base"), nunca
// como "0%".
//
// ============================================================
// PERDER PEDE O MOTIVO NO MESMO PASSO
// ============================================================
//
// O `check perda_tem_motivo` (0024) recusa perda sem motivo dentro do banco.
// Se o formulário tivesse dois passos — clicar em "perdi" e depois preencher
// —, o caminho normal do usuário seria bater na constraint. Então o botão de
// perder ABRE junto com o campo, e o campo é `required`.
//
// ============================================================
// O QUE ESTA TELA NÃO FAZ
// ============================================================
//
// Ganhar não cria cliente. A negociação ganha aparece na lista de fechadas
// com a marca de que ainda não virou mentorado — é o rascunho que alguém
// confirma, e a confirmação é de outra tela. Ver o cabeçalho de `acoes.ts`.

import { Badge, Botao, Campo, Card, Input, PageHeader, Select, TextArea, Vazio } from "@/components/ui";
import { KanbanColunas } from "@/components/kanban";
import {
  criarOportunidadeDoForm,
  ganharOportunidadeDoForm,
  moverOportunidadeDoForm,
  perderOportunidadeDoForm,
} from "@/lib/comercial/acoes-form";
import type { OportunidadeLida, PipelineDoTime } from "@/lib/comercial/dados";
import { fmtBRL } from "@/lib/format";

/** A taxa como texto. `null` é palavra, nunca "0%" — ver o cabeçalho. */
function taxaEmTexto(taxa: number | null): string {
  return taxa === null ? "sem base" : `${taxa}%`;
}

function Cartao({
  oportunidade,
  nome,
  etapas,
}: {
  oportunidade: OportunidadeLida;
  nome: string;
  etapas: PipelineDoTime["etapas"];
}) {
  const outras = etapas.filter((e) => e.ativa && e.id !== oportunidade.etapaId);

  return (
    <article className="rounded-lg border border-borda bg-painel-2 p-2.5" data-oportunidade={oportunidade.id}>
      <div className="flex items-start justify-between gap-1">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{nome}</span>
        <span className="tabular-nums text-xs text-texto-2">{fmtBRL(oportunidade.valor)}</span>
      </div>

      <p className="mt-1 flex items-center justify-between text-xs text-texto-2">
        <span>{oportunidade.origem || "sem origem"}</span>
        <span className="tabular-nums">{oportunidade.probabilidade}% de chance</span>
      </p>

      {outras.length > 0 ? (
        <details className="relative mt-2">
          <summary className="toque trans inline-flex cursor-pointer list-none items-center rounded text-xs text-primaria-2 [&::-webkit-details-marker]:hidden">
            Mover
          </summary>
          <div className="absolute left-0 z-10 mt-1 w-44 rounded-lg border border-borda bg-fundo p-1 shadow-xl">
            {outras.map((e) => (
              <form key={e.id} action={moverOportunidadeDoForm}>
                <input type="hidden" name="id" value={oportunidade.id} />
                <input type="hidden" name="etapaId" value={e.id} />
                <button className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-painel-2">
                  {e.nome || e.chave}
                </button>
              </form>
            ))}
          </div>
        </details>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <form action={ganharOportunidadeDoForm}>
          <input type="hidden" name="id" value={oportunidade.id} />
          <Botao tipo="fantasma">Ganhou</Botao>
        </form>

        {/* Perder e dizer por quê são o MESMO passo — ver o cabeçalho. */}
        <details data-perder={oportunidade.id}>
          <summary className="toque trans inline-flex cursor-pointer list-none items-center rounded text-xs text-texto-2 hover:text-negativo [&::-webkit-details-marker]:hidden">
            Perdeu
          </summary>
          <form action={perderOportunidadeDoForm} className="mt-2 space-y-2">
            <input type="hidden" name="id" value={oportunidade.id} />
            <Campo label="Por que perdeu">
              <TextArea name="motivo" rows={2} maxLength={2000} required placeholder="Preço, prazo, foi para quem?" />
            </Campo>
            <Botao tipo="fantasma">Registrar a perda</Botao>
          </form>
        </details>
      </div>
    </article>
  );
}

export function ComercialVisao({ pipeline, erro = "" }: { pipeline: PipelineDoTime; erro?: string }) {
  const { conversao, etapas, oportunidades, alunos } = pipeline;
  const nomeDoAluno = new Map(alunos.map((a) => [a.id, a.nome]));
  const nomeDe = (o: OportunidadeLida) => nomeDoAluno.get(o.alunoId) || "Sem nome";

  const abertas = oportunidades.filter((o) => o.status === "aberta");
  const fechadas = oportunidades.filter((o) => o.status === "ganha" || o.status === "perdida");
  const ativas = etapas.filter((e) => e.ativa);

  return (
    <>
      <PageHeader
        titulo="Negociações"
        sub="O funil aberto: em que etapa está cada negócio, quanto vale e o que já fechou"
      />

      {erro ? (
        <p className="mb-4 rounded-xl border border-negativo/40 bg-negativo/10 px-4 py-3 text-sm text-negativo">
          {erro}
        </p>
      ) : null}

      {!pipeline.conectado ? (
        <Card>
          <p className="text-sm text-texto-2">{pipeline.motivo}</p>
        </Card>
      ) : (
        <>
          {pipeline.parcial ? (
            <p className="mb-4 rounded-xl border border-atencao/40 bg-atencao/10 px-4 py-3 text-sm text-texto-2">
              A leitura veio incompleta. Os cartões abaixo são verdade, mas os números do funil ficam de
              fora até a próxima tentativa — conta feita com metade dos dados não é conta.
            </p>
          ) : null}

          {conversao === null || oportunidades.length === 0 ? (
            <Card titulo="Conversão">
              <Vazio>
                Ainda não há negociação para medir. Assim que o primeiro negócio entrar no funil, aparece
                aqui quanta gente passou por cada etapa e quanta avançou.
              </Vazio>
            </Card>
          ) : (
            <Card titulo="Conversão">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-texto-2">
                      <th className="pb-2 pr-3 font-medium">Etapa</th>
                      <th className="pb-2 pr-3 font-medium">Entraram</th>
                      <th className="pb-2 pr-3 font-medium">Avançaram</th>
                      <th className="pb-2 pr-3 font-medium">Taxa</th>
                      <th className="pb-2 font-medium">Em aberto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conversao.linhas.map((linha) => (
                      <tr key={linha.etapaId} className="border-t border-borda-sutil">
                        <td className="py-2 pr-3">{linha.nome || linha.chave}</td>
                        <td className="py-2 pr-3 tabular-nums">{linha.entraram}</td>
                        <td className="py-2 pr-3 tabular-nums">{linha.avancaram}</td>
                        <td className="py-2 pr-3 tabular-nums" data-taxa={linha.etapaId}>
                          {taxaEmTexto(linha.taxa)}
                        </td>
                        <td className="py-2 tabular-nums">{fmtBRL(linha.valorEmAberto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="mt-3 text-xs text-texto-2">
                Ciclo médio ·{" "}
                {pipeline.cicloMedioDias === null
                  ? "ainda não há negócio fechado para medir"
                  : `${pipeline.cicloMedioDias} dias entre abrir e fechar`}
              </p>

              {conversao.parcial ? (
                <p className="mt-1.5 text-xs text-texto-2">
                  O funil conta só o que tem registro. Negócio que já está adiante de uma etapa sem
                  passagem anotada não entra na conta dela — por isso alguns números podem parecer baixos.
                </p>
              ) : null}

              {conversao.inconsistentes.length > 0 ? (
                <p className="mt-1.5 text-xs text-negativo">
                  {conversao.inconsistentes.length} negociação(ões) com dado que não dá para ler — valor
                  negativo, etapa inexistente ou situação desconhecida. Elas ficaram de fora das somas.
                </p>
              ) : null}
            </Card>
          )}

          <div className="mt-4">
            {ativas.length === 0 ? (
              <Card titulo="Funil">
                <Vazio>
                  Nenhuma etapa configurada no funil ainda. Sem etapa, não há para onde mover um negócio.
                </Vazio>
              </Card>
            ) : (
              <KanbanColunas
                colunas={ativas.map((etapa) => {
                  const daEtapa = abertas.filter((o) => o.etapaId === etapa.id);
                  return {
                    id: etapa.id,
                    titulo: etapa.nome || etapa.chave,
                    rotuloAria: `Etapa ${etapa.nome || etapa.chave}`,
                    etiqueta: <Badge tom={etapa.tipo === "closer" ? "azul" : "cinza"}>{daEtapa.length}</Badge>,
                    conteudo: (
                      <>
                        {daEtapa.map((o) => (
                          <Cartao key={o.id} oportunidade={o} nome={nomeDe(o)} etapas={etapas} />
                        ))}
                        {daEtapa.length === 0 ? (
                          <p className="px-2 py-6 text-center text-xs text-texto-2">Vazio</p>
                        ) : null}
                      </>
                    ),
                  };
                })}
              />
            )}
          </div>

          <details className="mt-4 rounded-2xl border border-borda-sutil bg-poco px-4 py-3">
            <summary className="trans list-none cursor-pointer text-sm font-medium text-primaria-2 [&::-webkit-details-marker]:hidden">
              + Nova negociação
            </summary>
            <form action={criarOportunidadeDoForm} className="mt-3 grid gap-3 sm:grid-cols-2">
              <Campo label="De quem é">
                <Select name="alunoId" required>
                  {alunos.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nome || "Sem nome"}
                    </option>
                  ))}
                </Select>
              </Campo>
              <Campo label="Etapa">
                <Select name="etapaId" required>
                  {ativas.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nome || e.chave}
                    </option>
                  ))}
                </Select>
              </Campo>
              <Campo label="Valor">
                <Input type="number" name="valor" min={0} step="0.01" defaultValue={0} />
              </Campo>
              <Campo label="Chance de fechar (%)">
                {/* Inteiro de 0 a 100: o `check` de 0024 recusa o resto, e a
                    ação recusa antes, para a mensagem ser humana. */}
                <Input type="number" name="probabilidade" min={0} max={100} step={1} defaultValue={0} />
              </Campo>
              <div className="sm:col-span-2">
                <Campo label="Origem (opcional)">
                  <Input name="origem" maxLength={120} placeholder="Indicação, anúncio, lista..." />
                </Campo>
              </div>
              <div className="sm:col-span-2">
                <Botao>Abrir negociação</Botao>
              </div>
            </form>
          </details>

          {fechadas.length > 0 ? (
            <Card titulo={`Fechadas (${fechadas.length})`} className="mt-4">
              <ul className="space-y-2.5">
                {fechadas.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <span>
                      {nomeDe(o)}
                      <span className="ml-2 tabular-nums text-xs text-texto-2">{fmtBRL(o.valor)}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      {o.status === "ganha" ? (
                        <>
                          <Badge tom="verde">Ganha</Badge>
                          {/* Ganhar não cria cliente: a ficha nasce de uma
                              confirmação, não de um clique. Ver acoes.ts. */}
                          {!o.mentoradoId ? (
                            <span className="text-xs text-texto-2">ainda não virou mentorado</span>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <Badge tom="cinza">Perdida</Badge>
                          <span className="text-xs text-texto-2">{o.motivoPerda || "sem motivo registrado"}</span>
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </>
      )}
    </>
  );
}
