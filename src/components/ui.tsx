// Primitivas de UI da MentorOS (estilo shadcn, sem dependência externa).
//
// Pele "ennvo" (SaaS escuro, linha Apple). O que a troca de pele mudou aqui:
//   - o card virou DEGRAU de luz (.superficie), não retângulo com contorno
//   - o número herói perdeu peso e ganhou corpo: 300 em 34px, não 600 em 26px.
//     Fonte fina em número grande é o que separa "premium" de "template"
//   - raio maior (rounded-2xl), respiro maior (p-5)
//   - hover levanta 1px e acende o brilho que atravessa o card (.card-sheen)

import clsx from "clsx";
import Link from "next/link";
import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { KpiDetalhe } from "@/components/kpi-detalhe";
import {
  formatarValor,
  frase,
  fraseComValorFormatado,
  glifoDaVariacao,
  tomDaVariacao,
  variacaoPct,
  type Composicao,
  type FormatoValor,
} from "@/lib/composicao";
import { fmtPct } from "@/lib/format";

export const cx = clsx;

export function PageHeader({
  titulo,
  sub,
  children,
}: {
  titulo: string;
  sub?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-[clamp(28px,3vw,38px)] font-fino leading-[0.98] tracking-[-0.045em]">
          {titulo}
        </h1>
        {sub ? <p className="mt-1.5 text-sm text-texto-2">{sub}</p> : null}
      </div>
      {children}
    </div>
  );
}

