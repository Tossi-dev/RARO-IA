// /portal — o Portal do Mentorado: a tela que o Jefson mostra PRIMEIRO para
// um cliente novo. Quem entra aqui é o MENTORADO, não o time do Jefson —
// zero jargão interno, zero número inventado, zero emoji (regra de estilo
// da casa, ver `./textos.ts`).
//
// Server Component: lê tudo de `lerPortal` (src/lib/mentoria/portal.ts)
// numa ida só, sem cliente, sem estado — mesma forma de `/mentoria` e
// `/mentoria/[id]`. `new Date()` mora AQUI, na borda da rota, e só aqui:
// `portal.ts` e `textos.ts` são módulos puros que recebem "agora" como
// parâmetro (mesma regra documentada no topo de `progresso.ts`).
//
// TRÊS ESTADOS, sempre nesta ordem de checagem — ver o comentário de cada
// um mais abaixo, no corpo da função:
//   1) `conectado: false` — sem Supabase, ou a leitura falhou.
//   2) `conectado: true, ehMentorado: false` — conectou, mas quem está
//      logado não tem ficha de mentorado vinculada (ver regra 4 de
//      `lerPortal`). Mesma cautela de `/sem-acesso`: não diz qual papel a
//      pessoa tem, não lista o que existe do outro lado.
//   3) o portal de verdade.

import Link from "next/link";
import { Badge, Botao, Card, PageHeader, ProgressBar, Vazio, cx, type Tom } from "@/components/ui";
import { sair } from "@/lib/actions";
import { concluirTarefa, reabrirTarefa } from "@/lib/mentoria/acoes-portal";
import { lerPortal } from "@/lib/mentoria/portal";
import type { StatusMatricula, StatusSessao } from "@/lib/mentoria/tipos";
import { linkGravacaoValido } from "@/lib/mentoria/validacao";
import { dataBr, dataHoraBr, variacaoScore } from "../mentoria/textos";
import { dataHoraPorExtenso, diasAte, mensagemDeErro, programaAtual, saudacao, tomDoPrazo } from "./textos";

export const dynamic = "force-dynamic";

const LABEL_STATUS_MATRICULA: Record<StatusMatricula, string> = {
  ativa: "Ativa",
  concluida: "Concluída",
  cancelada: "Cancelada",
  trancada: "Trancada",
};

