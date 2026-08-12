// Timeline unificada de atividades do aluno (padrão Activities do frappe/crm):
// compras, notas, WhatsApp, ligações, e-mails, reuniões e eventos de sistema.

import { ATIVIDADE_LABEL } from "@/lib/domain";
import type { Atividade } from "@/lib/types";

function fmtDataHora(iso: string): string {
  const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.toLocaleDateString("pt-BR")} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

export function Timeline({ atividades }: { atividades: Atividade[] }) {
  if (!atividades.length) {
    return (
      <p className="rounded-lg border border-dashed border-borda px-4 py-8 text-center text-sm text-texto-2">
        Nenhuma atividade registrada ainda.
      </p>
    );
  }
  return (
    <ol className="relative space-y-3 border-l border-borda pl-5">
      {atividades.map((a) => (
        <li key={a.id} className="relative">
          <span
            aria-hidden
            className="absolute -left-[27px] top-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-borda bg-painel text-[10px] text-texto-3"
          >
            •
          </span>
          <p className="text-sm">
            <span className="font-medium">{a.titulo}</span>{" "}
            <span className="text-xs text-texto-2">
              · {ATIVIDADE_LABEL[a.tipo]} · {fmtDataHora(a.data)}
            </span>
          </p>
          {a.detalhe ? <p className="mt-0.5 text-sm text-texto-2">{a.detalhe}</p> : null}
        </li>
      ))}
    </ol>
  );
}
