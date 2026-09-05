// A parte PURA de apresentação do Portal do Mentorado — recebe o `Portal`
// (contrato de `src/lib/mentoria/portal.ts`) já resolvido e o `agoraIso` da
// borda da rota, e só desenha. `page.tsx` é quem busca o dado (`lerPortal`)
// e chama este componente; nenhuma consulta, nenhum `new Date()`, nenhum
// `"use client"` aqui — mesma disciplina de `textos.ts` (módulo puro),
// só que para JSX.
//
// Por que isto foi extraído de `page.tsx`: além de deixar a árvore de
// renderização testável sem depender de `lerPortal` (o teste de `page.tsx`
// já mocka `lerPortal` e continua funcionando, sem mudar nada), é o que
// permite uma segunda tela — uma prévia visual com dado fixo para quem não
// tem Supabase configurado ainda ver a tela pronta — reaproveitar EXATAMENTE
// este componente, em vez de duplicar a marcação.

import Link from "next/link";
import { Badge, Botao, Card, PageHeader, ProgressBar, Vazio, cx, type Tom } from "@/components/ui";
import { sair } from "@/lib/actions";
import { concluirTarefa, reabrirTarefa } from "@/lib/mentoria/acoes-portal";
import { enviarMensagemDoPortal } from "@/lib/mentoria/acoes-mensagem-form";
import type { MeuFeed } from "@/lib/feed/dados";
import type { MeuOnboarding } from "@/lib/onboarding/dados";
import type { Portal } from "@/lib/mentoria/portal";
import { visibilidadeDoTipo } from "@/lib/mentoria/historico";
import { AvisosDoPortal } from "./avisos";
import { PrimeirosPassos } from "./primeiros-passos";
import type { StatusMatricula, StatusSessao } from "@/lib/mentoria/tipos";
import { linkGravacaoValido } from "@/lib/mentoria/validacao";
import { dataBr, dataHoraBr, variacaoScore } from "../mentoria/textos";
import {
  ABRIR_TRANSCRICAO,
  TITULO_LINHA_TEMPO,
  VAZIO_LINHA_TEMPO,
  VER_GRAVACAO,
  dataHoraPorExtenso,
  diasAte,
  mensagemDeErro,
  programaAtual,
  saudacao,
  tomDoPrazo,
} from "./textos";

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

/**
 * A jornada do mentorado, em ordem.
 *
 * A lista já vem projetada por `projetarParaPortal` (Tarefa 19) — esta tela
 * NÃO filtra, não classifica e não decide o que é público. Se filtrasse aqui
 * também, haveria duas regras de visibilidade no sistema, e a segunda seria a
 * que ninguém lembra de atualizar. O portão é um só, e fica na leitura.
 *
 * A chave usa o índice porque `FatoHistorico` não tem id: dois fatos podem ser
 * idênticos em tudo (duas tarefas concluídas no mesmo instante), e dentro de
 * um render estático o índice é o único desempate honesto. Mesmo raciocínio já
 * registrado em `atividadesDoHistorico`, na ficha do time.
 */
