"use client";

// Cabeçalho e gaveta do celular.
//
// O que havia antes no mobile: a topbar de desktop (chips de fonte de renda +
// período + busca + selo) empilhada em cima de uma tira horizontal com TODAS as telas.
// Em 375px isso vira duas fileiras roláveis competindo pela mesma atenção, e o
// item ativo costuma nascer fora da área visível.
//
// O que existe agora: uma barra só, de 56px, com o que o polegar precisa —
// menu, marca, tema, busca — e uma gaveta que abre por cima com a navegação
// completa em grupos (a mesma da sidebar), os filtros globais e a origem dos
// dados. Uma coisa de cada vez, alvo de toque de 44px, e a gaveta se fecha
// sozinha quando a rota muda.
//
// Duas coisas novas desde então:
//
// 1. A barra de abas (barra-abas.tsx) também abre esta gaveta pelo botão
//    "Mais" — sem Context, pelo mesmo CustomEvent que o resto do projeto usa
//    (raro:abrir-paleta, EVENTO_ABRIR_AVISOS). O evento mora AQUI e não lá
//    porque quem dona o estado "aberta" é este componente.
//
// 2. O título grande da página (o <h1> que cada tela desenha via PageHeader,
//    em src/components/ui.tsx) "encolhe" para dentro desta barra quando a
//    pessoa rola — o efeito clássico de nav bar do iOS. PageHeader é do OUTRO
//    agente e não expõe id/data-atributo para este componente ler o título
//    sem adivinhar: por isso o seletor é `document.querySelector("h1")` puro
//    — aposta segura porque cada tela do sistema desenha exatamente um <h1>.

