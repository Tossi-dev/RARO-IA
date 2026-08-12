// Faixa que declara DE ONDE VEM o número que está na tela.
//
// Princípio (herdado do LA Beauty): dado fictício jamais se disfarça de dado
// real. O que mudou: "sem Supabase" deixou de significar "demonstração". A
// planilha do Google também é base de dados real, e a falta de configuração
// virou um estado próprio, então são QUATRO estados distintos — vazio,
// demonstração, planilha e Supabase — e a faixa precisa dizer qual deles está
// valendo, em vez de empurrar todo mundo para "conecte o Supabase".
//
// Módulo NEUTRO (sem "use client"): ele chama `modoDados()`, que lê variáveis de
// ambiente no servidor. Marcar este arquivo como cliente daria 500 em runtime
// com o build ainda verde.
//
// ESTADO DE USO: nenhum arquivo renderiza este componente hoje — layout.tsx,
// login/page.tsx e topbar.tsx montam a própria faixa a partir de `modoDados()`.
// Ele fica aqui correto e pronto, para que voltar a usá-lo não reintroduza a
// equação errada.

import { modoDados } from "@/lib/data";

/** Cor e texto de cada modo. Vazio e demonstração são aviso; os outros, informação. */
const FAIXA = {
  vazio: "border-aviso/30 bg-aviso/10 text-aviso",
  demo: "border-ouro/30 bg-ouro/10 text-ouro",
  planilha: "border-info/30 bg-info/10 text-info",
  supabase: "border-positivo/30 bg-positivo/10 text-positivo",
} as const;

export function DemoBanner() {
  const modo = modoDados();

  return (
    <div className={`border-b px-4 py-1.5 text-center text-xs ${FAIXA[modo]}`}>
      {modo === "vazio" ? (
        <>
          <strong>Sem base conectada</strong> — o app não tem de onde ler número nenhum, e por isso
          não mostra nenhum. Ligue a planilha do Google (
          <code className="font-mono">RARO_SHEETS_ID</code>) ou o Supabase (
          <code className="font-mono">.env.local</code>). Só para conhecer a interface com dados
          fictícios, use <code className="font-mono">RARO_MODO=demo</code>.
        </>
      ) : modo === "demo" ? (
        <>
          <strong>Modo demonstração</strong> — todos os dados são fictícios. Para operar com dados
          reais, ligue uma das duas bases: a planilha do Google (
          <code className="font-mono">RARO_SHEETS_ID</code>, ver{" "}
          <code className="font-mono">docs/PUBLICAR-APPS-SCRIPT.md</code>) ou o Supabase (
          <code className="font-mono">.env.local</code>, ver{" "}
          <code className="font-mono">supabase/README.md</code>).
        </>
      ) : modo === "planilha" ? (
        <>
          <strong>Base no Google Sheets</strong> — os números vêm da planilha
          Base_Financeira_Operacao do dono, não de dados fictícios. Aba vazia aparece vazia de
          verdade.
        </>
      ) : (
        <>
          <strong>Base no Supabase</strong> — os números vêm do banco. O modo demonstração está
          desligado.
        </>
      )}
    </div>
  );
}
