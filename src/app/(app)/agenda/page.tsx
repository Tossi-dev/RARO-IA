// Agenda — as reuniões do dono, em dia, semana e mês.
//
// Server component: a leitura do calendário acontece no servidor, então o
// endereço secreto do iCal nunca chega ao navegador. Esta página NÃO calcula
// datas na mão: toda a matemática de janela e agrupamento mora em
// src/lib/agenda.ts, e a leitura do arquivo em src/lib/integracoes/ics.ts.

import { CalendarClock, ChevronLeft, ChevronRight, MapPin, Repeat } from "lucide-react";
import Link from "next/link";
import { Badge, Card, PageHeader, Vazio, cx } from "@/components/ui";
import {
  agruparPorDia,
  faixaHoraria,
  hojeISO,
  isoValido,
  janelaAgenda,
  mesDoISO,
  numeroDoDia,
  rotuloDiaCurto,
  VISAO_LABEL,
  visaoValida,
  type VisaoAgenda,
} from "@/lib/agenda";
import { desconectarGoogleAgenda } from "@/lib/actions";
import { agendaConfigurada, lerAgenda } from "@/lib/integracoes/calendar";
import {
  googleAppConfigurado,
  googleConectado,
  lerAgendaGoogle,
} from "@/lib/integracoes/google-agenda";
import type { EventoAgenda } from "@/lib/integracoes/ics";
import { contaUatSinteticaAtual } from "@/lib/uat/isolamento";

export const dynamic = "force-dynamic";

const VISOES: VisaoAgenda[] = ["dia", "semana", "mes"];

function href(v: VisaoAgenda, d: string) {
  return `/agenda?v=${v}&d=${d}`;
}

/** O bloco de um compromisso. Uma cor só, hora grande, título grande. */
function Compromisso({ e, compacto = false }: { e: EventoAgenda; compacto?: boolean }) {
  if (compacto) {
    return (
      // Duas linhas, e não `truncate`: "Carlos And…" não diz com quem é a
      // reunião. A borda fica só à esquerda, como no Google Agenda — é o que
      // deixa a coluna do dia legível com quatro compromissos empilhados.
      <div
        data-agenda-event="true"
        className={cx(
          "trans rounded-r-md border-l-2 py-1 pl-2 pr-1 text-[11px] leading-tight",
          e.cancelado
            ? "border-negativo/60 bg-negativo/10 text-texto-3 line-through"
            : "border-primaria bg-primaria/10 text-texto-2"
        )}
        title={`${faixaHoraria(e)} · ${e.titulo}`}
      >
        {!e.diaInteiro && (
          <span className="mr-1 tabular-nums text-texto-3">{faixaHoraria(e).slice(0, 5)}</span>
        )}
        <span className="line-clamp-2">{e.titulo}</span>
      </div>
    );
  }

  return (
    <div
      data-agenda-event="true"
      className={cx(
        "trans flex gap-4 rounded-[22px] border border-borda-sutil bg-poco/70 p-4 transition-colors hover:border-primaria/45",
        e.cancelado && "opacity-60"
      )}
    >
      <div className="w-[86px] shrink-0 border-r border-borda-sutil pr-4">
        <p className="font-display text-lg font-fino tabular-nums leading-tight">
          {e.diaInteiro ? "—" : faixaHoraria(e).slice(0, 5)}
        </p>
        <p className="mt-0.5 text-[11px] text-texto-3">
          {e.diaInteiro ? "dia inteiro" : `até ${faixaHoraria(e).slice(-5)}`}
        </p>
      </div>
      <div className="min-w-0 flex-1">
        <p className={cx("text-[15px] leading-snug", e.cancelado && "line-through text-texto-3")}>
          {e.titulo}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-texto-3">
          {e.local && (
            <span className="inline-flex items-center gap-1">
              <MapPin size={12} aria-hidden strokeWidth={1.5} />
              {e.local}
            </span>
          )}
          {e.repetido && (
            <span className="inline-flex items-center gap-1">
              <Repeat size={12} aria-hidden strokeWidth={1.5} />
              repete
            </span>
          )}
          {e.cancelado && <Badge tom="vermelho">Cancelado</Badge>}
        </div>
        {e.descricao && (
          <p className="kpi-conta mt-2 line-clamp-2 text-xs leading-snug text-texto-2">
            {e.descricao}
          </p>
        )}
      </div>
    </div>
  );
}

