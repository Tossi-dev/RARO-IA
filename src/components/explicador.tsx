// Camada de EXPLICAÇÃO visual — o kit que transforma tabela em entendimento.
//
// O PROBLEMA QUE ISTO RESOLVE
// ---------------------------
// O painel sabia mostrar o número certo, mas não explicava o que o número É
// nem como um se liga no outro. Quem já é da área preenchia essa lacuna de
// cabeça; quem não é olhava para "Resultado líquido R$ 77.453" e não sabia
// se aquilo era bom, de onde saiu, nem por que difere do faturamento.
//
// A saída não é escrever mais texto: é DESENHAR a relação. Um CFO lê o mesmo
// bloco e vê a conta; um leigo lê e vê a história — sem que nenhum dos dois
// precise de uma versão diferente do produto.
//
// TRÊS PEÇAS, E SÓ TRÊS
//   <SecaoVisual>  o quadro: a pergunta que a seção responde, a resposta em
//                  uma frase, e o visual embaixo
//   <Fluxo>        o esquema: caixas ligadas por setas, com o que é subtraído
//                  escrito EM CIMA da seta
//   <Legenda>      o que cada cor quer dizer, em português
//
// COMO A DENSIDADE ENTRA
// A visão simples não é a completa com menos coisa: é a completa com MAIS
// explicação e MENOS número. A frase-resposta e o esquema ficam nos dois
// modos — são eles que fazem entender. O que aparece só no completo é a
// conta, a origem e as tabelas (classe `so-completo`, controlada por CSS a
// partir de `data-densidade` no <html>).

import clsx from "clsx";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Um quadro de assunto.
 *
 * `pergunta` é a pergunta de negócio que a seção responde, em cima, pequena.
 * `resposta` é a conclusão em UMA frase, em corpo grande — é a única linha que
 * alguém com pressa vai ler, então ela precisa ser conclusiva, não descritiva.
 * "Falta R$ 12 mil para a meta" serve; "Acompanhamento de meta" não serve.
 */
export function SecaoVisual({
  pergunta,
  resposta,
  tom = "neutro",
  acao,
  rodape,
  className,
  children,
}: {
  pergunta: string;
  resposta: ReactNode;
  tom?: "neutro" | "bom" | "ruim" | "atencao";
  acao?: ReactNode;
  /** Linha de pé: origem, ressalva, link para aprofundar. */
  rodape?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={clsx("superficie rounded-2xl border p-5 md:p-6", className)}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wider text-texto-3">
            {pergunta}
          </p>
          <p
            className={clsx(
              "mt-1.5 font-display text-lg font-fino leading-snug tracking-tight md:text-xl",
              tom === "bom" && "text-positivo",
              tom === "ruim" && "text-negativo",
              tom === "atencao" && "text-ouro"
            )}
          >
            {resposta}
          </p>
        </div>
        {acao}
      </div>
      {children}
      {rodape ? <div className="mt-4 text-xs text-texto-3">{rodape}</div> : null}
    </section>
  );
}

export interface EtapaFluxo {
  /** Nome curto, em português de gente. */
  rotulo: string;
  /** Valor já formatado. */
  valor: string;
  /** Uma frase dizendo o que ESTE número é. Aparece nos dois modos. */
  oQueE: string;
  tom?: "neutro" | "marca" | "bom" | "ruim" | "ouro";
  /** O que foi tirado ENTRE a etapa anterior e esta. Vai escrito na seta. */
  tirado?: Array<{ rotulo: string; valor: string }>;
  /** Texto da seta quando a ligação NÃO é uma subtração (ex.: muda de conceito). */
  ligacao?: string;
  /** Glow aurora atrás do número, como no KPI herói. No máximo um por esquema. */
  destaque?: boolean;
  href?: string;
}

const TOM_ETAPA: Record<NonNullable<EtapaFluxo["tom"]>, string> = {
  neutro: "text-texto",
  marca: "text-primaria-2",
  bom: "text-positivo",
  ruim: "text-negativo",
  ouro: "text-ouro",
};

/**
 * O esquema: caixas ligadas, com o que sai escrito no caminho.
 *
 * No desktop as etapas ficam em linha e as setas apontam para a direita; no
 * celular viram uma coluna e as setas apontam para baixo. É a mesma marcação:
 * quem gira é o `flex-col md:flex-row` e o glifo da seta, escolhido por CSS
 * (`md:hidden` / `hidden md:inline`) para não precisar de JavaScript.
 */
