// Estado de carregamento geral do app (dashboard, CRM, conteudo,
// integracoes). O modulo Financeiro tem o seu proprio, mais especifico.
//
// Toda tela do sistema e `force-dynamic` e le a planilha no servidor. Sem
// fronteira de carregamento, cada navegacao deixava a tela anterior parada sem
// aviso nenhum.

import { EsqueletoPagina } from "@/components/esqueleto";

export default function Carregando() {
  return <EsqueletoPagina kpis={4} cards={2} />;
}