export function Card({
  titulo,
  acao,
  className,
  children,
}: {
  titulo?: string;
  acao?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={clsx(
        "superficie rounded-[28px] border p-5 md:p-6",
        className
      )}
    >
      {(titulo || acao) && (
        <div className="mb-4 flex items-center justify-between gap-2">
          {titulo ? (
            <h2 className="font-display text-[15px] font-normal tracking-tight text-texto">
              {titulo}
            </h2>
          ) : (
            <span />
          )}
          {acao}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * KPI card premium (Anexo A.8): eyebrow uppercase, valor herói tabular,
 * delta em pill, sparkline opcional, progresso até a meta e glow aurora.
 * Compatível com a assinatura da v2 — os novos recursos são opcionais.
 *
 * ONDA 1 — composição obrigatória (skills `dashboard-mc` e `diagnostico-comercial`):
 * todo KPI abre a sua composição. Quando `composicao` é informada, o cartão
 * mostra a memória de cálculo abaixo do valor e passa a abrir o `KpiDetalhe`
 * com a conta, a origem do dado e a comparação com a referência. Quando NÃO é,
 * o cartão renderiza exatamente como antes — mas ganha a marca "origem não
 * informada", para o pendente ficar visível em vez de silencioso.
 *
 * Este arquivo é NEUTRO (sem "use client") de propósito: ele exporta valores de
 * runtime (cx, Stat, Badge...) consumidos por Server Components. Só o modal, que
 * precisa de estado, vive num módulo "use client" separado.
 */
export function Stat({
  label,
  valor,
  deltaPct,
  hint = "vs mês anterior",
  invertida = false,
  href,
  spark,
  metaPct,
  destaque = false,
  ouro = false,
  composicao,
  formato = "numero",
  valorNumerico,
  referencia,
  labelReferencia,
  origem,
}: {
  label: string;
  valor: string;
  deltaPct?: number | null;
  hint?: string;
  invertida?: boolean; // true quando subir é ruim (ex.: custos) → direcao_boa "baixo"
  href?: string; // torna o card clicável (drill-down)
  spark?: ReactNode; // sparkline no rodapé
  metaPct?: number | null; // 0–100+: progresso até a meta
  destaque?: boolean; // glow aurora atrás do número (KPI herói)
  ouro?: boolean; // acento premium/high-ticket
  composicao?: Composicao; // a conta / a origem do número (elemento 3 da skill)
  formato?: FormatoValor; // como ler o número: moeda, contagem ou percentual
  valorNumerico?: number; // valor cru, usado para montar a frase e a variação
  referencia?: number | null; // meta, mês anterior, ano passado...
  labelReferencia?: string; // o que é a referência ("meta", "mês anterior")
  origem?: string; // de qual método/tabela/filtro o dado saiu
}) {
  // referência só vale se for número utilizável — "sem base" é resposta honesta
  const refNum =
    referencia === null || referencia === undefined || !Number.isFinite(referencia)
      ? null
      : referencia;
  const direcaoBoa = invertida ? "baixo" : "cima";
  // delta explícito continua mandando; sem ele, a variação sai de valor × referência
  const delta =
    deltaPct !== undefined
      ? deltaPct
      : refNum !== null && valorNumerico !== undefined
        ? variacaoPct(valorNumerico, refNum)
        : undefined;
  const temDelta = delta !== undefined && delta !== null;
  // a cor semântica (com direcao_boa) só entra nos KPIs já migrados; os demais
  // mantêm a regra antiga ao pé da letra para nenhum dos 88 usos mudar de cara.
  const semantico = composicao !== undefined || refNum !== null;
  const tom = semantico ? tomDaVariacao(temDelta ? delta! : null, direcaoBoa) : null;
  const positivo = tom
    ? tom === "positivo"
    : temDelta
      ? invertida
        ? delta! < 0
        : delta! > 0
      : false;
  const neutro = tom ? tom === "neutro" : temDelta && delta === 0;
  const metaBatida = metaPct !== undefined && metaPct !== null && metaPct >= 100;

  // elemento 3 da skill: a memória de cálculo, visível no próprio cartão
  const fraseCalculo =
    composicao === undefined
      ? null
      : valorNumerico !== undefined
        ? frase(valorNumerico, formato, composicao)
        : fraseComValorFormatado(valor, formato, composicao);
  const estruturada = typeof composicao === "object" ? composicao : null;
  const partesDetalhe = (estruturada?.partes ?? []).map((p) => ({
    rotulo: p.rotulo,
    valor: formatarValor(p.valor, p.formato ?? formato),
  }));
  const origemFinal = origem ?? estruturada?.origem;
  // elemento 4 da skill: a referência aparece com rótulo E valor entre parênteses
  const comparacao =
    refNum !== null && labelReferencia
      ? `vs ${labelReferencia} (${formatarValor(refNum, formato)})`
      : null;

  const corpo = (
    <>
      <p className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-texto-3">
        {label}
        {href ? (
          <span aria-hidden className="text-primaria-2">
            →
          </span>
        ) : null}
      </p>
      {/* `flex-wrap`: em cartão estreito (5 KPIs numa linha, ou celular) o valor
          longo + a pílula de variação não cabiam lado a lado e a pílula vazava
          por cima do cartão vizinho. Agora ela desce uma linha. */}
      <div
        className={clsx(
          "mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1",
          destaque && "glow-aurora"
        )}
      >
        <span
          className={clsx(
            "kpi-valor font-display font-fino leading-none tracking-tight tabular-nums",
            ouro && "text-ouro"
          )}
        >
          {valor}
        </span>
        {temDelta && (
          <span
            className={clsx(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
              neutro
                ? "bg-eleva text-texto-2"
                : positivo
                  ? "bg-positivo/10 text-positivo"
                  : "bg-negativo/10 text-negativo"
            )}
          >
            {/* glifo tipográfico, nunca emoji */}
            {tom ? glifoDaVariacao(delta!) : delta! > 0 ? "▲" : delta! < 0 ? "▼" : "•"}{" "}
            {fmtPct(Math.abs(delta!))}
          </span>
        )}
      </div>
      {/* `kpi-conta`: a memória de cálculo. Some no modo simples POR CSS e
          continua inteira dentro do modal que este mesmo cartão abre — some
          da primeira leitura, não do sistema. */}
      {fraseCalculo ? (
        <p className="kpi-conta mt-2 text-[11px] leading-snug text-texto-2 tabular-nums">
          {fraseCalculo}
        </p>
      ) : null}
      <p className="kpi-hint mt-2 text-xs text-texto-3">
        {temDelta
          ? (comparacao ?? hint)
          : (comparacao ??
            (href ? "ver análise completa" : hint === "" ? "" : "sem base de comparação"))}
      </p>
      {metaPct !== undefined && metaPct !== null && (
        <div className="mt-2">
          <div
            className="h-1 w-full overflow-hidden rounded-full bg-poco"
            role="progressbar"
            aria-valuenow={Math.round(Math.min(100, metaPct))}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progresso até a meta"
          >
            <div
              className={clsx("h-full rounded-full", metaBatida ? "bg-ouro" : "bg-primaria")}
              style={{ width: `${Math.max(0, Math.min(100, metaPct))}%` }}
            />
          </div>
          <p
            className={clsx(
              "mt-1 text-[11px] tabular-nums",
              metaBatida ? "text-ouro" : "text-texto-3"
            )}
          >
            {Math.round(metaPct)}% da meta{metaBatida ? " · batida" : ""}
          </p>
        </div>
      )}
      {spark ? <div className="mt-2 -mb-1">{spark}</div> : null}
      {composicao === undefined ? (
        // dívida visível: KPI sem composição declarada não pode passar batido
        <p className="kpi-origem mt-2 text-[10px] text-texto-2">
          {origemFinal ?? "origem não informada"}
        </p>
      ) : null}
    </>
  );
  const base = clsx(
    "superficie card-sheen block rounded-2xl border p-5 text-left",
    ouro && "!border-ouro/30"
  );
  // com composição o cartão inteiro abre o detalhe; o `href`, quando existe,
  // vira o link "Ver análise completa" DENTRO do modal.
  if (composicao !== undefined) {
    return (
      <KpiDetalhe
        label={label}
        valorFormatado={valor}
        fraseCalculo={fraseCalculo ?? valor}
        partes={partesDetalhe}
        origem={origemFinal}
        nota={estruturada?.nota}
        referenciaFormatada={refNum !== null ? formatarValor(refNum, formato) : undefined}
        labelReferencia={refNum !== null ? labelReferencia : undefined}
        variacao={temDelta ? delta! : null}
        tom={tomDaVariacao(temDelta ? delta! : null, direcaoBoa)}
        glifo={glifoDaVariacao(temDelta ? delta! : null)}
        href={href}
        classeGatilho={base}
      >
        {corpo}
      </KpiDetalhe>
    );
  }
  if (href) {
    return (
      <Link
        href={href}
        className={clsx(
          base,
          "trans transition-all hover:-translate-y-px hover:shadow-e2 hover:brightness-[1.06]"
        )}
      >
        {corpo}
      </Link>
    );
  }
  return <div className={base}>{corpo}</div>;
}

const TONS = {
  violeta: "border-primaria/40 bg-primaria/10 text-primaria-2",
  ouro: "border-ouro/40 bg-ouro/10 text-ouro",
  verde: "border-positivo/40 bg-positivo/10 text-positivo",
  vermelho: "border-negativo/40 bg-negativo/10 text-negativo",
  cinza: "border-borda bg-eleva text-texto-2",
  azul: "border-info/40 bg-info/10 text-info",
} as const;

export type Tom = keyof typeof TONS;

export function Badge({ tom = "cinza", children }: { tom?: Tom; children: ReactNode }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        TONS[tom]
      )}
    >
      {children}
    </span>
  );
}

export function ProgressBar({ pct, tom = "violeta" }: { pct: number; tom?: "violeta" | "ouro" }) {
  const v = Math.max(0, Math.min(100, pct));
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-poco"
      role="progressbar"
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={clsx("h-full rounded-full", tom === "violeta" ? "bg-primaria" : "bg-ouro")}
        style={{ width: `${v}%` }}
      />
    </div>
  );
}

