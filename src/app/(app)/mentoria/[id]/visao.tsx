// A parte PURA de apresentação da ficha do mentorado — recebe a `Ficha`
// (contrato de `src/lib/mentoria/dados.ts`) já resolvida e um `erro`
// opcional (já traduzido, vindo de `?erro=`), e só desenha. `page.tsx`
// cuida da busca (`lerFicha`) e da leitura de `params`/`searchParams`;
// nenhuma consulta aqui — mesma disciplina de `../portal/visao.tsx`.
//
// NÃO usa `notFound()` — mesma razão do `page.tsx` original: `lerFicha`
// distingue "não existe" (`conectado: true`, `mentorado: null`) de "não
// consegui ler" (`conectado: false`), e a tela precisa deixar essa
// diferença visível.

import Link from "next/link";
import { Badge, Botao, Campo, Card, Input, PageHeader, ProgressBar, Select, TextArea, Vazio, type Tom } from "@/components/ui";
import { agendarSessao, darBaixaNaSessao } from "@/lib/mentoria/acoes";
import type { Ficha } from "@/lib/mentoria/dados";
import type { StatusMentorado, StatusSessao } from "@/lib/mentoria/tipos";
import { STATUS_BAIXA_VALORES } from "@/lib/mentoria/validacao";
import { dataBr, dataHoraBr, variacaoScore } from "../textos";

const LABEL_STATUS_MENTORADO: Record<StatusMentorado, string> = {
  lead: "Lead",
  ativo: "Ativo",
  pausado: "Pausado",
  alumni: "Alumni",
};

const TOM_STATUS_MENTORADO: Record<StatusMentorado, Tom> = {
  lead: "cinza",
  ativo: "verde",
  pausado: "ouro",
  alumni: "azul",
};

const LABEL_STATUS_SESSAO: Record<StatusSessao, string> = {
  agendada: "Agendada",
  realizada: "Realizada",
  faltou: "Faltou",
  cancelada: "Cancelada",
};

const TOM_STATUS_SESSAO: Record<StatusSessao, Tom> = {
  agendada: "azul",
  realizada: "verde",
  faltou: "vermelho",
  cancelada: "cinza",
};

/** Tom da pílula de variação do score — sobe é bom, desce é ruim, empate é neutro. */
const TOM_VARIACAO: Record<"▲" | "▼" | "▬", Tom> = {
  "▲": "verde",
  "▼": "vermelho",
  "▬": "cinza",
};

// Rótulo dos três status que `darBaixaNaSessao` aceita (STATUS_BAIXA_VALORES,
// única fonte da verdade em `validacao.ts` — o `<select>` da baixa nunca
// pode oferecer uma opção que a Server Action recusaria). Reaproveita o
// mesmo texto de LABEL_STATUS_SESSAO, sem repetir a tradução à mão.
const LABEL_STATUS_BAIXA: Record<(typeof STATUS_BAIXA_VALORES)[number], string> = {
  realizada: LABEL_STATUS_SESSAO.realizada,
  faltou: LABEL_STATUS_SESSAO.faltou,
  cancelada: LABEL_STATUS_SESSAO.cancelada,
};