const TOM_STATUS_MATRICULA: Record<StatusMatricula, Tom> = {
  ativa: "verde",
  concluida: "azul",
  cancelada: "vermelho",
  trancada: "ouro",
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

/** Tom da pílula de variação do score — sobe é bom, desce é ruim, empate é
 *  neutro. Mesmo mapa de `/mentoria/[id]/page.tsx`, não exportado de lá. */
const TOM_VARIACAO: Record<"▲" | "▼" | "▬", Tom> = {
  "▲": "verde",
  "▼": "vermelho",
  "▬": "cinza",
};

/** Cor do prazo de uma tarefa pelo TOM dela (`tomDoPrazo`, `./textos.ts`) —
 *  vencido em vermelho, próximo em dourado, o resto neutro (regra 4 do
 *  enunciado). "sem prazo" também é neutro: ausência não é urgência. */
const COR_TOM_PRAZO: Record<ReturnType<typeof tomDoPrazo>, string> = {
  vencido: "text-negativo",
  proximo: "text-ouro",
  neutro: "text-texto-2",
  "sem prazo": "text-texto-3",
};

/**
 * Estado 2 — conectou, mas quem está logado não tem portal (regra 4 de
 * `lerPortal`). Mesma regra de `/sem-acesso`: tom acolhedor, um caminho de
 * volta, e NUNCA o nome de um papel nem uma lista do que existe do outro
 * lado — só que, ao contrário de `/sem-acesso`, isto não é uma pessoa
 * barrada por permissão: é uma conta que ainda não foi ligada a um
 * acompanhamento.
 *
 * BAIXO 6 da auditoria — o botão apontava para `/portal`: a PRÓPRIA tela.
 * Quem caía aqui clicava em "voltar" e caía de novo no mesmo lugar vazio —
 * um laço de um clique só, não um caminho de saída de verdade. A troca é
 * pela mesma solução de `/sem-acesso` (`src/app/sem-acesso/page.tsx`): um
 * formulário "Sair" com a Server Action `sair` (`@/lib/actions`) — é
 * sempre a saída certa para quem está no lugar errado, porque não exige
 * saber para qual papel mandar a pessoa de volta — mais um link para `/`,
 * que deixa a raiz decidir a rota certa (`decidirAcessoSupabase`, em
 * `src/lib/portao.ts`, já sabe mandar cada papel para o lugar certo a
 * partir dali).
 */
function PortalAindaNaoLigado() {
  return (
    <Card>
      <h1 className="font-display text-[20px] font-fino tracking-tight text-texto">
        Ainda não há nada por aqui
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-texto-2">
        Esta página mostra a jornada de quem está em acompanhamento — programa, sessões, tarefas e
        evolução. Sua conta ainda não está vinculada a esse acompanhamento, então não há nada para
        exibir agora.
      </p>
      <Link
        href="/"
        className="trans toque mt-5 inline-block rounded-full bg-primaria px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-primaria-2"
      >
        Voltar para o início
      </Link>
      <form action={sair} className="mt-3">
        <Botao tipo="fantasma" className="w-full">
          Sair
        </Botao>
      </form>
      <p className="mt-5 text-xs text-texto-3">
        Se isso não for esperado, fale com quem administra o sistema.
      </p>
    </Card>
  );
}

export default async function Portal({ searchParams }: { searchParams: { erro?: string } }) {
  // borda: "agora" nasce aqui, uma vez, e desce como string para tudo que
  // precisar dele — leitura, próxima sessão, dias até ela, tom de prazo.
  const agoraIso = new Date().toISOString();
  const portal = await lerPortal(agoraIso);

  // Estado 1: sem Supabase configurado, ou a leitura falhou — um Card curto
  // com o `motivo` que `lerPortal` já preparou, sem número nenhum.
  if (!portal.conectado) {
    return (
      <Card>
        <p className="text-sm text-texto-2">{portal.motivo}</p>
      </Card>
    );
  }

  // Estado 2 — ver o comentário de `PortalAindaNaoLigado` acima.
  // `!portal.mentorado` é redundante em teoria (regra 4 de `lerPortal`
  // garante os dois juntos) mas está aqui de propósito: é o que deixa o
  // TypeScript estreitar `portal.mentorado` para não-nulo daqui em diante,
  // sem um `!` de aposta.
  if (!portal.ehMentorado || !portal.mentorado) {
    return <PortalAindaNaoLigado />;
  }

  const { mentorado } = portal;
  const primeiroNome = saudacao(mentorado.nome);
  const programa = programaAtual(portal.matriculas);
  const variacao = portal.scores.length >= 2 ? variacaoScore(portal.scores) : null;
  const ultimoScore = portal.scores.length > 0 ? portal.scores[portal.scores.length - 1] : null;

  // MÉDIO 5 da auditoria — `searchParams.erro` NUNCA é renderizado direto.
  // Antes desta correção, o texto cru da URL aparecia dentro do banner
  // oficial do produto: qualquer link `?erro=<texto de ataque>` virava um
  // "aviso do sistema" para quem clicasse. `mensagemDeErro` (`./textos.ts`)
  // é a ÚNICA tradução permitida: `?erro=` carrega um CÓDIGO curto (ver
  // `acoes-portal.ts`, `CODIGO_ERRO_TAREFA`), nunca uma frase.
  const mensagemErro = mensagemDeErro(searchParams.erro);

  return (
    <>
      <PageHeader
        titulo={primeiroNome ? `Olá, ${primeiroNome}` : "Olá"}
        sub={programa ? `Programa ${programa}` : undefined}
      />

      {/* Erro de `concluirTarefa`/`reabrirTarefa` (validação ou banco) volta
          aqui, em `?erro=` — mensagem já humana, sem detalhe técnico (ver
          `acoes-portal.ts`). Mesmo estilo visual do banner de erro da ficha
          do mentorado. */}
      {mensagemErro ? (
        <p className="mb-4 rounded-xl border border-negativo/40 bg-negativo/10 px-4 py-3 text-sm text-negativo">
          {mensagemErro}
        </p>
      ) : null}

      <div className="space-y-4">
        {/* 2) O progresso — um bloco por matrícula. */}
        <Card titulo="Progresso">
          {portal.matriculas.length ? (
            <ul className="space-y-4">
              {portal.matriculas.map(({ matricula, programa: prog, progresso }) => (
                <li key={matricula.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{prog?.nome ?? "—"}</span>
                    <Badge tom={TOM_STATUS_MATRICULA[matricula.status]}>
                      {LABEL_STATUS_MATRICULA[matricula.status]}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-texto-2">{progresso.rotulo}</p>
                  {progresso.percentual !== null ? (
                    <div className="mt-1.5">
                      <ProgressBar pct={progresso.percentual} />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <Vazio>Nenhuma matrícula por aqui no momento.</Vazio>
          )}
        </Card>

        {/* 3) A próxima sessão, em destaque. */}
        <Card titulo="Próxima sessão">
          {portal.proxima ? (
            <div>
              <p className="font-display text-2xl font-fino leading-tight tracking-tight text-texto">
                {dataHoraPorExtenso(portal.proxima.quando) || "Data a confirmar"}
              </p>
              {diasAte(portal.proxima.quando, agoraIso) ? (
                <Badge tom="violeta">
                  <span className="capitalize">{diasAte(portal.proxima.quando, agoraIso)}</span>
                </Badge>
              ) : null}
            </div>
          ) : (
            <Vazio>
              Nenhuma sessão marcada no momento. Assim que uma nova sessão for combinada, ela aparece
              aqui.
            </Vazio>
          )}
        </Card>

        {/* 4) Tarefas — em aberto primeiro (já é a ordem de `portal.tarefas`). */}
        <Card titulo="Tarefas">
          {portal.tarefas.length ? (
            <ul className="space-y-2">
              {portal.tarefas.map((tarefa) => {
                const tom = tomDoPrazo(tarefa.prazo, agoraIso);
                const prazoBr = tarefa.prazo ? dataBr(tarefa.prazo) : "";
                return (
                  <li
                    key={tarefa.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-borda-sutil bg-poco px-3 py-2.5"
                  >
                    <div>
                      <p className={cx("text-sm", tarefa.concluida && "text-texto-3 line-through")}>
                        {tarefa.titulo}
                      </p>
                      {prazoBr ? (
                        <p className={cx("mt-0.5 text-xs", COR_TOM_PRAZO[tom])}>{prazoBr}</p>
                      ) : null}
                    </div>
                    <form action={tarefa.concluida ? reabrirTarefa : concluirTarefa}>
                      <input type="hidden" name="tarefaId" value={tarefa.id} />
                      <Botao tipo="fantasma" className="shrink-0">
                        {tarefa.concluida ? "Reabrir" : "Concluir"}
                      </Botao>
                    </form>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Vazio>Nenhuma tarefa combinada por aqui, por enquanto.</Vazio>
          )}
        </Card>

        {/* 5) Evolução — variação só com 2+ pontos; com 1, só o último valor; com 0, nada de número. */}
        <Card titulo="Evolução">
          {variacao ? (
            <p className="flex items-center gap-2">
              <Badge tom={TOM_VARIACAO[variacao.glifo]}>{variacao.texto}</Badge>
              <span className="text-xs text-texto-2">desde o começo do acompanhamento</span>
            </p>
          ) : ultimoScore ? (
            <div>
              <p className="font-display text-2xl font-fino leading-tight tracking-tight text-texto">
                {ultimoScore.score}
              </p>
              <p className="mt-1 text-xs text-texto-2">Última medição registrada</p>
            </div>
          ) : (
            <Vazio>Ainda não há histórico de evolução por aqui.</Vazio>
          )}
        </Card>

        {/* 6) Marcos conquistados e conteúdos liberados. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Card titulo="Marcos conquistados">
            {portal.marcos.length ? (
              <ul className="space-y-2 text-sm">
                {portal.marcos.map((marco) => (
                  <li key={marco.id}>
                    <span className="font-medium">{marco.titulo}</span>
                    {marco.descricao ? <p className="text-xs text-texto-2">{marco.descricao}</p> : null}
                    {dataBr(marco.conquistadoEm) ? (
                      <p className="text-xs text-texto-3">{dataBr(marco.conquistadoEm)}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <Vazio>Nenhum marco conquistado ainda.</Vazio>
            )}
          </Card>

          <Card titulo="Conteúdos liberados">
            {portal.conteudos.length ? (
              <ul className="space-y-2 text-sm">
                {portal.conteudos.map((conteudo) => {
                  // Só vira link clicável quando a url é http(s) absoluta —
                  // reaproveita `linkGravacaoValido` (validacao.ts), a MESMA
                  // checagem da escrita, em vez de reescrever a regra aqui.
                  const urlValida = conteudo.url.trim() !== "" && linkGravacaoValido(conteudo.url);
                  return (
                    <li key={conteudo.id}>
                      {urlValida ? (
                        <a
                          href={conteudo.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primaria-2 hover:underline"
                        >
                          {conteudo.titulo}
                        </a>
                      ) : (
                        <span>{conteudo.titulo}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Vazio>Nenhum conteúdo liberado ainda.</Vazio>
            )}
          </Card>
        </div>

        {/* 7) Histórico de sessões, ao final, enxuto. */}
        <Card titulo="Histórico de sessões">
          {portal.sessoes.length ? (
            <ul className="space-y-2.5 text-sm">
              {portal.sessoes.map((sessao) => (
                <li
                  key={sessao.id}
                  className="border-b border-borda-sutil pb-2.5 last:border-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">
                      {sessao.numero !== null ? `Sessão ${sessao.numero}` : "Sessão"} ·{" "}
                      {dataHoraBr(sessao.quando) || "data não informada"}
                    </span>
                    <Badge tom={TOM_STATUS_SESSAO[sessao.status]}>
                      {LABEL_STATUS_SESSAO[sessao.status]}
                    </Badge>
                  </div>
                  {sessao.resumo ? <p className="mt-1 text-xs text-texto-2">{sessao.resumo}</p> : null}
                </li>
              ))}
            </ul>
          ) : (
            <Vazio>Nenhuma sessão registrada ainda.</Vazio>
          )}
        </Card>
      </div>
    </>
  );
}