/**
 * Lê o <thead> que a tela já montou (o mesmo `<Tabela><thead><tr><Th>…`) e
 * devolve o rótulo de cada coluna, na ordem. Não renderiza nada — é leitura
 * pura da árvore de elementos que `Tabela` recebeu como `children`, então
 * pode rodar quantas vezes o React quiser (inclusive duas vezes, como o
 * Strict Mode do React 18 faz em dev) sem produzir resultado diferente.
 */
function extrairRotulosDoCabecalho(nosDaTabela: ReactNode[]): ReactNode[] {
  const thead = nosDaTabela.find(
    (n): n is ReactElement => isValidElement(n) && n.type === "thead"
  );
  if (!thead) return [];
  const linhaCabecalho = Children.toArray(
    (thead.props as { children?: ReactNode }).children
  ).find((n): n is ReactElement => isValidElement(n) && n.type === "tr");
  if (!linhaCabecalho) return [];
  return Children.toArray((linhaCabecalho.props as { children?: ReactNode }).children).map(
    (th) => (isValidElement(th) ? (th.props as { children?: ReactNode }).children : null)
  );
}

/**
 * Recompõe o <thead>/<tbody> da tabela para o celular: some com o cabeçalho
 * (a legenda vira rótulo dentro de cada célula) e clona cada <Td> com o
 * rótulo da sua coluna (lido do <Th> na mesma posição) e um sinalizador
 * `principal` na coluna que identifica a linha. É uma transformação pura da
 * árvore de elementos — não usa Context nem estado, então não corre o risco
 * de dessincronizar rótulo × coluna se o React re-renderizar fora de ordem.
 */