export function Fluxo({ etapas }: { etapas: EtapaFluxo[] }) {
  return (
    <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-stretch">
      {etapas.map((e, i) => (
        <div key={e.rotulo} className="contents">
          {i > 0 && (
            <div className="flex shrink-0 flex-col items-center justify-center gap-1 px-1 py-1 md:w-[112px] md:py-0">
              {/* o que foi tirado no caminho — é AQUI que a conta vira história */}
              {e.ligacao ? (
                <p className="order-2 text-center text-[10px] leading-tight text-texto-3 md:order-1">
                  {e.ligacao}
                </p>
              ) : null}
              {e.tirado?.length ? (
                <div className="order-2 w-full space-y-0.5 md:order-1">
                  {e.tirado.map((t) => (
                    <p
                      key={t.rotulo}
                      className="text-center text-[10px] leading-tight text-texto-3"
                    >
                      <span className="text-negativo">−</span> {t.rotulo}
                      <span className="block tabular-nums text-texto-2">{t.valor}</span>
                    </p>
                  ))}
                </div>
              ) : null}
              <span aria-hidden className="order-1 text-texto-4 md:order-2">
                <span className="md:hidden">▼</span>
                <span className="hidden md:inline">▶</span>
              </span>
            </div>
          )}

          {(() => {
            const corpo = (
              <>
                <p className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-texto-3">
                  {e.rotulo}
                  {e.href ? (
                    <span aria-hidden className="text-primaria-2">
                      →
                    </span>
                  ) : null}
                </p>
                <div className={clsx("mt-2", e.destaque && "glow-aurora")}>
                  <p
                    className={clsx(
                      "kpi-valor-medio font-display font-fino leading-none tracking-tight tabular-nums",
                      TOM_ETAPA[e.tom ?? "neutro"]
                    )}
                  >
                    {e.valor}
                  </p>
                </div>
                {/* A frase do "o que é" NÃO some na visão simples: ela é o
                    motivo de a seção existir para quem não é da área. */}
                <p className="mt-2.5 text-[11px] leading-snug text-texto-2">{e.oQueE}</p>
              </>
            );
            // Mesma pele dos cartões de KPI: degrau de luz, bevel na aresta,
            // brilho atravessando no hover. As caixas do esquema SÃO KPIs —
            // tratá-las como caixinha de apoio quebrava a unidade da tela.
            const classe =
              "superficie card-sheen trans flex-1 rounded-2xl border p-4 transition-all md:min-w-0";
            return e.href ? (
              <Link
                href={e.href}
                className={clsx(classe, "block hover:-translate-y-px hover:shadow-e2 hover:brightness-[1.06]")}
              >
                {corpo}
              </Link>
            ) : (
              <div className={classe}>{corpo}</div>
            );
          })()}
        </div>
      ))}
    </div>
  );
}

/** O que cada cor quer dizer, em português. Vale para qualquer gráfico. */
export function Legenda({
  itens,
}: {
  itens: Array<{ cor: string; rotulo: string; oQueE?: string }>;
}) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2">
      {itens.map((i) => (
        <li key={i.rotulo} className="flex items-start gap-2 text-xs">
          <span
            aria-hidden
            className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full"
            style={{ background: i.cor }}
          />
          <span className="min-w-0">
            <span className="text-texto-2">{i.rotulo}</span>
            {i.oQueE ? <span className="block text-[11px] text-texto-3">{i.oQueE}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Definição curta de um termo, para o glossário de rodapé de cada tela.
 * Some na visão simples? NÃO. Glossário é justamente o que o leigo precisa.
 * O que some no simples é a FÓRMULA, não o significado.
 */
export function Glossario({
  termos,
}: {
  termos: Array<{ termo: string; oQueE: string; formula?: string }>;
}) {
  // `so-completo`: cada caixa do esquema JÁ diz o que aquele número é. Repetir
  // a mesma definição no rodapé, na visão simples, seria exatamente a poluição
  // que este trabalho veio tirar. O glossário existe para quem quer conferir.
  return (
    <dl className="so-completo grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
      {termos.map((t) => (
        <div key={t.termo}>
          <dt className="text-xs font-medium text-texto-2">{t.termo}</dt>
          <dd className="mt-0.5 text-[11px] leading-snug text-texto-3">
            {t.oQueE}
            {t.formula ? (
              <span className="kpi-conta mt-1 block font-mono text-[10px] text-texto-2">
                {t.formula}
              </span>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}
