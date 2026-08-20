// Kanban: a CASCA (colunas que rolam e param inteiras na tela) e o quadro do
// CRM por estágio. Padrão frappe/crm, sem drag-and-drop: mover = menu no
// cartão → server action, funciona sem JS pesado.
//
// TAREFA 47 — A CASCA VIROU PEÇA PRÓPRIA, E O CARTÃO NÃO
// ------------------------------------------------------
// O funil comercial (`/comercial`) precisava de um quadro, e o plano da Fase
// 2 pedia para "reaproveitar o kanban". Reaproveitar o `KanbanCrm` INTEIRO
// seria errado: o cartão dele carrega telefone, botão de WhatsApp, LTV e
// "dias sem contato", e o menu de mover chama `moverAlunoEstagio` — coisas de
// aluno, não de negociação. Uma peça que servisse aos dois viraria um monte
// de `if` sobre o que mostrar.
//
// O que os dois quadros REALMENTE têm em comum é a casca: a tira horizontal
// de colunas com `snap`, o cabeçalho com contagem e o "Vazio" quando a coluna
// não tem nada. Isso é `KanbanColunas`, e cada tela desenha o próprio cartão
// dentro.

import type { ReactNode } from "react";
import Link from "next/link";
import { moverAlunoEstagio } from "@/lib/actions";
import { fmtBRL } from "@/lib/format";
import type { Estagio } from "@/lib/types";
import { linkWhatsApp, mensagemReativacao } from "@/lib/whatsapp";
import { Badge, type Tom } from "./ui";

export interface CartaoKanban {
  id: string;
  nome: string;
  origem: string;
  telefone: string;
  ltv: number;
  diasSemContato: number | null;
}

export interface ColunaKanban {
  id: string;
  titulo: string;
  /** O que o leitor de tela anuncia — "Estágio X" no CRM, "Etapa X" no funil. */
  rotuloAria: string;
  /** O canto direito do cabeçalho: contagem, valor somado, o que a tela quiser. */
  etiqueta?: ReactNode;
  conteudo: ReactNode;
}

/**
 * A tira de colunas. Não sabe o que é um cartão — só empilha o que recebe.
 */
export function KanbanColunas({ colunas }: { colunas: ColunaKanban[] }) {
  return (
    // snap-x: cada coluna do funil pára inteira na tela — sem isso, um swipe
    // no celular parava no meio de uma coluna e parecia o layout quebrado.
    <div className="flex snap-x snap-proximity gap-3 overflow-x-auto pb-3">
      {colunas.map((coluna) => (
        <section
          key={coluna.id}
          className="w-[250px] shrink-0 snap-start rounded-xl border border-borda bg-painel"
          aria-label={coluna.rotuloAria}
        >
          <header className="flex items-center justify-between border-b border-borda px-3 py-2">
            <span className="text-sm font-medium">{coluna.titulo}</span>
            {coluna.etiqueta}
          </header>
          <div className="max-h-[520px] space-y-2 overflow-y-auto p-2">{coluna.conteudo}</div>
        </section>
      ))}
    </div>
  );
}

export function KanbanCrm({
  estagios,
  colunas,
}: {
  estagios: Estagio[];
  colunas: Record<string, CartaoKanban[]>; // estagioId → cartões
}) {
  return (
    <KanbanColunas
      colunas={estagios.map((e) => {
        const cartoes = colunas[e.id] ?? [];
        return {
          id: e.id,
          titulo: e.nome,
          rotuloAria: `Estágio ${e.nome}`,
          etiqueta: <Badge tom={(e.cor as Tom) ?? "cinza"}>{cartoes.length}</Badge>,
          conteudo: (
            <>
              {cartoes.map((c) => (
                <article key={c.id} className="rounded-lg border border-borda bg-painel-2 p-2.5">
                  <div className="flex items-start justify-between gap-1">
                    <Link href={`/crm/${c.id}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:text-primaria-2">
                      {c.nome}
                    </Link>
                    <details className="relative">
                      {/* `.toque`: só "⋯" de largura mal passava de 20px de
                          alvo — multiplicado pelos cartões do funil inteiro,
                          era a maior fatia dos alvos de toque pequenos do
                          /crm. */}
                      <summary
                        className="toque trans inline-flex cursor-pointer list-none items-center justify-center rounded text-texto-2 hover:bg-painel [&::-webkit-details-marker]:hidden"
                        aria-label="Mover de estágio"
                      >
                        ⋯
                      </summary>
                      <div className="absolute right-0 z-10 mt-1 w-44 rounded-lg border border-borda bg-fundo p-1 shadow-xl">
                        <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-texto-2">Mover para</p>
                        {estagios
                          .filter((x) => x.id !== e.id)
                          .map((x) => (
                            <form key={x.id} action={moverAlunoEstagio}>
                              <input type="hidden" name="alunoId" value={c.id} />
                              <input type="hidden" name="estagioId" value={x.id} />
                              {/* De qual coluna o card saiu e para qual vai —
                                  as duas declaradas para que
                                  `moverAlunoEstagio` recuse o arrasto
                                  proibido (alumni voltando ao funil) SEM ir
                                  ao banco. É atalho, não garantia: a Server
                                  Action refaz a conta com as duas chaves
                                  reais lidas do banco antes de gravar. */}
                              <input type="hidden" name="chaveAtual" value={e.chave} />
                              <input type="hidden" name="chaveDestino" value={x.chave} />
                              <button className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-painel-2">
                                {x.nome}
                              </button>
                            </form>
                          ))}
                      </div>
                    </details>
                  </div>
                  <p className="mt-1 flex items-center justify-between text-xs text-texto-2">
                    <span>{c.origem || "—"}</span>
                    <span className="tabular-nums">{c.ltv > 0 ? fmtBRL(c.ltv) : "lead"}</span>
                  </p>
                  <p className="mt-1.5 flex items-center justify-between text-xs">
                    <span className="text-texto-2">
                      {c.diasSemContato !== null ? `${c.diasSemContato}d sem contato` : "contato hoje"}
                    </span>
                    {c.telefone && (
                      <a
                        href={linkWhatsApp(c.telefone, mensagemReativacao(c.nome))}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="toque trans inline-flex items-center justify-center rounded-md border border-positivo/40 bg-positivo/10 px-1.5 text-[10px] font-medium text-positivo hover:bg-positivo/20"
                      >
                        WhatsApp
                      </a>
                    )}
                  </p>
                </article>
              ))}
              {!cartoes.length && <p className="px-2 py-6 text-center text-xs text-texto-2">Vazio</p>}
            </>
          ),
        };
      })}
    />
  );
}