function prepararParaCelular(children: ReactNode, colunaPrincipal: number): ReactNode {
  const nos = Children.toArray(children);
  const rotulos = extrairRotulosDoCabecalho(nos);
  // Tabela sem <thead>/<tr> reconhecível (fora do padrão das 20 telas que já
  // usam <Tabela>) — devolve os filhos como vieram. Uma tabela sem cartão de
  // celular é aceitável; quebrar a tela que a chamou não é.
  if (rotulos.length === 0) return children;

  return nos.map((no, i) => {
    if (!isValidElement(no)) return no;
    if (no.type === "thead") {
      return cloneElement(no as ReactElement<{ className?: string }>, {
        key: no.key ?? `thead-${i}`,
        className: clsx((no.props as { className?: string }).className, "hidden md:table-header-group"),
      });
    }
    if (no.type === "tbody") {
      const linhas = Children.toArray((no.props as { children?: ReactNode }).children).map(
        (tr) => {
          if (!isValidElement(tr) || tr.type !== "tr") return tr;
          const celulas = Children.toArray(
            (tr.props as { children?: ReactNode }).children
          ).map((td, coluna) => {
            // só decora o nosso <Td> — se algum dia aparecer um <td> cru
            // solto ali dentro, ele passa batido em vez de quebrar.
            if (!isValidElement(td) || td.type !== Td) return td;
            return cloneElement(td as ReactElement<TdProps>, {
              rotulo: rotulos[coluna],
              principal: coluna === colunaPrincipal,
            });
          });
          return cloneElement(
            tr as ReactElement<{ className?: string }>,
            {
              className: clsx(
                (tr.props as { className?: string }).className,
                // cartão: cada <tr> vira um bloco com borda e canto — a
                // partir de md volta a ser linha de tabela de verdade.
                "mb-3 flex flex-col gap-1 rounded-2xl border border-borda-sutil bg-poco p-3 last:mb-0 md:mb-0 md:table-row md:gap-0 md:rounded-none md:border-0 md:bg-transparent md:p-0"
              ),
            },
            celulas
          );
        }
      );
      return cloneElement(
        no as ReactElement<{ className?: string }>,
        {
          key: no.key ?? `tbody-${i}`,
          className: clsx(
            (no.props as { className?: string }).className,
            "block space-y-3 md:table-row-group md:space-y-0"
          ),
        },
        linhas
      );
    }
    return no;
  });
}

/**
 * Tabela responsiva: a MESMA marcação (`<Tabela><thead><tr><Th>…</Th></tr>
 * </thead><tbody>…</tbody></Tabela>`) vira tabela de verdade a partir de
 * `md:` (768px) e, abaixo disso, uma lista de cartões — uma linha, um
 * cartão, pares rótulo/valor empilhados. Nenhuma das ~20 telas que já usam
 * `<Tabela>` precisa mudar.
 *
 * Duas saídas foram cogitadas para o Td descobrir o rótulo da sua coluna
 * sem que a tela precise informar: (a) Th publica o texto num Context que
 * Td lê; (b) Tabela ganha uma prop `colunas` que as telas mais críticas
 * passam a usar. Foi escolhida uma variante de (a) — mas lendo a árvore de
 * elementos direto (função pura, sem Context/estado) em vez de Th "publicar"
 * o rótulo via mutação durante o render: o React 18 roda o corpo de cada
 * componente duas vezes em Strict Mode (dev — exatamente o modo em que a
 * verificação deste trabalho roda `next dev`), e um contador de coluna
 * mutado durante o render dobraria e desalinharia os rótulos ali. A opção
 * (b) foi descartada por pedir que "as telas mais críticas" mudem uma linha
 * — a leitura direta da árvore não pede NENHUMA mudança nas 20 telas.
 */
export function Tabela({
  children,
  className,
  colunaPrincipal = 0,
}: {
  children: ReactNode;
  className?: string;
  /** Índice (0-based) da coluna que identifica a linha — nome, produto,
   *  data… — e que no cartão do celular aparece em cima e maior, sem
   *  rótulo. Sem essa prop, assume a primeira coluna. */
  colunaPrincipal?: number;
}) {
  return (
    <div className={clsx("overflow-x-auto", className)}>
      <table className="block w-full border-collapse text-sm md:table [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10 [&_thead]:bg-painel">
        {prepararParaCelular(children, colunaPrincipal)}
      </table>
    </div>
  );
}

