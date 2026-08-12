// Estado de carregamento do modulo Financeiro.
//
// Fica ao lado do `layout.tsx` de proposito: assim a sub-navegacao continua na
// tela e SO a area de conteudo vira esqueleto. O usuario ve a aba que clicou
// ficar ativa na hora, mesmo que a leitura da planilha ainda esteja em curso.
//
// Sem este arquivo o Next mantinha a tela anterior congelada durante a
// renderizacao no servidor -- clicar em "Reembolsos" ou "Comissoes" (as duas
// telas que fazem TRES leituras da planilha, contra uma das demais) parecia nao
// abrir nada.

import { EsqueletoPagina } from "@/components/esqueleto";

export default function CarregandoFinanceiro() {
  return <EsqueletoPagina kpis={4} cards={2} />;
}
