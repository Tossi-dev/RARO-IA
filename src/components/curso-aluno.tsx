// Cartão de um aluno em risco — usado na seção "Alunos em risco" da
// plataforma de curso (curso-turma.tsx). Server component: só recebe o
// cálculo pronto de src/lib/metrics-curso.ts (alunosEmRisco).

import Link from "next/link";
import { Badge, ProgressBar, type Tom } from "@/components/ui";
import { fmtPct } from "@/lib/format";
import type { AlunoEmRisco, StatusEngajamento } from "@/lib/metrics-curso";

const STATUS_LABEL: Record<StatusEngajamento, string> = {
  concluido: "Concluiu",
  em_andamento: "Em andamento",
  travado: "Travado",
  nao_comecou: "Nunca abriu",
};

const STATUS_TOM: Record<StatusEngajamento, Tom> = {
  concluido: "verde",
  em_andamento: "azul",
  travado: "vermelho",
  nao_comecou: "cinza",
};

export function CursoAlunoRisco({ risco, href }: { risco: AlunoEmRisco; href: string }) {
  return (
    <Link
      href={href}
      className="superficie card-sheen trans block rounded-2xl border p-4 transition-all hover:-translate-y-px hover:shadow-e2 hover:brightness-[1.06]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-texto">{risco.alunoNome}</p>
            <Badge tom={STATUS_TOM[risco.status]}>{STATUS_LABEL[risco.status]}</Badge>
          </div>
          <ul className="mt-1.5 space-y-0.5">
            {risco.motivos.map((m) => (
              <li key={m} className="text-xs leading-snug text-texto-2">
                {m}
              </li>
            ))}
          </ul>
        </div>
        <span className="shrink-0 text-xs tabular-nums text-texto-3">{fmtPct(risco.pct)}</span>
      </div>
      <div className="mt-2.5">
        <ProgressBar pct={risco.pct} />
      </div>
    </Link>
  );
}
