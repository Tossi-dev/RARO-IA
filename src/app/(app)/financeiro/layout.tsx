// Casca do módulo Financeiro: sub-navegação comum a todas as telas.
// A /financeiro raiz (resultado do ano, orçamento, metas) segue intacta —
// as telas de caixa/DRE do P1 entram como irmãs, não como substitutas.

import type { ReactNode } from "react";
import { FinSubnav } from "@/components/fin-subnav";

export default function FinanceiroLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <FinSubnav />
      {children}
    </div>
  );
}