function LinhaDoTempo({ fatos }: { fatos: Portal["linhaTempo"] }) {
  // Defesa final da visão: a leitura já projeta o portal, mas um objeto
  // montado por outra camada nunca deve conseguir renderizar conteúdo privado.
  const fatosPublicos = fatos.filter(
    (fato) => fato.visibilidade === "publico" && visibilidadeDoTipo(fato.tipo) === "publico",
  );
  if (!fatosPublicos.length) return <Vazio>{VAZIO_LINHA_TEMPO}</Vazio>;

    return (
      <ol className="relative space-y-3 border-l border-borda pl-5">
      {fatosPublicos.map((fato, indice) => (
        <li key={`${indice}-${fato.tipo}`} className="relative">
          <span
            aria-hidden
            className="absolute -left-[27px] top-1 flex h-5 w-5 items-center justify-center rounded-full border border-borda bg-painel text-[10px] text-texto-3"
          >
            ·
          </span>
          <p className="text-sm">
            <span className="font-medium">{fato.titulo}</span>
          </p>
          {fato.detalhe ? <p className="mt-0.5 text-xs text-texto-2">{fato.detalhe}</p> : null}
          {/* Data inválida não vira data inventada: some a linha, fica o fato. */}
          {dataBr(fato.quando) ? (
            <p className="mt-0.5 text-xs text-texto-3">{dataBr(fato.quando)}</p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/**
 * A gravação e a transcrição de UMA sessão, no portal.
 *
 * ESTA TELA NÃO CONSULTA FLAG NENHUMA, e é o ponto inteiro do desenho. A
 * leitura vem de `sessao_do_portal` (migração 0017), que devolve `''` nesses
 * dois campos enquanto a liberação estiver desligada. Campo vazio, seção não
 * desenhada — nem o cabeçalho. Um "Transcrição" seguido de nada contaria à
 * pessoa que existe uma transcrição que ela não pode ver, o que é uma forma
 * mais lenta de vazar a mesma informação.
 *
 * Se um dia alguém puser um `if (sessao.transcricaoLiberada)` aqui, terá
 * criado a segunda régua — e a segunda régua é a que diverge.
 */
function LiberadoNaSessao({ sessao }: { sessao: Portal["sessoes"][number] }) {
  const link = sessao.linkGravacao.trim();
  // `linkGravacaoValido` é a MESMA checagem da escrita (validacao.ts), não uma
  // segunda opinião. Link torto não vira `<a href>`: o portal é a tela de um
  // cliente, e `javascript:` num href ali é um problema de outra ordem.
  const gravacao = link !== "" && linkGravacaoValido(link) ? link : "";
  const transcricao = sessao.transcricao.trim();

  if (!gravacao && !transcricao) return null;

  return (
    <div className="mt-2 space-y-2">
      {gravacao ? (
        <a
          href={gravacao}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-xs text-primaria-2 hover:underline"
        >
          {VER_GRAVACAO}
        </a>
      ) : null}
      {transcricao ? (
        // Fechado por padrão: transcrição é texto longo, e a pessoa abre a
        // página para ver a própria evolução, não para ler uma call inteira.
        <details className="rounded-lg border border-borda-sutil bg-poco px-3 py-2">
          <summary className="trans list-none cursor-pointer text-xs font-medium text-primaria-2 [&::-webkit-details-marker]:hidden">
            {ABRIR_TRANSCRICAO}
          </summary>
          <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-texto-2">{transcricao}</p>
        </details>
      ) : null}
    </div>
  );
}

export function PortalVisao({
  portal,
  agoraIso,
  erro,
  feed,
  onboarding,
}: {
  portal: Portal;
  agoraIso: string;
  erro?: string;
  /** Os avisos (tarefa 36). OPCIONAL de propósito: a prévia visual e os
   *  testes antigos montam esta tela só com `portal`, e um card a mais não
   *  pode obrigar todos eles a inventar um feed. Ausente, o card não
   *  aparece — que é o mesmo comportamento de "não sou mentorado". */
  feed?: MeuFeed;
  /** O roteiro de entrada (tarefa 40). Opcional pelo mesmo motivo de `feed`:
   *  a prévia visual e os testes antigos montam esta tela só com `portal`. */
  onboarding?: MeuOnboarding;
}) {
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
  const matriculaAtual = portal.matriculas.find(({ matricula }) => matricula.status === "ativa") ?? portal.matriculas[0] ?? null;
  const programa = matriculaAtual?.programa?.nome ?? programaAtual(portal.matriculas);
  const variacao = portal.scores.length >= 2 ? variacaoScore(portal.scores) : null;
  const ultimoScore = portal.scores.length > 0 ? portal.scores[portal.scores.length - 1] : null;
  // Compatibilidade temporária com as prévias antigas: o contrato atual
  // sempre entrega os dois campos, mas uma prévia gravada antes da T-088 não
  // pode derrubar a tela enquanto é atualizada.
  const mensagens = portal.mensagens ?? [];
  const contratos = portal.contratos ?? [];

  // MÉDIO 5 da auditoria — `erro` NUNCA é renderizado direto. Antes desta
  // correção, o texto cru da URL aparecia dentro do banner oficial do
  // produto: qualquer link `?erro=<texto de ataque>` virava um "aviso do
  // sistema" para quem clicasse. `mensagemDeErro` (`./textos.ts`) é a ÚNICA
  // tradução permitida: `?erro=` carrega um CÓDIGO curto (ver
  // `acoes-portal.ts`, `CODIGO_ERRO_TAREFA`), nunca uma frase.
  const mensagemErro = mensagemDeErro(erro);

  return (
    <div data-portal-visual="referencia-aprovada">
      <PageHeader
        titulo={primeiroNome ? `Olá, ${primeiroNome}` : "Olá"}
        sub={programa ? `Programa ${programa}` : undefined}
      >
        {matriculaAtual ? (
          <Badge tom={TOM_STATUS_MATRICULA[matriculaAtual.matricula.status]}>
            Matrícula {LABEL_STATUS_MATRICULA[matriculaAtual.matricula.status].toLocaleLowerCase("pt-BR")}
          </Badge>
        ) : null}
      </PageHeader>

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
        {/* 1) Os avisos, primeiro: é o que MUDOU desde a última visita, e a
            razão mais comum de a pessoa abrir o portal num dia qualquer. O
            card decide sozinho se aparece — ver `./avisos.tsx`. */}
        {feed ? <AvisosDoPortal feed={feed} /> : null}

        {/* Logo depois dos avisos, e antes do progresso: para quem acabou de
            entrar, o roteiro de entrada é a tela inteira. O card some sozinho
            quando não há etapa ativa — ver `./primeiros-passos.tsx`. */}
        {onboarding ? <PrimeirosPassos onboarding={onboarding} /> : null}

        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">

        {/* 2) O progresso — um bloco por matrícula. */}
        <Card titulo="Seu progresso" className="xl:col-start-1 xl:row-start-1">
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

        <Card titulo="Sua jornada" className="xl:col-start-2 xl:row-start-1">
          {matriculaAtual ? (
            <>
              <p className="text-sm font-medium text-texto">{programa ? `Programa ${programa}` : "Programa sem nome informado"}</p>
              <p className="mt-3 text-xs leading-relaxed text-texto-2">Pergunta para reflexão</p>
              <p className="mt-2 rounded-xl border border-primaria/35 bg-primaria/5 px-3 py-3 text-sm leading-relaxed text-texto">O que você percebe hoje que ainda não conseguia enxergar no começo desta jornada?</p>
              <p className="mt-3 text-xs leading-relaxed text-texto-3">Seu mentor faz perguntas; você constrói o próprio caminho.</p>
            </>
          ) : (
            <Vazio>Nenhuma jornada vinculada à sua conta no momento.</Vazio>
          )}
        </Card>

        {/* 3) A próxima sessão, em destaque. */}
        <Card titulo="Próxima sessão" className="xl:col-start-1 xl:row-start-2">
          {portal.proxima ? (
            <div>
              <p className="font-display text-2xl font-fino leading-tight tracking-tight text-texto">
                {dataHoraPorExtenso(portal.proxima.quando) || "Data a confirmar"}
              </p>
              {diasAte(portal.proxima.quando, agoraIso) ? (
                <Badge tom="violeta">
                  {/* `diasAte` devolve minúsculo ("em 3 dias") de propósito — é
                      frase, não título. `capitalize` (CSS) maiuscula CADA
                      PALAVRA, o que em português vira "Em 3 Dias": só a
                      primeira letra de uma frase é maiúscula. `first-letter:`
                      resolve isso sem pedir que `diasAte` devolva o texto já
                      capitalizado (o teste de `diasAte` continua verde). */}
                  <span className="first-letter:uppercase">
                    {diasAte(portal.proxima.quando, agoraIso)}
                  </span>
                </Badge>
              ) : null}
              <a href="#tarefas-da-semana" className="mt-4 inline-flex rounded-full border border-borda px-4 py-2 text-sm text-primaria-2 hover:border-primaria/60">
                Ver preparação
              </a>
            </div>
          ) : (
            <Vazio>
              Nenhuma sessão marcada no momento. Assim que uma nova sessão for combinada, ela aparece
              aqui.
            </Vazio>
          )}
        </Card>

        {/* Evolução fica ao lado da próxima sessão também na ordem de leitura. */}
        <Card titulo="Evolução" className="xl:col-start-2 xl:row-start-2">
          {variacao ? (
            <p className="flex items-center gap-2">
              <Badge tom={TOM_VARIACAO[variacao.glifo]}>{variacao.texto}</Badge>
              <span className="text-xs text-texto-2">desde o começo do acompanhamento</span>
            </p>
          ) : ultimoScore ? (
            <div>
              <p className="font-display text-2xl font-fino leading-tight tracking-tight text-texto">{ultimoScore.score}</p>
              <p className="mt-1 text-xs text-texto-2">Última medição registrada</p>
            </div>
          ) : (
            <Vazio>Ainda não há histórico de evolução por aqui.</Vazio>
          )}
        </Card>

        {/* 4) Tarefas — em aberto primeiro (já é a ordem de `portal.tarefas`). */}
        <Card titulo="Tarefas desta semana" className="xl:col-start-1 xl:row-start-3">
          <span id="tarefas-da-semana" className="sr-only">Tarefas desta semana</span>
          {portal.tarefas.length ? (
            <ul className="space-y-2">
              {portal.tarefas.map((tarefa) => {
                const tom = tomDoPrazo(tarefa.prazo, agoraIso, tarefa.concluida);
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
                        <p className={cx("mt-0.5 text-xs", COR_TOM_PRAZO[tom])}>
                          {tom === "vencido" ? "Meta vencida · " : ""}
                          {prazoBr}
                        </p>
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

        <Card titulo="Conversa com seu mentor" className="xl:col-start-2 xl:row-start-3">
          {mensagens.length ? (
            <ul className="space-y-2">
              {mensagens.map((mensagem) => (
                <li key={mensagem.id} className="rounded-lg border border-borda-sutil bg-poco px-3 py-2.5 text-sm">
                  <p className="text-xs font-medium text-texto-2">
                    {mensagem.direcao === "gestao_para_mentorado" ? "Seu mentor" : "Você"}
                    {dataHoraBr(mensagem.criadoEm) ? ` · ${dataHoraBr(mensagem.criadoEm)}` : ""}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-texto">{mensagem.texto}</p>
                </li>
              ))}
            </ul>
          ) : (
            <Vazio>Ainda não há mensagens nesta conversa.</Vazio>
          )}
          <form action={enviarMensagemDoPortal} className="mt-3 space-y-2 border-t border-borda-sutil pt-3">
            <label className="block text-sm font-medium" htmlFor="mensagem-portal">
              Compartilhe sua reflexão
            </label>
            <textarea
              id="mensagem-portal"
              name="texto"
              required
              maxLength={4000}
              rows={3}
              className="w-full rounded-lg border border-borda bg-poco px-3 py-2 text-sm text-texto"
              placeholder="Escreva o que percebeu ou uma pergunta para sua próxima sessão."
            />
            <Botao tipo="fantasma">Enviar mensagem</Botao>
          </form>
        </Card>

        <Card titulo="Contratos liberados" className="xl:col-span-2 xl:row-start-4">
          {contratos.length ? (
            <ul className="space-y-2 text-sm">
              {contratos.map((contrato) => (
                <li key={contrato.id} className="rounded-lg border border-borda-sutil bg-poco px-3 py-2.5">
                  <p className="font-medium">
                    {contrato.status === "assinado" ? "Contrato assinado" : "Contrato"}
                  </p>
                  <p className="mt-0.5 text-xs text-texto-2">
                    {contrato.assinadoEm ? `Assinado em ${dataBr(contrato.assinadoEm)}` : "Data de assinatura não informada"}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <Vazio>Nenhum contrato foi liberado para consulta no portal.</Vazio>
          )}
        </Card>

        {/* 5b) A jornada. Vem pronta da leitura, já projetada — ver `LinhaDoTempo`. */}
        <Card titulo={TITULO_LINHA_TEMPO} className="xl:col-span-2 xl:row-start-5">
          <LinhaDoTempo fatos={portal.linhaTempo} />
        </Card>

        {/* 6) Marcos conquistados e conteúdos liberados. */}
        <div className="grid gap-4 sm:grid-cols-2 xl:col-span-2 xl:row-start-6">
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
        <Card titulo="Histórico de sessões" className="xl:col-span-2 xl:row-start-7">
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
                  <LiberadoNaSessao sessao={sessao} />
                </li>
              ))}
            </ul>
          ) : (
            <Vazio>Nenhuma sessão registrada ainda.</Vazio>
          )}
        </Card>
        </div>
      </div>
    </div>
  );
}
