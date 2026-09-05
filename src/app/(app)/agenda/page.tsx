// Agenda — as reuniões do dono, em dia, semana e mês.
//
// Server component: a leitura do calendário acontece no servidor, então o
// endereço secreto do iCal nunca chega ao navegador. Esta página NÃO calcula
// datas na mão: toda a matemática de janela e agrupamento mora em
// src/lib/agenda.ts, e a leitura do arquivo em src/lib/integracoes/ics.ts.

import { CalendarClock, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, FileText, MapPin, MessageCircle, Plus, Repeat, Target } from "lucide-react";
import Link from "next/link";
import { Badge, Card, PageHeader, Vazio, cx } from "@/components/ui";
import {
  agruparPorDia,
  chaveDia,
  faixaHoraria,
  diaDaSemana,
  hojeISO,
  isoValido,
  janelaAgenda,
  mesDoISO,
  numeroDoDia,
  partesLocais,
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

type EventoNaGrade = { evento: EventoAgenda; faixa: number; totalFaixas: number };

function distribuirEventosGrade(eventos: EventoAgenda[]): EventoNaGrade[] {
  const ordenados = [...eventos].sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  const finais: number[] = [];
  const distribuidos = ordenados.map((evento) => {
    const faixaLivre = finais.findIndex((fim) => fim <= evento.inicio.getTime());
    const faixa = faixaLivre === -1 ? finais.length : faixaLivre;
    finais[faixa] = evento.fim.getTime();
    return { evento, faixa, totalFaixas: 1 };
  });
  const totalFaixas = Math.max(1, finais.length);
  return distribuidos.map((item) => ({ ...item, totalFaixas }));
}

function CompromissoGrade({ item, horaInicial, data }: { item: EventoNaGrade; horaInicial: number; data: string }) {
  const { evento, faixa, totalFaixas } = item;
  const inicio = partesLocais(evento.inicio);
  const minutos = Math.max(30, Math.round((evento.fim.getTime() - evento.inicio.getTime()) / 60000));
  const inicioDecimal = inicio.hora + inicio.minuto / 60;
  const minutosVisiveis = Math.min(minutos, Math.max(0, (24 - inicioDecimal) * 60));
  const topo = evento.diaInteiro ? 4 : Math.max(4, ((inicio.hora + inicio.minuto / 60) - horaInicial) * 58 + 4);
  const altura = evento.diaInteiro ? 48 : Math.max(18, minutosVisiveis * 58 / 60 - 6);
  const largura = 100 / totalFaixas;
  return <article data-agenda-event="true" aria-label={`${data}, ${faixaHoraria(evento)}, ${evento.titulo}${evento.cancelado ? ", cancelado" : ""}`} title={`${faixaHoraria(evento)} · ${evento.titulo}`} className={`absolute z-10 overflow-hidden rounded-md border px-2 py-1.5 text-[11px] shadow-lg ${evento.cancelado ? "border-[#a64e58] bg-[#3a1b25] text-[#b7a0a5] line-through" : "border-[#247cff] bg-[#0b326d] text-[#dbe9ff]"}`} style={{ top: `${topo}px`, height: `${altura}px`, left: `calc(${faixa * largura}% + 4px)`, width: `calc(${largura}% - 8px)` }}><p className="font-semibold tabular-nums">{evento.diaInteiro ? "Dia inteiro" : faixaHoraria(evento).slice(0, 5)}</p><p className="mt-0.5 line-clamp-2 font-medium leading-4">{evento.titulo}</p>{!evento.diaInteiro ? <p className="mt-1 text-[10px] opacity-75">{minutos} min{minutosVisiveis < minutos ? " · continua no dia seguinte" : ""}</p> : null}</article>;
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

  if (uatSintetico) {
    return (
      <>
        <PageHeader titulo="Agenda" sub="Homologação funcional em ambiente isolado" />
        <Card titulo="Agenda isolada na homologação">
          <p className="text-sm leading-relaxed text-texto-2">
            Esta conta sintética não lê calendários externos e não oferece conexão com Google ou
            iCal. Use uma conta não sintética somente quando houver consentimento explícito para a
            integração.
          </p>
        </Card>
      </>
    );
  }

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

  const agora = new Date();
  const proximos = eventos.filter((evento) => !evento.cancelado && evento.fim.getTime() >= agora.getTime()).sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  const proximo = proximos[0] ?? null;
  const minutosReservados = eventos.filter((evento) => !evento.cancelado && !evento.diaInteiro).reduce((soma, evento) => soma + Math.max(0, Math.round((evento.fim.getTime() - evento.inicio.getTime()) / 60000)), 0);
  const conflitos = eventos.filter((evento, indice) => eventos.some((outro, outroIndice) => outroIndice > indice && !evento.cancelado && !outro.cancelado && evento.inicio < outro.fim && outro.inicio < evento.fim)).length;
  const diasUteis = janela.dias.filter((dia) => { const semana = diaDaSemana(dia); return semana >= 1 && semana <= 5; });
  const eventosFimDeSemana = janela.dias.filter((dia) => { const semana = diaDaSemana(dia); return semana === 0 || semana === 6; }).flatMap((dia) => porDia[dia] ?? []);
  const eventosDoDiaNaGrade = (dia: string) => (porDia[dia] ?? []).filter((evento) => chaveDia(evento.inicio) === dia);
  const eventosUteis = diasUteis.flatMap(eventosDoDiaNaGrade).filter((evento) => !evento.diaInteiro);
  const horaInicial = Math.max(0, Math.min(8, ...eventosUteis.map((evento) => partesLocais(evento.inicio).hora)));
  const horaFinal = Math.min(24, Math.max(18, ...eventosUteis.map((evento) => {
    const inicio = partesLocais(evento.inicio);
    const duracaoHoras = Math.max(0, evento.fim.getTime() - evento.inicio.getTime()) / 3_600_000;
    return Math.ceil(inicio.hora + inicio.minuto / 60 + duracaoHoras);
  })));
  const horasGrade = Array.from({ length: horaFinal - horaInicial + 1 }, (_, indice) => horaInicial + indice);
  const alturaGrade = (horaFinal - horaInicial) * 58;

  return (
    <div data-agenda-visual="referencia-aprovada" data-agenda-workspace="true" className="mx-auto max-w-[1420px] text-[#f4f7ff]">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center"><div><h1 className="text-[34px] font-semibold leading-tight tracking-[-0.04em]">Agenda de atendimentos</h1><p className="mt-1 text-[16px] text-[#a6afc1]">Organize suas conversas e prepare cada encontro com contexto.</p></div><Link href="/mentoria" className="inline-flex items-center justify-center gap-2 rounded-md bg-[#126df0] px-5 py-3 text-sm font-medium text-white lg:ml-auto"><Plus size={17} aria-hidden /> Nova sessão</Link></div>

      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-[10px] border border-[#29354a] bg-[#07111f]/92 px-3 py-3"><Link href={href(visao, hoje)} className="rounded-md border border-[#1769ff] px-4 py-2 text-sm font-medium text-[#3b8cff]">Hoje</Link><Link href={href(visao, janela.anterior)} aria-label="Período anterior" className="flex h-9 w-9 items-center justify-center text-[#d8dee9]"><ChevronLeft size={18} aria-hidden /></Link><p className="min-w-[190px] text-center text-[16px] font-semibold text-white">{janela.rotulo}</p><Link href={href(visao, janela.proximo)} aria-label="Próximo período" className="flex h-9 w-9 items-center justify-center text-[#d8dee9]"><ChevronRight size={18} aria-hidden /></Link><div className="ml-auto flex overflow-hidden rounded-md border border-[#29354a]">{VISOES.map((item) => <Link key={item} href={href(item, ref)} aria-current={item === visao ? "page" : undefined} data-ativo={item === visao ? "true" : "false"} className={`px-4 py-2 text-sm ${item === visao ? "bg-[#0d63ed] text-white" : "text-[#c2c8d3] hover:bg-[#0c192b]"}`}>{VISAO_LABEL[item]}</Link>)}</div></div>

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
        <div className="grid gap-3 xl:grid-cols-[1.82fr_.78fr]">
          <section role="grid" aria-label={`Agenda semanal, ${janela.rotulo}`} data-grade-inicio={horaInicial} data-grade-fim={horaFinal} className="overflow-hidden rounded-[10px] border border-[#29354a] bg-[#07111f]/92"><div role="row" className="grid grid-cols-[64px_repeat(5,minmax(0,1fr))] border-b border-[#29354a]"><span role="columnheader" aria-label="Horário" />{diasUteis.map((dia) => <div role="columnheader" key={dia} className="border-l border-[#253045]"><Link href={href("dia", dia)} aria-label={`${rotuloDiaCurto(dia)}, dia ${numeroDoDia(dia)}`} className="block py-3 text-center"><span className="block text-[10px] uppercase text-[#aab2c0]">{rotuloDiaCurto(dia)}</span><strong className={`mt-1 block text-xl ${dia === hoje ? "text-[#378cff]" : "text-white"}`}>{numeroDoDia(dia)}</strong></Link></div>)}</div><div role="row" className="grid grid-cols-[64px_repeat(5,minmax(0,1fr))]"><div role="rowheader" aria-label={`Horários de ${String(horaInicial).padStart(2, "0")}:00 a ${String(horaFinal).padStart(2, "0")}:00`} className="relative" style={{ height: `${alturaGrade}px` }}>{horasGrade.map((hora, indice) => <span key={hora} aria-hidden className="absolute right-3 text-xs tabular-nums text-[#a3acba]" style={{ top: `${indice * 58 - 7}px` }}>{String(hora).padStart(2, "0")}:00</span>)}</div>{diasUteis.map((dia) => <div role="gridcell" aria-label={`${rotuloDiaCurto(dia)}, dia ${numeroDoDia(dia)}`} key={dia} className="relative border-l border-[#253045] bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_57px,#1d293c_58px)]" style={{ height: `${alturaGrade}px` }}>{distribuirEventosGrade(eventosDoDiaNaGrade(dia)).map((item, indice) => <CompromissoGrade key={`${item.evento.uid}-${indice}`} item={item} horaInicial={horaInicial} data={`${rotuloDiaCurto(dia)}, dia ${numeroDoDia(dia)}`} />)}</div>)}</div><footer className="flex flex-wrap items-center gap-6 border-t border-[#29354a] px-5 py-4 text-xs text-[#a8b0bd]"><span className="flex items-center gap-2"><i className="h-3 w-3 rounded-sm bg-[#126df0]" /> Compromisso</span><span className="flex items-center gap-2"><i className="h-3 w-3 rounded-sm bg-[#713142]" /> Cancelado</span><span>Horários e durações proporcionais</span></footer>{eventosFimDeSemana.length ? <div className="border-t border-[#29354a] px-5 py-4"><p className="mb-2 text-xs font-medium text-[#aab2c0]">Fim de semana</p><div className="grid gap-2 sm:grid-cols-2">{eventosFimDeSemana.map((evento, indice) => <Compromisso key={`${evento.uid}-fim-${indice}`} e={evento} compacto />)}</div></div> : null}</section>
          <aside className="space-y-3"><section className="rounded-[10px] border border-[#29354a] bg-[#07111f]/92 p-5"><h2 className="text-[17px] font-semibold">Próximo atendimento</h2>{proximo ? <><div className="mt-5 flex items-center gap-4"><span className="rounded-md border border-[#26344b] bg-[#091625] px-3 py-3 text-xl font-semibold text-[#378cff]">{faixaHoraria(proximo).slice(0, 5)}</span><div className="min-w-0"><p className="truncate font-semibold">{proximo.titulo}</p><p className="mt-1 text-xs text-[#9aa4b5]">{faixaHoraria(proximo)}</p></div></div><Link href="/mentoria" className="mt-4 flex w-full items-center justify-center rounded-md border border-[#1769ff] py-2.5 text-sm font-medium text-[#3b8cff]">Abrir ficha</Link></> : <p className="py-8 text-center text-sm text-[#929caf]">Nenhum próximo atendimento nesta janela.</p>}</section><section className="rounded-[10px] border border-[#29354a] bg-[#07111f]/92 p-5"><h2 className="text-[17px] font-semibold">Preparação rápida</h2><div className="mt-3 divide-y divide-[#253045]">{[[FileText,"Revisar contexto essencial"],[Target,"Ver metas em andamento"],[MessageCircle,"Preparar perguntas"]].map(([Icone, rotulo]) => { const I = Icone as typeof FileText; return <Link key={String(rotulo)} href="/mentoria" className="flex items-center gap-3 py-4 text-sm text-[#e3e7ee]"><span className="flex h-9 w-9 items-center justify-center rounded-md border border-[#126f64] bg-[#082b2d] text-[#22cabc]"><I size={18} aria-hidden /></span><span>{String(rotulo)}</span><ChevronRight size={16} className="ml-auto" aria-hidden /></Link>; })}</div></section><section className="rounded-[10px] border border-[#29354a] bg-[#07111f]/92 p-5"><h2 className="text-[17px] font-semibold">Nesta semana</h2><dl className="mt-3 divide-y divide-[#253045] text-sm">{[[CalendarDays,"Atendimentos",total],[Clock3,"Tempo reservado",`${Math.floor(minutosReservados/60)}h${String(minutosReservados%60).padStart(2,"0")}`],[CheckCircle2,"Conflitos",conflitos]].map(([Icone, rotulo, valor]) => { const I = Icone as typeof CalendarDays; return <div key={String(rotulo)} className="flex items-center gap-3 py-3"><I size={18} className="text-[#b8c0cd]" aria-hidden /><dt className="text-[#cdd3dd]">{String(rotulo)}</dt><dd className={`ml-auto font-medium ${rotulo === "Conflitos" && Number(valor) > 0 ? "text-[#ff655f]" : "text-white"}`}>{String(valor)}</dd></div>; })}</dl></section></aside>
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
    </div>
  );
}
