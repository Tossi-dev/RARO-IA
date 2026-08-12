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

import { Bell, LogOut, Plus, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { setFiltroGlobal } from "@/lib/actions";
import { acharAppPorRota, CATALOGO_APPS, CATALOGO_SISTEMA } from "@/lib/apps";
// SÓ o tipo: `@/lib/data` é módulo neutro de servidor (lê process.env e importa
// os providers). Trazer valor de runtime dele para dentro de um componente
// cliente dá 500 em runtime com o build ainda verde.
import type { ModoDados } from "@/lib/data";
import type { FiltroFonte } from "@/lib/filtros";
import { RANGES } from "@/lib/filtros";
import type { Densidade } from "@/lib/densidade";
import type { Tema } from "@/lib/tema";
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
  const atual = acharAppPorRota(pathname, [...CATALOGO_APPS, ...CATALOGO_SISTEMA]);
  const nomeDoLugar = atual ? (atual.subApp ? atual.subApp.nome : atual.app.nome) : null;

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

        {/* criação rápida */}
        <Link
          href="/financeiro"
          title="Registrar venda / despesa"
          className="trans bevel flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-b from-primaria-2 via-primaria to-primaria-press text-white shadow-[0_6px_16px_-6px_rgb(var(--primaria)/0.7)] transition-all hover:brightness-110"
        >
          <Plus size={16} aria-hidden strokeWidth={1.75} />
        </Link>

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