const ERROS: Record<string, string> = {
  "sem-credenciais":
    "O login com o Google ainda não foi habilitado nesta instalação: faltam as credenciais do app.",
  recusado: "Você cancelou na tela do Google. Nada foi conectado.",
  estado: "A volta do Google não bateu com o pedido. Tente entrar de novo.",
  token:
    "O Google aceitou o login mas recusou a troca de credenciais. Quase sempre é a URL de retorno cadastrada no Google Cloud diferente da URL do site.",
};

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: { v?: string; d?: string; erro?: string; conectado?: string; desconectado?: string };
}) {
  const visao = visaoValida(searchParams.v);
  const ref = isoValido(searchParams.d);
  const hoje = hojeISO();
  const janela = janelaAgenda(visao, ref);
  const uatSintetico = await contaUatSinteticaAtual();

  // Duas portas para a mesma agenda. O login do Google manda quando existe:
  // ele desdobra as repetições do lado do Google e não depende de ninguém
  // copiar URL nenhuma. O iCal continua valendo como alternativa.
  const viaGoogle = !uatSintetico && googleConectado();
  const viaIcs = !uatSintetico && agendaConfigurada();
  const conectada = viaGoogle || viaIcs;

  const leituraGoogle = viaGoogle ? await lerAgendaGoogle(janela.de, janela.ate) : null;
  const leitura = !viaGoogle && viaIcs ? await lerAgenda(janela.de, janela.ate) : null;

  const eventos = viaGoogle ? (leituraGoogle?.eventos ?? []) : (leitura?.dados?.eventos ?? []);
  const erroLeitura = viaGoogle ? leituraGoogle?.erro : leitura?.erro;
  const fonteNome = viaGoogle ? "conta Google conectada" : leitura?.dados?.nome || "arquivo iCal";
  const porDia = agruparPorDia(eventos, janela.dias);
  const total = eventos.length;

  const navegacao = (
    <div data-agenda-workspace="true" className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 rounded-full border border-borda-sutil bg-poco p-0.5">
        {VISOES.map((v) => (
          <Link
            key={v}
            href={href(v, ref)}
            data-ativo={v === visao ? "true" : "false"}
            className={cx(
              "pilula rounded-full px-3.5 py-1.5 text-xs font-medium",
              v === visao ? "" : "text-texto-3 hover:text-texto-2"
            )}
          >
            {VISAO_LABEL[v]}
          </Link>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <Link
          href={href(visao, janela.anterior)}
          aria-label="Período anterior"
          className="trans flex h-8 w-8 items-center justify-center rounded-full border border-borda-sutil bg-poco text-texto-2 transition-colors hover:border-borda hover:text-texto"
        >
          <ChevronLeft size={16} aria-hidden strokeWidth={1.5} />
        </Link>
        <Link
          href={href(visao, hoje)}
          className="trans rounded-full border border-borda-sutil bg-poco px-3.5 py-1.5 text-xs text-texto-2 transition-colors hover:border-borda hover:text-texto"
        >
          Hoje
        </Link>
        <Link
          href={href(visao, janela.proximo)}
          aria-label="Próximo período"
          className="trans flex h-8 w-8 items-center justify-center rounded-full border border-borda-sutil bg-poco text-texto-2 transition-colors hover:border-borda hover:text-texto"
        >
          <ChevronRight size={16} aria-hidden strokeWidth={1.5} />
        </Link>
      </div>
    </div>
  );

  // ------------------------------------------------- agenda não conectada
  if (!conectada || erroLeitura) {
    const erroUrl = searchParams.erro ? ERROS[searchParams.erro] : null;
    return (
      <>
        <PageHeader titulo="Agenda" sub="Reuniões do Google Agenda, em dia, semana e mês" />

        {searchParams.desconectado ? (
          <p className="mb-4 rounded-xl border border-borda bg-poco px-4 py-3 text-sm text-texto-2">
            Conta Google desconectada. O sistema nao le mais a sua agenda a partir deste navegador.
            Para tirar tambem a permissao do lado do Google, entre em{" "}
            <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noreferrer"
              className="text-texto underline underline-offset-2"
            >
              Apps com acesso a conta
            </a>
            .
          </p>
        ) : null}

        {googleAppConfigurado() && (
          <Card className="mb-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="font-display text-[17px] font-normal tracking-tight">
                  Entrar com a conta Google
                </p>
                {/* Esta frase é o CONSENTIMENTO: ela é lida logo antes do
                    clique que abre a tela do Google, e a tela do Google vai
                    pedir permissão de criar, editar e apagar evento. A versão
                    anterior deste parágrafo negava qualquer capacidade de
                    escrita — texto que virou mentira no dia em que
                    `google-agenda-escrita.ts` nasceu, e que por isso não fica
                    aqui nem entre aspas (mesma regra do cabeçalho de
                    `google-agenda.ts`). Um texto de tela que descreve errado
                    a permissão pedida não informa: ele desinforma, e
                    consentimento desinformado não é consentimento. O limite
                    prometido no fim (só o evento das sessões) não é boa
                    vontade — `atualizarEventoDaSessao` e
                    `cancelarEventoDaSessao` conferem a marca de origem do
                    evento antes de escrever, e recusam evento que não foi
                    criado por aqui. */}
                <p className="mt-1 text-sm leading-relaxed text-texto-2">
                  Um clique, você escolhe a conta e pronto. A permissão pedida cobre{" "}
                  <span className="text-texto">leitura e escrita de eventos</span>: além de ler a
                  agenda, o sistema pode criar, atualizar e cancelar o evento das sessões de
                  mentoria que você mandar sincronizar — e só esses, porque ele confere a marca de
                  origem antes de tocar em qualquer compromisso.
                </p>
              </div>
              <a
                href="/api/agenda/google/entrar"
                className="trans bevel inline-flex shrink-0 items-center gap-2 rounded-full bg-gradient-to-b from-primaria-2 via-primaria to-primaria-press px-5 py-2.5 text-sm font-medium text-white shadow-[0_6px_18px_-6px_rgb(var(--primaria)/0.65)] transition-all hover:brightness-110"
              >
                Conectar com o Google
              </a>
            </div>
          </Card>
        )}

        <Card titulo={googleAppConfigurado() ? "Ou conectar por endereço iCal" : "Conectar a agenda"}>
          {erroUrl ? (
            <p className="mb-4 rounded-xl border border-negativo/40 bg-negativo/10 px-4 py-3 text-sm text-negativo">
              {erroUrl}
            </p>
          ) : null}
          <p className="text-sm leading-relaxed text-texto-2">
            {erroLeitura ??
              "Alternativa sem login: o Google Agenda publica um endereço secreto que devolve a agenda inteira. São três cliques e uma variável para gravar."}
          </p>
          <ol className="mt-4 space-y-2.5 text-sm text-texto-2">
            <li>
              <span className="text-texto-3">1.</span> Abra o Google Agenda no computador e passe o
              mouse sobre o calendário na coluna da esquerda.
            </li>
            <li>
              <span className="text-texto-3">2.</span> Clique nos três pontinhos →{" "}
              <span className="text-texto">Configurações e compartilhamento</span>.
            </li>
            <li>
              <span className="text-texto-3">3.</span> Role até{" "}
              <span className="text-texto">Integrar agenda</span> e copie o{" "}
              <span className="text-texto">Endereço secreto no formato iCal</span>.
            </li>
            <li>
              <span className="text-texto-3">4.</span> Me mande avisando que copiou — eu passo o
              comando que grava o endereço. Ele é secreto: não cole em conversa, em nota nem em
              print.
            </li>
          </ol>
          {/* Frase do CARD DO iCAL, e por isso ela fala do iCal — não da
              "plataforma". O endereço secreto em iCal é um GET num arquivo
              .ics: por ele não existe escrita nem com má vontade. A versão
              anterior desta linha negava escrita em nome da plataforma
              INTEIRA — generalizava de um caminho para o produto, e o outro
              caminho (o botão do Google, logo acima) escreve. */}
          <p className="mt-4 text-xs text-texto-3">
            O endereço em iCal dá acesso só de leitura: por este caminho a plataforma não cria, não
            move e não apaga nada na sua agenda. Quem escreve é a conexão pelo botão do Google
            acima — e só no evento das sessões que você mandar sincronizar.
          </p>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        titulo="Agenda de sessões"
        sub={`${janela.rotulo} · ${total === 0 ? "nenhum compromisso" : `${total} compromisso(s)`} · mantenha a próxima conversa por perto`}
      >
        {navegacao}
      </PageHeader>

      {/* De onde os compromissos estao vindo, e como parar de traze-los.
          O par "esta conectado assim / desconectar" fica junto de proposito:
          separar os dois e o que faz alguem procurar em Configuracoes uma
          coisa que pertence a tela que ela afeta. Antes este botao existia,
          mas em 11px cinza no rodape da pagina -- ou seja, nao existia. */}
      {viaGoogle ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-borda-sutil bg-poco/70 px-4 py-3">
          {/* A negativa de escrita que ficava nesta linha saiu pelo mesmo
              motivo do card de consentimento: a conexão pelo Google passou a
              escrever. O que a frase diz agora é o que o código de fato
              garante — escrita limitada ao evento marcado como criado por
              este sistema. */}
          <p className="text-sm text-texto-2">
            Lendo da <span className="text-texto">conta Google conectada</span>. Esta conexão
            também escreve, mas só no evento das sessões que você mandar sincronizar.
          </p>
          <form action={desconectarGoogleAgenda}>
            <button
              type="submit"
              className="trans rounded-full border border-borda-sutil bg-fundo px-4 py-1.5 text-xs text-texto-2 transition-colors hover:border-negativo/60 hover:text-negativo"
            >
              Desconectar
            </button>
          </form>
        </div>
      ) : null}

      {leitura?.dados?.naoExpandidos ? (
        <p className="mb-4 rounded-xl border border-aviso/40 bg-aviso/10 px-4 py-3 text-xs text-aviso">
          {leitura.dados.naoExpandidos} evento(s) usam uma regra de repetição que este leitor ainda
          não desdobra (ex.: &quot;toda primeira segunda do mês&quot;). Eles aparecem só na data
          original. As repetições diárias, semanais, mensais e anuais estão completas.
        </p>
      ) : null}

      {/* ------------------------------------------------------------ DIA */}
      {visao === "dia" && (
        <Card titulo={`${rotuloDiaCurto(ref)}, ${numeroDoDia(ref)}`} className="overflow-hidden">
          {porDia[ref]?.length ? (
            <div className="space-y-2.5">
              {porDia[ref].map((e, i) => (
                <Compromisso key={`${e.uid}-${i}`} e={e} />
              ))}
            </div>
          ) : (
            <Vazio>Nenhum compromisso neste dia.</Vazio>
          )}
        </Card>
      )}

      {/* --------------------------------------------------------- SEMANA */}
      {visao === "semana" && (
        <div className="grid gap-3 md:grid-cols-7">
          {janela.dias.map((d) => {
            const doDia = porDia[d] ?? [];
            const eHoje = d === hoje;
            return (
              <Card
                key={d}
                className={cx("min-h-[150px] !rounded-[22px] !p-3", eHoje && "!border-primaria/60")}
              >
                <Link href={href("dia", d)} className="mb-2.5 block">
                  <p className="text-[11px] uppercase tracking-wider text-texto-3">
                    {rotuloDiaCurto(d)}
                  </p>
                  <p
                    className={cx(
                      "font-display text-xl font-fino tabular-nums leading-none",
                      eHoje && "text-primaria-2"
                    )}
                  >
                    {numeroDoDia(d)}
                  </p>
                </Link>
                {doDia.length ? (
                  <div className="space-y-1.5">
                    {doDia.map((e, i) => (
                      <Compromisso key={`${e.uid}-${i}`} e={e} compacto />
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-texto-4">livre</p>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* ------------------------------------------------------------ MÊS */}
      {visao === "mes" && (
        <Card className="overflow-hidden !p-3">
          <div className="mb-2 grid grid-cols-7 gap-1.5">
            {["dom", "seg", "ter", "qua", "qui", "sex", "sáb"].map((d) => (
              <p
                key={d}
                className="px-1 text-center text-[11px] uppercase tracking-wider text-texto-3"
              >
                {d}
              </p>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {janela.dias.map((d) => {
              const doDia = porDia[d] ?? [];
              const eHoje = d === hoje;
              // As sobras do mês vizinho ficam apagadas: a grade fecha certinho
              // sem que elas disputem atenção com o mês que está sendo visto.
              const doMes = mesDoISO(d) === mesDoISO(ref);
              return (
                <Link
                  key={d}
                  href={href("dia", d)}
                  className={cx(
                    "trans min-h-[96px] rounded-2xl border p-2 transition-colors hover:border-primaria/50",
                    eHoje ? "border-primaria/50 bg-primaria/5" : "border-borda-sutil",
                    doMes ? "bg-painel-2" : "bg-transparent opacity-45"
                  )}
                >
                  <p
                    className={cx(
                      "mb-1.5 text-right text-xs tabular-nums",
                      eHoje ? "font-medium text-primaria-2" : "text-texto-3"
                    )}
                  >
                    {numeroDoDia(d)}
                  </p>
                  <div className="space-y-1">
                    {doDia.slice(0, 3).map((e, i) => (
                      <Compromisso key={`${e.uid}-${i}`} e={e} compacto />
                    ))}
                    {doDia.length > 3 && (
                      <p className="px-1 text-[10px] text-texto-3">+{doDia.length - 3}</p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-texto-3">
        {/* O rodapé aparece nos DOIS caminhos, e os dois não têm mais a mesma
            capacidade: pelo iCal a plataforma realmente só lê; pela conta
            Google ela também escreve o evento das sessões. Uma frase única
            para os dois era verdadeira em um e falsa no outro — por isso a
            última parte é condicional. */}
        <span className="flex items-center gap-2">
          <CalendarClock size={13} aria-hidden strokeWidth={1.5} />
          Leitura direta do Google Agenda · {fonteNome} · horários no fuso de Brasília ·{" "}
          {viaGoogle
            ? "escrita limitada ao evento das sessões sincronizadas"
            : "o endereço em iCal não permite escrever nada"}
          .
        </span>
      </div>
    </>
  );
}