export function FichaVisao({ ficha, erro }: { ficha: Ficha; erro?: string }) {
  // Estado 1: sem Supabase configurado, ou a leitura falhou — mesma frase
  // humana da carteira, mesmo `motivo` pronto de `lerFicha`.
  if (!ficha.conectado) {
    return (
      <>
        <p className="mb-2 text-xs text-texto-2">
          <Link href="/mentoria" className="hover:text-primaria-2">
            ← Mentoria
          </Link>
        </p>
        <Card>
          <p className="text-sm text-texto-2">{ficha.motivo}</p>
        </Card>
      </>
    );
  }

  // Estado 2: conectou, mas este id não existe (ou não é mais deste
  // workspace). Regra 7 de `dados.ts` — nunca vira `notFound()`.
  if (!ficha.mentorado) {
    return (
      <>
        <p className="mb-2 text-xs text-texto-2">
          <Link href="/mentoria" className="hover:text-primaria-2">
            ← Mentoria
          </Link>
        </p>
        <Card>
          <Vazio>
            Não encontramos este mentorado. Ele pode ter sido removido, ou o link está errado —{" "}
            <Link href="/mentoria" className="text-primaria-2 hover:underline">
              volte para a carteira
            </Link>
            .
          </Vazio>
        </Card>
      </>
    );
  }

  const { mentorado } = ficha;
  const variacao = variacaoScore(ficha.scores);
  const tarefasAbertas = ficha.tarefas.filter((t) => !t.concluida);

  return (
    <>
      <p className="mb-2 text-xs text-texto-2">
        <Link href="/mentoria" className="hover:text-primaria-2">
          ← Mentoria
        </Link>
      </p>

      <PageHeader titulo={mentorado.nome}>
        <Badge tom={TOM_STATUS_MENTORADO[mentorado.status]}>{LABEL_STATUS_MENTORADO[mentorado.status]}</Badge>
      </PageHeader>

      {/* Erro de `agendarSessao`/`darBaixaNaSessao` (validação ou banco) volta
          aqui, em `?erro=` — mensagem já humana, sem detalhe técnico (ver
          `acoes.ts`). Mesmo estilo visual do banner de erro de `/agenda`. */}
      {erro ? (
        <p className="mb-4 rounded-xl border border-negativo/40 bg-negativo/10 px-4 py-3 text-sm text-negativo">
          {erro}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card titulo="Contato">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-texto-2">Telefone</dt>
              <dd>{mentorado.telefone || "—"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-texto-2">E-mail</dt>
              <dd className="truncate">{mentorado.email || "—"}</dd>
            </div>
          </dl>
        </Card>

        <Card titulo="Matrículas" className="lg:col-span-2">
          {ficha.matriculas.length ? (
            <ul className="space-y-4">
              {ficha.matriculas.map(({ matricula, programa, progresso }) => {
                const excedente =
                  progresso.excedeu && progresso.previstas !== null
                    ? progresso.realizadas - progresso.previstas
                    : 0;
                return (
                  <li key={matricula.id}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{programa?.nome ?? "Programa não encontrado"}</span>
                      <span className="text-xs text-texto-2">{progresso.rotulo}</span>
                    </div>
                    {excedente > 0 ? (
                      <p className="mt-0.5 text-xs text-texto-2">{excedente} sessões além do pacote</p>
                    ) : null}
                    {progresso.percentual !== null ? (
                      <div className="mt-1.5">
                        <ProgressBar pct={progresso.percentual} />
                      </div>
                    ) : null}
                    {/* Só matrícula ATIVA agenda sessão nova — trancada,
                        cancelada ou concluída não recebe compromisso novo. */}
                    {matricula.status === "ativa" ? (
                      <details className="mt-2 rounded-lg border border-borda-sutil bg-poco px-3 py-2">
                        {/* `list-none` some com o triângulo nativo do
                            `<details>` (▶ no Chrome/Firefox) e
                            `[&::-webkit-details-marker]:hidden` faz o mesmo no
                            Safari/WebKit, que ignora `list-none` aqui — sem os
                            dois, o "+" escrito no texto virava um SEGUNDO
                            marcador ao lado do nativo ("▶ + Agendar sessão"),
                            e ▶ nem está no conjunto de glifos que esta tela
                            permite (▲ ▼ ▬). */}
                        <summary className="trans list-none cursor-pointer text-xs font-medium text-primaria-2 [&::-webkit-details-marker]:hidden">
                          + Agendar sessão
                        </summary>
                        <form action={agendarSessao} className="mt-3 grid gap-3 sm:grid-cols-3">
                          <input type="hidden" name="mentoradoId" value={mentorado.id} />
                          <input type="hidden" name="matriculaId" value={matricula.id} />
                          <Campo label="Data e hora" className="sm:col-span-2">
                            <Input type="datetime-local" name="quando" required />
                          </Campo>
                          <Campo label="Duração (min)">
                            <Input type="number" name="duracaoMin" min={5} max={600} step={5} defaultValue={60} required />
                          </Campo>
                          <Campo label="Número da sessão (opcional)">
                            <Input type="number" name="numero" min={1} step={1} placeholder="ex.: 8" />
                          </Campo>
                          <div className="flex items-end sm:col-span-2">
                            <Botao className="w-full sm:w-auto">Agendar</Botao>
                          </div>
                        </form>
                      </details>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <Vazio>Nenhuma matrícula registrada para este mentorado.</Vazio>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card titulo={`Histórico de sessões (${ficha.sessoes.length})`}>
            {ficha.sessoes.length ? (
              <ul className="space-y-3">
                {ficha.sessoes.map((sessao) => (
                  <li key={sessao.id} className="rounded-lg border border-borda bg-painel p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium">
                        {sessao.numero !== null ? `Sessão ${sessao.numero}` : "Sessão"} · {dataHoraBr(sessao.quando) || "data não informada"}
                      </span>
                      <Badge tom={TOM_STATUS_SESSAO[sessao.status]}>{LABEL_STATUS_SESSAO[sessao.status]}</Badge>
                    </div>
                    {sessao.resumo ? <p className="mt-1.5 text-sm text-texto-2">{sessao.resumo}</p> : null}
                    {sessao.linkGravacao ? (
                      <a
                        href={sessao.linkGravacao}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1.5 inline-block text-xs text-primaria-2 hover:underline"
                      >
                        Ver gravação
                      </a>
                    ) : null}
                    {/* Dar baixa só existe para quem ainda está "agendada" —
                        sair de agendada é o único movimento desta ação (ver
                        `validacao.ts`: o status de baixa nunca aceita voltar
                        para "agendada", isso seria remarcar). */}
                    {sessao.status === "agendada" ? (
                      <details className="mt-2 rounded-lg border border-borda-sutil bg-poco px-3 py-2">
                        {/* mesmo motivo do "+ Agendar sessão" acima: sem estas
                            duas classes o marcador nativo do `<details>`
                            aparece do lado do "+" escrito à mão. */}
                        <summary className="trans list-none cursor-pointer text-xs font-medium text-primaria-2 [&::-webkit-details-marker]:hidden">
                          + Dar baixa
                        </summary>
                        <form action={darBaixaNaSessao} className="mt-3 grid gap-3 sm:grid-cols-2">
                          <input type="hidden" name="mentoradoId" value={mentorado.id} />
                          <input type="hidden" name="sessaoId" value={sessao.id} />
                          <Campo label="Status">
                            <Select name="status" defaultValue="realizada" required>
                              {STATUS_BAIXA_VALORES.map((status) => (
                                <option key={status} value={status}>
                                  {LABEL_STATUS_BAIXA[status]}
                                </option>
                              ))}
                            </Select>
                          </Campo>
                          <Campo label="Link da gravação (opcional)">
                            <Input type="url" name="linkGravacao" placeholder="https://…" />
                          </Campo>
                          <Campo label="Resumo (opcional)" className="sm:col-span-2">
                            <TextArea name="resumo" placeholder="O que foi conversado, combinado…" />
                          </Campo>
                          <div className="sm:col-span-2">
                            <Botao>Registrar</Botao>
                          </div>
                        </form>
                      </details>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <Vazio>Nenhuma sessão registrada ainda.</Vazio>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card titulo="Evolução do score">
            {variacao ? (
              <p className="flex items-baseline gap-2">
                <Badge tom={TOM_VARIACAO[variacao.glifo]}>{variacao.texto}</Badge>
                <span className="text-xs text-texto-2">entre a primeira e a última semana registrada</span>
              </p>
            ) : (
              // Zero ou um ponto: uma medição não é uma série (ver
              // `variacaoScore` em textos.ts) — nada de tendência inventada.
              <Vazio>Ainda não há histórico suficiente para mostrar uma variação.</Vazio>
            )}
          </Card>

          <Card titulo={`Tarefas em aberto (${tarefasAbertas.length})`}>
            {tarefasAbertas.length ? (
              <ul className="space-y-1.5 text-sm">
                {tarefasAbertas.map((t) => (
                  <li key={t.id} className="flex items-baseline justify-between gap-2">
                    <span>{t.titulo}</span>
                    {/* `tarefa_mentoria.prazo` é `date` (0006:198), sem hora
                        nem fuso — `dataBr`, não `dataHoraBr`, é quem lê isso
                        sem passar por `new Date()` (ver o comentário de
                        `dataBr` em textos.ts: MÉDIO 2). */}
                    <span className="shrink-0 text-xs text-texto-2">{t.prazo ? dataBr(t.prazo) || t.prazo : ""}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Vazio>Nenhuma tarefa em aberto.</Vazio>
            )}
          </Card>

          <Card titulo={`Marcos conquistados (${ficha.marcos.length})`}>
            {ficha.marcos.length ? (
              <ul className="space-y-1.5 text-sm">
                {ficha.marcos.map((m) => (
                  <li key={m.id}>
                    <span className="font-medium">{m.titulo}</span>
                    {m.descricao ? <p className="text-xs text-texto-2">{m.descricao}</p> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <Vazio>Nenhum marco conquistado ainda.</Vazio>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
