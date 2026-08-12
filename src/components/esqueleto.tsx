// Esqueletos de carregamento -- o que aparece enquanto o servidor busca a
// planilha.
//
// MODULO NEUTRO (sem "use client"): so markup, consumido pelos `loading.tsx`,
// que sao Server Components.
//
// Por que isso existe: toda tela do financeiro e `force-dynamic` e le o Google
// Sheets no servidor. Sem um `loading.tsx` irmao, o Next mantem a TELA ANTERIOR
// congelada na frente do usuario enquanto renderiza a proxima -- o clique parece
// nao ter feito nada. As telas mais pesadas (as que fazem tres leituras em vez
// de uma) sao justamente as que mais parecem quebradas. O esqueleto nao deixa a
// pagina mais rapida; deixa a espera VISIVEL, que e o que faltava.

/** Barra shimmer isolada. `className` controla altura e largura. */
export function Barra({ className = "h-4 w-full" }: { className?: string }) {
  return <div aria-hidden className={`skeleton ${className}`} />;
}

/** Cabecalho de pagina: titulo + subtitulo. */
export function EsqueletoCabecalho() {
  return (
    <div className="mb-6">
      <Barra className="h-7 w-56 rounded-lg" />
      <Barra className="mt-2 h-4 w-80 rounded" />
    </div>
  );
}

/** Faixa de KPIs. `n` = quantos cartoes. */
export function EsqueletoKpis({ n = 4 }: { n?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="rounded-xl border border-borda bg-painel p-4">
          <Barra className="h-3 w-24 rounded" />
          <Barra className="mt-3 h-8 w-32 rounded-lg" />
          <Barra className="mt-3 h-3 w-40 rounded" />
        </div>
      ))}
    </div>
  );
}

/** Card com area de grafico. `altura` em px. */
export function EsqueletoCard({ altura = 200 }: { altura?: number }) {
  return (
    <div className="rounded-xl border border-borda bg-painel p-4">
      <Barra className="h-3 w-40 rounded" />
      <div className="mt-3" style={{ height: altura }}>
        <Barra className="h-full w-full rounded-lg" />
      </div>
    </div>
  );
}

/**
 * Esqueleto padrao de uma tela do financeiro. `aviso` e o texto honesto sobre a
 * espera: quem le a planilha em tempo real demora mesmo, e dizer isso e melhor
 * do que fingir instantaneidade.
 */
export function EsqueletoPagina({
  kpis = 4,
  cards = 2,
  aviso = "Lendo a planilha do dono agora — os numeros aparecem em seguida.",
}: {
  kpis?: number;
  cards?: number;
  aviso?: string;
}) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Carregando os dados da planilha.</span>
      <EsqueletoCabecalho />
      <EsqueletoKpis n={kpis} />
      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {Array.from({ length: cards }, (_, i) => (
          <EsqueletoCard key={i} />
        ))}
      </div>
      <p className="mt-4 text-center text-xs text-texto-3">{aviso}</p>
    </div>
  );
}
