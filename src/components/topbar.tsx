"use client";

// Topbar 64px (vidro, sticky).
//
// FAXINA PEDIDA PELO CLIENTE: a fileira de pílulas de fonte de renda ("Todos ·
// Protocolo Raro · Mentoria MentorOS · …") saiu da barra. Ela era a coisa mais
// pesada da tela e competia com o conteúdo da página. A FUNÇÃO ficou: virou um
// seletor compacto, do mesmo tamanho do de período, ao lado dele. Filtrar por
// produto continua sendo um clique — só não ocupa mais meia barra.
//
// Na mesma faxina saíram a sidebar de 248px e o botão flutuante "Avisos". O que
// era responsabilidade delas e passou a morar aqui:
//   · navegação  → a marca leva à tela inicial (os aplicativos) e o ⌘K acha
//                  qualquer tela pelo nome;
//   · avisos     → o sino dispara `EVENTO_ABRIR_AVISOS` e o mesmo painel abre;
//   · sair/origem do dado → menu do avatar, no canto direito.
//
// A lente global é FONTE DE RENDA, não agrupamento: "Todos" mais um produto
// ATIVO cadastrado por opção. Serve para ver o desempenho individual de cada
// produto/curso/lançamento e a participação dele na empresa. A lista vem do
// servidor por prop — este componente é "use client" e não lê banco.