import { ChevronLeft, Menu, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { setFiltroGlobal } from "@/lib/actions";
import type { FiltroFonte } from "@/lib/filtros";
import { RANGES } from "@/lib/filtros";
import type { Densidade } from "@/lib/densidade";
import type { Tema } from "@/lib/tema";
import { DensidadeToggle } from "./densidade-toggle";
import { Marca, SidebarNav } from "./sidebar";
import { BotaoSairSimulacao, BotaoSimulacao } from "./simulacao";
import { TemaToggle } from "./tema-toggle";
import type { ProdutoFonte } from "./topbar";
import { cx } from "./ui";

/** O botão "Mais" da barra de abas dispara este evento; só a gaveta escuta. */
export const EVENTO_ABRIR_GAVETA = "raro:abrir-gaveta";

/** Rolou mais que isto e o título grande já saiu de vista lá em cima — hora
 *  do título pequeno assumir a barra. Curto de propósito: em tela de 844px de
 *  altura o título grande é a primeira coisa que existe, então não precisa de
 *  muito scroll para "sair da vista de verdade". */
const LIMIAR_ENCOLHER = 24;

export function MenuMobile({
  tema,
  densidade,
  simulacao,
  fonteAtiva,
  produtos,
  rangeDias,
  fonte,
  children,
}: {
  tema: Tema;
  densidade: Densidade;
  simulacao: boolean;
  /** A fonte de renda escolhida na lente global — "todos" ou id de um produto. */
  fonteAtiva: FiltroFonte;
  /** Produtos ativos, já filtrados no servidor. */
  produtos: ProdutoFonte[];
  rangeDias: number;
  /** Frase que diz de onde vêm os números (montada no servidor). */
  fonte: string;
  /** Bloco extra vindo do servidor — hoje, o botão de sair da conta. */
  children?: React.ReactNode;
}) {
  const [aberta, setAberta] = useState(false);
  const [pendente, iniciar] = useTransition();
  const pathname = usePathname();
  // `encolhido`: a rolagem já passou do limiar, o título pequeno assume.
  // `tituloPagina`: o texto do <h1> da tela — só é lido quando precisa
  // aparecer, então a topbar nunca mostra o título de ONTEM por um instante.
  const [encolhido, setEncolhido] = useState(false);
  const [tituloPagina, setTituloPagina] = useState("");

  // Navegou? A gaveta já cumpriu o papel dela.
  useEffect(() => {
    setAberta(false);
  }, [pathname]);

  // O botão "Mais" da barra de abas (barra-abas.tsx) vive num componente
  // irmão, sem relação de pai/filho com este — o CustomEvent é a ponte.
  useEffect(() => {
    const abrir = () => setAberta(true);
    window.addEventListener(EVENTO_ABRIR_GAVETA, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR_GAVETA, abrir);
  }, []);

  // O cabeçalho grande que "encolhe ao rolar", como no iOS: mede o scroll do
  // documento (a página inteira rola no <body>, nenhum container próprio) e,
  // ao passar do limiar, troca a marca pelo título da tela. `requestAnimationFrame`
  // evita amontoar setState a cada pixel — scroll dispara dezenas de eventos
  // por segundo e cada um não precisa de uma re-renderização própria.
  useEffect(() => {
    let quadro = 0;
    const medir = () => {
      quadro = 0;
      const y = window.scrollY;
      setEncolhido(y > LIMIAR_ENCOLHER);
      if (y > LIMIAR_ENCOLHER) {
        setTituloPagina(document.querySelector("h1")?.textContent?.trim() ?? "");
      }
    };
    const aoRolar = () => {
      if (quadro) return;
      quadro = requestAnimationFrame(medir);
    };
    // Também mede no primeiro render e a cada troca de rota: a pessoa pode
    // navegar já rolada (voltar pelo histórico do navegador, por exemplo) e
    // a tela nova pode nascer mais curta que a rolagem antiga permitia.
    medir();
    window.addEventListener("scroll", aoRolar, { passive: true });
    return () => {
      window.removeEventListener("scroll", aoRolar);
      if (quadro) cancelAnimationFrame(quadro);
    };
  }, [pathname]);

  // Trava a rolagem do fundo enquanto a gaveta está aberta — sem isso, arrastar
  // dentro da gaveta rola a página atrás dela.
  useEffect(() => {
    if (aberta) document.body.dataset.gaveta = "aberta";
    else delete document.body.dataset.gaveta;
    return () => {
      delete document.body.dataset.gaveta;
    };
  }, [aberta]);

  // Esc fecha, como em qualquer camada sobreposta.
  useEffect(() => {
    if (!aberta) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberta(false);
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aberta]);

  const aplicar = (f: FiltroFonte, r: number) => {
    iniciar(async () => {
      await setFiltroGlobal(f, r);
    });
  };

  return (
    <>
      {/* `.safe-top` soma a faixa do notch ao padding — sem ela a barra some
          atrás dele em vez de ficar logo abaixo. */}
      <header className="vidro safe-top sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-borda-sutil px-3 md:hidden">
        {/* Dentro de um aplicativo, o canto esquerdo é o "voltar" — pedido do
            cliente e convenção de iOS: o botão de sair de onde você está fica
            sempre no mesmo lugar, no polegar esquerdo. Na tela inicial não há
            de onde voltar, e o mesmo espaço vira o menu.
            A gaveta completa continua a um toque de distância pelo "Mais" da
            barra de abas — nada ficou inalcançável. */}
        {pathname === "/" ? (
          <button
            type="button"
            onClick={() => setAberta(true)}
            aria-label="Abrir menu"
            aria-expanded={aberta}
            className="toque trans flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-borda-sutil bg-poco text-texto-2 transition-colors hover:text-texto"
          >
            <Menu size={18} aria-hidden />
          </button>
        ) : (
          <Link
            href="/"
            aria-label="Voltar para a tela inicial"
            className="toque trans flex h-10 shrink-0 items-center gap-1 rounded-lg border border-borda-sutil bg-poco pl-2 pr-2.5 text-[13px] text-texto-2 transition-colors hover:text-texto"
          >
            <ChevronLeft size={17} aria-hidden strokeWidth={1.75} />
            Início
          </Link>
        )}

        {/* A marca e o título da página ocupam o MESMO espaço, empilhados, e
            trocam de opacidade/posição em vez de um substituir o outro no
            layout — é isso que evita o "salto" de largura quando o título
            (variável) é mais longo ou mais curto que "MentorOS".
            `self-stretch`: os dois filhos são `absolute` (fora do fluxo), então
            sem isto este container herdaria altura 0 do header (que centraliza
            com `items-center`, não estica) — e os spans `inset-0` ficariam
            presos numa caixa de 0px, invisíveis mesmo com opacity-100. */}
        <div className="relative min-w-0 flex-1 self-stretch overflow-hidden">
          <span
            className={cx(
              "trans absolute inset-0 flex items-center transition-all duration-200",
              encolhido ? "-translate-y-1.5 opacity-0" : "translate-y-0 opacity-100"
            )}
          >
            <Marca />
          </span>
          <span
            aria-hidden={!encolhido}
            className={cx(
              "trans absolute inset-0 flex items-center truncate font-display text-[15px] font-medium transition-all duration-200",
              encolhido ? "translate-y-0 opacity-100" : "translate-y-1.5 opacity-0"
            )}
          >
            {tituloPagina}
          </span>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {simulacao ? <BotaoSairSimulacao compacto /> : <BotaoSimulacao compacto />}
          <TemaToggle tema={tema} />
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("raro:abrir-paleta"))}
            aria-label="Buscar"
            className="toque trans flex h-8 w-8 items-center justify-center rounded-lg border border-borda-sutil bg-poco text-texto-2 transition-colors hover:text-texto"
          >
            <Search size={15} aria-hidden />
          </button>
        </div>
      </header>

      {/* gaveta */}
      <div
        className={cx("fixed inset-0 z-50 md:hidden", aberta ? "" : "pointer-events-none")}
        aria-hidden={!aberta}
      >
        <div
          onClick={() => setAberta(false)}
          className={cx(
            "absolute inset-0 bg-black/60 transition-opacity duration-200",
            aberta ? "opacity-100" : "opacity-0"
          )}
        />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Menu de navegação"
          // `safe-top`/`safe-bottom`: a gaveta ocupa a tela inteira (inset-y-0),
          // então ela É a área que precisa respeitar notch e home indicator, e
          // não só um filho dentro dela. `overscroll-contain`: chegar ao fim da
          // lista da gaveta não pode "vazar" o arrasto pra rolagem da página
          // atrás — sem isso, um scroll rápido demais fecha a sensação de gaveta
          // e revela que embaixo dela é só a mesma página.
          className={cx(
            "safe-top safe-bottom absolute inset-y-0 left-0 flex w-[86%] max-w-[320px] flex-col overflow-y-auto overscroll-contain border-r border-borda bg-superficie-1 p-4 shadow-e3 transition-transform duration-200 [-webkit-overflow-scrolling:touch]",
            aberta ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="mb-5 flex items-start justify-between">
            <Marca />
            <button
              type="button"
              onClick={() => setAberta(false)}
              aria-label="Fechar menu"
              className="toque trans flex h-10 w-10 items-center justify-center rounded-lg border border-borda-sutil text-texto-2 transition-colors hover:text-texto"
            >
              <X size={18} aria-hidden />
            </button>
          </div>

          <SidebarNav />

          {/* filtros globais: no desktop moram na topbar; aqui, na gaveta */}
          <div
            className={cx(
              "mt-6 border-t border-borda-sutil pt-4",
              pendente && "pointer-events-none opacity-60"
            )}
          >
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-texto-3">
              Fonte de renda
            </p>
            {/* Na gaveta a rolagem é vertical — diferente da topbar, cabe um
                botão por produto ativo, sem precisar de "Mais…" num select. */}
            <div className="mb-3 grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => aplicar("todos", rangeDias)}
                aria-pressed={fonteAtiva === "todos"}
                className={cx(
                  "toque trans rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors",
                  fonteAtiva === "todos"
                    ? "border-primaria/60 bg-primaria/15 text-texto"
                    : "border-borda-sutil bg-poco text-texto-3"
                )}
              >
                Todos
              </button>
              {produtos.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => aplicar(p.id, rangeDias)}
                  aria-pressed={fonteAtiva === p.id}
                  className={cx(
                    "toque trans truncate rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors",
                    fonteAtiva === p.id
                      ? "border-primaria/60 bg-primaria/15 text-texto"
                      : "border-borda-sutil bg-poco text-texto-3"
                  )}
                >
                  {p.nome}
                </button>
              ))}
            </div>
            <label className="block">
              <span className="mb-1 block text-[11px] text-texto-3">Período</span>
              <select
                value={rangeDias}
                onChange={(e) => aplicar(fonteAtiva, Number(e.target.value))}
                className="toque w-full rounded-lg border border-borda-sutil bg-poco px-2.5 py-2 text-sm text-texto-2 focus:border-primaria focus:outline-none"
              >
                {RANGES.map((r) => (
                  <option key={r.dias} value={r.dias}>
                    {r.rotulo}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* A chave simples/completo mora na gaveta, e não na barra de 56px:
              no celular o polegar tem quatro alvos, não seis. */}
          <div className="mt-6 border-t border-borda-sutil pt-4">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-texto-3">
              Quanta informação
            </p>
            <DensidadeToggle densidade={densidade} compacto={false} />
          </div>

          <div className="mt-auto space-y-2 border-t border-borda-sutil pt-3 text-xs text-texto-3">
            <p>{fonte}</p>
            {children}
          </div>
        </aside>
      </div>
    </>
  );
}