export function Th({ children, num = false }: { children?: ReactNode; num?: boolean }) {
  return (
    <th
      className={clsx(
        "border-b border-borda px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-texto-3",
        num ? "text-right" : "text-left"
      )}
    >
      {children}
    </th>
  );
}

interface TdProps {
  children?: ReactNode;
  num?: boolean;
  className?: string;
  /** Rótulo da coluna (o texto do <Th> correspondente) — a <Tabela> injeta
   *  isso sozinha ao clonar as células pro cartão do celular. Nenhuma tela
   *  precisa passar essa prop na mão. */
  rotulo?: ReactNode;
  /** Marca a célula que identifica a linha no cartão do celular (fica em
   *  cima, maior, sem rótulo). Também injetado pela <Tabela>. */
  principal?: boolean;
}

export function Td({ children, num = false, className, rotulo, principal = false }: TdProps) {
  return (
    <td
      className={clsx(
        "align-middle",
        principal
          ? // coluna principal: em cima, maior, sem rótulo — é o que
            // identifica o cartão à primeira vista, tipo o nome no topo de
            // um contato. `order-first` garante que ela abre o cartão mesmo
            // quando a coluna principal não é a primeira do <thead>.
            "order-first block pb-2 text-[15px] font-medium leading-snug text-texto md:order-none md:table-cell md:border-b md:border-borda/60 md:px-3 md:py-2 md:pb-2 md:text-sm md:font-normal md:leading-normal"
          : // demais colunas no celular: par rótulo/valor lado a lado — o
            // rótulo nasce do <Th> da mesma coluna, então a lista lê como
            // "Produto: Mentoria", sem exigir que a tela declare de novo.
            "flex items-baseline justify-between gap-3 py-1 text-[13px] md:table-cell md:border-b md:border-borda/60 md:px-3 md:py-2 md:text-sm",
        num && "tabular-nums md:text-right",
        className
      )}
    >
      {!principal && rotulo != null ? (
        <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-texto-3 md:hidden">
          {rotulo}
        </span>
      ) : null}
      {children}
    </td>
  );
}

export function Botao({
  children,
  tipo = "primario",
  submit = true,
  className,
}: {
  children: ReactNode;
  tipo?: "primario" | "fantasma" | "perigo";
  submit?: boolean;
  className?: string;
}) {
  return (
    <button
      type={submit ? "submit" : "button"}
      className={clsx(
        // Ação precisa de contraste e leitura imediata; a pílula mantém o gesto
        // de marca, mas a cor única evita gradiente decorativo em tela de trabalho.
        "trans inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-all active:translate-y-px",
        tipo === "primario" &&
          "bg-primaria text-white shadow-[0_8px_20px_-10px_rgb(var(--primaria)/0.9)] hover:bg-primaria-hover",
        tipo === "fantasma" &&
          "border border-borda bg-transparent font-normal text-texto-2 hover:border-borda-forte hover:bg-eleva hover:text-texto",
        tipo === "perigo" &&
          "border border-negativo/50 bg-negativo/10 text-negativo hover:bg-negativo/20",
        className
      )}
    >
      {children}
    </button>
  );
}

const inputCls =
  "trans w-full rounded-2xl border border-borda-sutil bg-poco px-3.5 py-2.5 text-sm text-texto transition-colors placeholder:text-texto-3 hover:border-borda focus:border-primaria-2 focus:outline-none";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx(inputCls, props.className)} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={clsx(inputCls, "min-h-[72px]", props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={clsx(inputCls, props.className)} />;
}

export function Campo({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={clsx("block", className)}>
      <span className="mb-1 block text-xs font-medium text-texto-2">{label}</span>
      {children}
    </label>
  );
}

/** Painel dobrável para formulários de criação ("+ Novo ..."). Sem JS. */
export function PainelForm({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <details className="painel-form superficie rounded-2xl border border-borda-sutil">
      <summary className="trans flex items-center justify-between px-5 py-3.5 text-sm font-medium text-primaria-2 transition-colors hover:text-texto">
        {titulo}
        <span aria-hidden className="text-texto-3">
          ＋
        </span>
      </summary>
      <div className="border-t border-borda-sutil p-5">{children}</div>
    </details>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-borda px-4 py-10 text-center text-sm text-texto-3">
      {children}
    </p>
  );
}

/** Skeleton shimmer para loading states (Anexo A.8). */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={clsx("skeleton h-4 w-full", className)} />;
}
