"use client";

// Quadro de Avisos — painel lateral ESQUERDO com ocultar/mostrar (padrão
// slideover do nuxt/dashboard). Traz o pulso do dia: reuniões, tarefas,
// semana, upsell, clientes a retomar (com WhatsApp) e visão geral.

import { Bell, Calendar, CheckSquare, MessageCircle, TrendingUp, Users, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { alternarTarefaGestao } from "@/lib/actions";
import type { DadosAvisos } from "@/lib/avisos";
import { fmtBRL, fmtPct } from "@/lib/format";
import { linkWhatsApp, mensagemReativacao } from "@/lib/whatsapp";
import { MiniBarrasSemana } from "./charts";
import { Badge, cx, type Tom } from "./ui";

/** O evento que abre o quadro. Mesmo mecanismo da paleta ⌘K
 *  (`raro:abrir-paleta`): quem dispara é o sino da topbar, e o painel só
 *  escuta — assim o botão pôde sair de cima da tela sem levar a função junto. */
export const EVENTO_ABRIR_AVISOS = "raro:abrir-avisos";

function Secao({
  icone,
  titulo,
  badge,
  children,
}: {
  icone: React.ReactNode;
  titulo: string;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <details open className="border-b border-borda-sutil px-5 py-4">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-display text-[13px] font-normal tracking-tight [&::-webkit-details-marker]:hidden">
        <span className="text-primaria-2">{icone}</span>
        {titulo}
        {badge ? (
          <span className="ml-auto rounded-full border border-borda-sutil bg-eleva px-2 py-0.5 text-[11px] tabular-nums text-texto-2">
            {badge}
          </span>
        ) : null}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

export function AvisosDock({ dados }: { dados: DadosAvisos }) {
  const [aberto, setAberto] = useState(false);
  const [faixaSel, setFaixaSel] = useState<string>("15-60");

  // O quadro nunca nasce aberto. Antes ele lembrava o último estado no
  // localStorage, e isso fazia o painel cobrir a tela inicial no primeiro
  // segundo da sessão — em cima justamente da tela que o dono abre para
  // escolher para onde ir. Agora só abre quando alguém pede.
  useEffect(() => {
    const abrir = () => setAberto(true);
    window.addEventListener(EVENTO_ABRIR_AVISOS, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR_AVISOS, abrir);
  }, []);

  const alternar = (v: boolean) => setAberto(v);
  const faixaAtiva = dados.faixas.find((f) => f.faixa === faixaSel) ?? dados.faixas[0];
  const hojeISO = new Date().toISOString().slice(0, 10);

  return (
    <>
      {/* O botão flutuante "Avisos" que morava no canto inferior esquerdo saiu
          da tela a pedido do cliente. Quem abre o quadro agora é o sino da
          topbar, por `EVENTO_ABRIR_AVISOS` — o painel e tudo que ele mostra
          continuam exatamente os mesmos. */}

      {/* painel esquerdo */}
      {aberto && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px] lg:bg-black/35"
            onClick={() => alternar(false)}
            aria-hidden
          />
          <aside
            // `safe-top`/`safe-bottom`: o painel também é `inset-y-0` — mesma
            // razão da gaveta em menu-mobile.tsx, ele É a tela inteira, então é
            // ele quem tem que ceder espaço para o notch e o home indicator.
            className="vidro safe-top safe-bottom fixed inset-y-0 left-0 z-50 flex w-[336px] max-w-[90vw] flex-col border-r border-borda-sutil bg-superficie-1/95 shadow-e4"
            aria-label="Quadro de avisos"
          >
            <div className="flex items-center justify-between border-b border-borda-sutil px-5 py-4">
              <p className="flex items-center gap-2 font-display text-[15px] font-normal tracking-tight">
                <Bell size={15} className="text-primaria-2" aria-hidden /> Quadro de avisos
              </p>
              <button
                onClick={() => alternar(false)}
                aria-label="Ocultar quadro de avisos"
                className="trans flex h-8 w-8 items-center justify-center rounded-full border border-borda-sutil text-texto-2 transition-colors hover:border-borda hover:text-texto"
              >
                <X size={16} aria-hidden />
              </button>
            </div>

            {/* `overscroll-contain`: rolar até o fim da última seção não pode
                "vazar" e arrastar a página atrás do painel — mesmo cuidado da
                gaveta do celular em menu-mobile.tsx. */}
            <div className="flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
              <Secao icone={<Calendar size={14} aria-hidden />} titulo="Reuniões de hoje" badge={dados.reunioesHoje.length}>
                {dados.reunioesHoje.length ? (
                  <ul className="space-y-2">
                    {dados.reunioesHoje.map((r) => (
                      <li key={r.id} className="rounded-xl border border-borda-sutil bg-painel-2 px-3.5 py-2.5 text-sm">
                        <p className="flex items-baseline gap-2">
                          <span className="font-display tabular-nums text-primaria-2">{r.hora}</span>
                          <span className="min-w-0 flex-1 truncate">{r.titulo}</span>
                        </p>
                        <p className="mt-0.5 flex items-center justify-between text-xs text-texto-2">
                          <span className="truncate">{r.comQuem || "—"}</span>
                          {r.alunoId ? (
                            <Link className="shrink-0 text-primaria-2 hover:underline" href={`/crm/${r.alunoId}`}>
                              histórico →
                            </Link>
                          ) : r.lancamentoId ? (
                            <Link className="shrink-0 text-primaria-2 hover:underline" href={`/lancamentos/${r.lancamentoId}`}>
                              lançamento →
                            </Link>
                          ) : null}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-texto-2">Nenhuma reunião marcada para hoje.</p>
                )}
              </Secao>

              <Secao icone={<CheckSquare size={14} aria-hidden />} titulo="Tarefas pendentes" badge={dados.tarefas.length}>
                {dados.tarefas.length ? (
                  <ul className="space-y-1.5">
                    {dados.tarefas.map((t) => (
                      <li key={t.id} className="flex items-start gap-2 text-sm">
                        <form action={alternarTarefaGestao}>
                          <input type="hidden" name="id" value={t.id} />
                          <button
                            aria-label="Concluir tarefa"
                            className="trans mt-0.5 flex h-4 w-4 items-center justify-center rounded-md border border-borda text-[10px] text-transparent transition-colors hover:border-primaria-2"
                          >
                            •
                          </button>
                        </form>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{t.titulo}</span>
                          {t.prazo && (
                            <span className={cx("text-xs", t.prazo < hojeISO ? "text-negativo" : "text-texto-2")}>
                              prazo {t.prazo.slice(8, 10)}/{t.prazo.slice(5, 7)}
                              {t.prazo < hojeISO ? " · atrasada" : ""}
                            </span>
                          )}
                        </span>
                        {t.prioridade === "alta" && <Badge tom="vermelho">alta</Badge>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-texto-2">Tudo em dia.</p>
                )}
              </Secao>

              <Secao icone={<TrendingUp size={14} aria-hidden />} titulo="Faturamento da semana">
                <p className="font-display text-[26px] font-fino leading-none tabular-nums">{fmtBRL(dados.semana.semanaAtual)}</p>
                <p className="mt-1.5 text-xs text-texto-2">
                  {dados.semana.deltaPct !== null ? (
                    <span className={dados.semana.deltaPct >= 0 ? "text-positivo" : "text-negativo"}>
                      {dados.semana.deltaPct >= 0 ? "▲" : "▼"} {fmtPct(Math.abs(dados.semana.deltaPct))}
                    </span>
                  ) : (
                    "—"
                  )}{" "}
                  vs 7 dias anteriores
                </p>
                <MiniBarrasSemana data={dados.semana.porDia} />
                <p className="kpi-conta mt-2 rounded-xl border border-borda-sutil bg-painel-2 px-3.5 py-2.5 text-xs leading-snug text-texto-2">
                  Upsell no mês: <span className="font-medium text-ouro">{fmtBRL(dados.upsell.valorMes)}</span> ·{" "}
                  {dados.upsell.qtdMes} vendas · {fmtPct(dados.upsell.pctFaturamento)} do faturamento
                </p>
              </Secao>

              <Secao
                icone={<MessageCircle size={14} aria-hidden />}
                titulo="Retomar contato"
                badge={dados.faixas.reduce((s, f) => s + f.alunos.length, 0)}
              >
                <div className="mb-2 flex flex-wrap gap-1">
                  {dados.faixas.map((f) => (
                    <button
                      key={f.faixa}
                      onClick={() => setFaixaSel(f.faixa)}
                      data-ativo={faixaSel === f.faixa ? "true" : "false"}
                      className={cx(
                        "pilula rounded-full border px-2.5 py-1 text-xs tabular-nums",
                        faixaSel === f.faixa
                          ? "border-transparent"
                          : "border-borda-sutil text-texto-2 hover:text-texto"
                      )}
                    >
                      {f.rotulo} · {f.alunos.length}
                    </button>
                  ))}
                </div>
                {faixaAtiva?.alunos.length ? (
                  <ul className="space-y-1.5">
                    {faixaAtiva.alunos.slice(0, 8).map((a) => (
                      <li key={a.id} className="flex items-center gap-2 text-sm">
                        <Link href={`/crm/${a.id}`} className="min-w-0 flex-1 truncate hover:text-primaria-2">
                          {a.nome}
                        </Link>
                        <span className="shrink-0 text-xs tabular-nums text-texto-2">{a.dias}d</span>
                        {a.telefone ? (
                          <a
                            href={linkWhatsApp(a.telefone, mensagemReativacao(a.nome))}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`WhatsApp de ${a.nome}`}
                            className="trans shrink-0 rounded-full border border-positivo/40 bg-positivo/10 px-2 py-0.5 text-[10px] font-medium text-positivo transition-colors hover:bg-positivo/20"
                          >
                            WhatsApp
                          </a>
                        ) : null}
                      </li>
                    ))}
                    {faixaAtiva.alunos.length > 8 && (
                      <li className="text-xs text-texto-2">
                        +{faixaAtiva.alunos.length - 8} nesta faixa —{" "}
                        <Link className="text-primaria-2 hover:underline" href="/crm">
                          ver todos no CRM
                        </Link>
                      </li>
                    )}
                  </ul>
                ) : (
                  <p className="text-xs text-texto-2">Ninguém nesta faixa.</p>
                )}
              </Secao>

              {/* Bloco de aprofundamento: some na visão simples. */}
              <div className="so-completo">
              <Secao icone={<Users size={14} aria-hidden />} titulo="Visão geral dos clientes">
                <ul className="space-y-1">
                  {dados.visaoGeral.map((e) => (
                    <li key={e.nome} className="flex items-center justify-between text-sm">
                      <span className="text-texto-2">{e.nome}</span>
                      <Badge tom={(e.cor as Tom) ?? "cinza"}>{e.qtd}</Badge>
                    </li>
                  ))}
                </ul>
                <Link href="/crm" className="mt-2 block text-right text-xs text-primaria-2 hover:underline">
                  abrir CRM →
                </Link>
              </Secao>
              </div>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