import { Bell, ChevronDown, LogOut, Menu, Plus, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { setFiltroGlobal } from "@/lib/actions";
import { acharAppPorRota, type AppCatalogo } from "@/lib/apps";
// SÓ o tipo: `@/lib/data` é módulo neutro de servidor (lê process.env e importa
// os providers). Trazer valor de runtime dele para dentro de um componente
// cliente dá 500 em runtime com o build ainda verde.
import type { ModoDados } from "@/lib/data";
import type { FiltroFonte } from "@/lib/filtros";
import { RANGES } from "@/lib/filtros";
import type { Densidade } from "@/lib/densidade";
import type { Tema } from "@/lib/tema";
import type { Papel } from "@/lib/papeis";
import { EVENTO_ABRIR_AVISOS } from "./avisos-dock";
import { DensidadeToggle } from "./densidade-toggle";
import { Marca } from "./sidebar";
import { BotaoSairSimulacao, BotaoSimulacao } from "./simulacao";
import { TemaToggle } from "./tema-toggle";
import { cx } from "./ui";

/** Produto ativo, no mínimo que a barra precisa para virar uma opção. */
export interface ProdutoFonte {
  id: string;
  nome: string;
}

/**
 * Selos que precisam ficar visíveis na barra.
 *
 * Demonstração e vazio são os dois estados em que o número da tela NÃO é a
 * operação do dono: um por ser fictício, o outro por não existir. Os dois são
 * avisos, com textos diferentes porque as causas e as saídas são diferentes.
 * Nos modos com base real o espaço volta a ser do avatar do usuário.
 */
const SELO: Partial<Record<ModoDados, string>> = {
  demo: "Modo demonstração",
  vazio: "Sem dados",
};

const CLASSE_CONTROLE =
  "trans rounded-full border border-borda-sutil bg-poco px-3 py-1.5 text-xs text-texto-2 transition-colors hover:border-borda focus:border-primaria-2 focus:outline-none";

/**
 * Menu do avatar — guarda o que estava no rodapé da sidebar: a frase que diz
 * de onde vêm os números e o botão de sair. São duas informações que ninguém
 * consulta o tempo todo, mas que não podem sumir: a primeira é a diferença
 * entre olhar dado real e dado de demonstração.
 */
function MenuUsuario({
  usuario,
  fonteDoDado,
  children,
}: {
  usuario: string;
  fonteDoDado: string;
  children?: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const aoClicarFora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    document.addEventListener("mousedown", aoClicarFora);
    window.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("mousedown", aoClicarFora);
      window.removeEventListener("keydown", aoTeclar);
    };
  }, [aberto]);

  return (
    <div className="relative" ref={caixa}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        title={usuario || "Conta"}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label="Conta e origem dos dados"
        className="trans flex h-8 w-8 items-center justify-center rounded-full border border-borda bg-eleva text-xs font-medium text-primaria-2 transition-colors hover:border-primaria-2"
      >
        {(usuario || "?").slice(0, 1).toUpperCase()}
      </button>
      {aberto && (
        <div
          role="menu"
          className="vidro absolute right-0 top-10 z-50 w-[268px] rounded-2xl border border-borda-sutil p-3 shadow-e3"
        >
          {usuario && <p className="truncate text-[13px]">{usuario}</p>}
          <p className="mt-1 text-xs leading-snug text-texto-3">{fonteDoDado}</p>
          {children && (
            <div className="mt-2.5 flex items-center gap-1.5 border-t border-borda-sutil pt-2.5 text-xs text-texto-2">
              <LogOut size={13} aria-hidden strokeWidth={1.5} />
              {children}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function Topbar({
  modo,
  usuario,
  fonte,
  produtos,
  rangeDias,
  tema,
  densidade,
  simulacao,
  pendencias,
  fonteDoDado,
  apps,
  papel,
  children,
}: {
  modo: ModoDados;
  usuario: string;
  fonte: FiltroFonte;
  /** Produtos ativos, já filtrados no servidor — a barra só lista o que está ativo. */
  produtos: ProdutoFonte[];
  rangeDias: number;
  tema: Tema;
  densidade: Densidade;
  simulacao: boolean;
  /** Reuniões de hoje + tarefas pendentes — o número do sino. */
  pendencias: number;
  /** Frase que diz de onde vêm os números (montada no servidor). */
  fonteDoDado: string;
  /**
   * B2.7 — os apps de trabalho + os de "Sistema", JÁ FILTRADOS pelo papel
   * (src/lib/apps.ts `appsDoPapel`, chamado em src/app/(app)/layout.tsx).
   * Este componente importava `CATALOGO_APPS`/`CATALOGO_SISTEMA` direto —
   * o catálogo INTEIRO, sem papel nenhum aplicado — só para achar o nome do
   * app da rota atual (o "breadcrumb" ao lado da marca) e para decidir se o
   * atalho de criação rápida aponta para algo que este papel pode abrir. A
   * rota atual em si já é sempre permitida (o middleware barrou antes de
   * chegar aqui), então usar o catálogo cheio não vazava nada por ESSA
   * conta — mas o botão de criação rápida, fixo em "/financeiro", vazava: um
   * mentorado via um botão "+" levando direto para /sem-acesso. Recebendo o
   * catálogo já filtrado por prop, os dois usos passam a respeitar o papel
   * pela mesma fonte de verdade.
   */
  apps: AppCatalogo[];
  papel: Papel;
  /** Bloco vindo do servidor — hoje, o formulário de sair da conta. */
  children?: React.ReactNode;
}) {
  const [pendente, iniciar] = useTransition();
  const pathname = usePathname();
  const selo = SELO[modo];

  const aplicar = (f: FiltroFonte, r: number) => {
    iniciar(async () => {
      await setFiltroGlobal(f, r);
    });
  };

  // Onde estou: com a sidebar fora da tela, o nome do app aberto passou a ser
  // a única pista de lugar. Na tela inicial não há app aberto e o espaço fica
  // limpo, como numa área de trabalho.
  const atual = acharAppPorRota(pathname, apps);
  const nomeDoLugar = atual ? (atual.subApp ? atual.subApp.nome : atual.app.nome) : null;
  // O atalho de criação rápida só aparece quando "/financeiro" está na lista
  // já filtrada — mesma pergunta que decide o tile de Financeiro na tela
  // inicial, feita aqui pela MESMA lista, não por um `rotaPermitida` novo.
  const podeRegistrar = apps.some((a) => a.href === "/financeiro" || a.href.startsWith("/financeiro/"));

  if (pathname !== "/") {
    const nome = usuario ? usuario.split("@")[0].replace(/[._-]+/g, " ") : "Mentor";
    const nomeExibicao = nome.replace(/\b\w/g, (letra) => letra.toUpperCase());
    const tituloInterno = pathname === "/painel" ? "Visão geral" : (nomeDoLugar ?? "MentorOS");
    const rotuloPapel: Record<Papel, string> = { dono: "Dono", gestor: "Gestor", comercial: "Comercial", mentorado: "Mentorado", afiliado: "Afiliado", aluno: "Aluno" };
    return <header className="sticky top-0 z-40 hidden h-[66px] items-center border-b border-white/[0.08] bg-[#030917]/90 px-7 backdrop-blur-xl md:flex">
      <div className="flex items-center gap-6"><button type="button" onClick={() => window.dispatchEvent(new CustomEvent("raro:abrir-paleta"))} aria-label="Abrir navegação rápida" className="text-[#dce2f1] transition-colors hover:text-white"><Menu size={22} strokeWidth={1.6} aria-hidden /></button><span className="text-[15px] font-semibold text-white">{tituloInterno}</span></div>
      <div className="ml-auto flex items-center gap-5">
        <button onClick={() => window.dispatchEvent(new CustomEvent("raro:abrir-paleta"))} aria-label="Buscar" className="text-[#dce2f1] transition-colors hover:text-white"><Search size={21} strokeWidth={1.6} aria-hidden /></button>
        <button type="button" onClick={() => window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_AVISOS))} aria-label={pendencias > 0 ? `Quadro de avisos · ${pendencias} pendências` : "Quadro de avisos"} className="relative text-[#dce2f1] transition-colors hover:text-white"><Bell size={21} strokeWidth={1.6} aria-hidden />{pendencias > 0 && <span className="absolute -right-2 -top-2 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-[#1769ff] px-1 text-[10px] font-semibold text-white">{pendencias}</span>}</button>
        <span className="h-7 w-px bg-white/[0.09]" aria-hidden />
        <MenuUsuario usuario={usuario} fonteDoDado={fonteDoDado}>{children}</MenuUsuario>
        <div className="hidden min-w-32 lg:block"><p className="truncate text-sm font-semibold capitalize text-white">{nomeExibicao}</p><p className="text-xs text-[#8f99ad]">{rotuloPapel[papel]}</p></div>
        <details className="group relative">
          <summary aria-label="Abrir controles do painel" className="flex h-8 w-8 cursor-pointer list-none items-center justify-center text-[#cbd2e2] [&::-webkit-details-marker]:hidden"><ChevronDown size={17} className="transition-transform group-open:rotate-180" aria-hidden /></summary>
          <div className="absolute right-0 top-10 z-50 flex w-[280px] flex-col gap-3 rounded-xl border border-[#273247] bg-[#07111f] p-4 shadow-2xl">
            <label className="flex flex-col gap-1.5 text-xs text-[#8f99ad]">Fonte de renda<select value={fonte} onChange={(e) => aplicar(e.target.value, rangeDias)} aria-label="Filtrar por fonte de renda" className={CLASSE_CONTROLE}><option value="todos">Todas as fontes</option>{produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></label>
            <label className="flex flex-col gap-1.5 text-xs text-[#8f99ad]">Período<select value={rangeDias} onChange={(e) => aplicar(fonte, Number(e.target.value))} className={CLASSE_CONTROLE} aria-label="Período global">{RANGES.map((r) => <option key={r.dias} value={r.dias}>{r.rotulo}</option>)}</select></label>
            <div className="flex flex-wrap items-center gap-2 border-t border-[#273247] pt-3"><TemaToggle tema={tema} /><DensidadeToggle densidade={densidade} />{simulacao ? <BotaoSairSimulacao compacto /> : <BotaoSimulacao compacto />}{podeRegistrar && <Link href="/financeiro" title="Registrar venda / despesa" className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1769ff] text-white"><Plus size={16} aria-hidden /></Link>}{selo && <span className="text-xs text-aviso">{selo}</span>}</div>
          </div>
        </details>
      </div>
    </header>;
  }

  // `hidden md:flex`: no celular quem manda é <MenuMobile />. Esconder AQUI, e
  // não numa div em volta, é de propósito — `sticky` dentro de um wrapper da
  // altura do próprio header deixaria de grudar já no primeiro pixel de rolagem.
  return (
    <header className="vidro sticky top-0 z-40 hidden h-16 items-center gap-3 border-b border-borda-sutil px-5 md:flex">
      <Link
        href="/"
        aria-label="Tela inicial"
        className="trans flex items-center gap-2.5 transition-opacity hover:opacity-80"
      >
        <Marca />
      </Link>
      {nomeDoLugar && (
        <span className="flex items-center gap-2.5 text-[13px] text-texto-2">
          <span aria-hidden className="text-texto-3">
            /
          </span>
          {nomeDoLugar}
        </span>
      )}

      <div className={cx("ml-auto flex items-center gap-2", pendente && "opacity-60")}>
        {/* busca global (⌘K) — com a sidebar fora, é o caminho mais curto para
            qualquer tela pelo nome */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("raro:abrir-paleta"))}
          className="trans flex items-center gap-2 rounded-full border border-borda-sutil bg-poco px-3 py-1.5 text-xs text-texto-3 transition-colors hover:border-borda hover:text-texto-2"
        >
          <Search size={13} aria-hidden strokeWidth={1.5} />
          <span className="hidden lg:inline">Buscar…</span>
          <kbd className="hidden rounded-md border border-borda-sutil bg-painel px-1 font-mono text-[10px] lg:inline">
            ⌘K
          </kbd>
        </button>

        {/* lente global: fonte de renda (era a fileira de pílulas) */}
        <select
          value={fonte}
          onChange={(e) => aplicar(e.target.value, rangeDias)}
          aria-label="Filtrar por fonte de renda"
          className={CLASSE_CONTROLE}
        >
          <option value="todos">Todas as fontes</option>
          {produtos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>

        {/* date-range global */}
        <select
          value={rangeDias}
          onChange={(e) => aplicar(fonte, Number(e.target.value))}
          className={CLASSE_CONTROLE}
          aria-label="Período global"
        >
          {RANGES.map((r) => (
            <option key={r.dias} value={r.dias}>
              {r.rotulo}
            </option>
          ))}
        </select>

        {/* aparência */}
        <TemaToggle tema={tema} />

        {/* quanta informação a tela abre de uma vez */}
        <DensidadeToggle densidade={densidade} />

        {/* simulação — o mesmo lugar liga e desliga */}
        {simulacao ? <BotaoSairSimulacao compacto /> : <BotaoSimulacao compacto />}

        {/* quadro de avisos — herdou o papel do botão flutuante */}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_AVISOS))}
          aria-label={
            pendencias > 0 ? `Quadro de avisos · ${pendencias} pendências` : "Quadro de avisos"
          }
          title="Quadro de avisos"
          className="trans relative flex h-8 w-8 items-center justify-center rounded-full border border-borda-sutil bg-poco text-texto-2 transition-colors hover:border-borda hover:text-texto"
        >
          <Bell size={15} aria-hidden strokeWidth={1.5} />
          {pendencias > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primaria px-1 text-[10px] font-medium leading-none text-white">
              {pendencias}
            </span>
          )}
        </button>

        {/* criação rápida — só desenha se este papel pode abrir /financeiro
            (ver `podeRegistrar` acima); antes da B2.7 este link era fixo e
            um mentorado via um botão "+" que só levava a /sem-acesso. */}
        {podeRegistrar && (
          <Link
            href="/financeiro"
            title="Registrar venda / despesa"
            className="trans bevel flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-b from-primaria-2 via-primaria to-primaria-press text-white shadow-[0_6px_16px_-6px_rgb(var(--primaria)/0.7)] transition-all hover:brightness-110"
          >
            <Plus size={16} aria-hidden strokeWidth={1.75} />
          </Link>
        )}

        {selo && (
          <span
            title={selo}
            className="hidden items-center gap-1.5 rounded-full border border-aviso/40 bg-aviso/10 px-2.5 py-1 text-[11px] font-medium text-aviso lg:inline-flex"
          >
            <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-aviso" />
            {selo}
          </span>
        )}

        <MenuUsuario usuario={usuario} fonteDoDado={fonteDoDado}>
          {children}
        </MenuUsuario>
      </div>
    </header>
  );
}
