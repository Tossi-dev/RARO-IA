// Central de Alertas priorizados por R$ (SPEC-P1 Anexo B.1.2 / B.1.5).
// Regra do produto: a fila é ordenada por DINHEIRO EM JOGO, nunca por data.
// Cada linha entrega o trio problema → valor em reais → ação sugerida.

import Link from "next/link";
import { SecaoVisual } from "@/components/explicador";
import { Badge, Tabela, Td, Th, Vazio, cx } from "@/components/ui";
import { fmtBRL } from "@/lib/format";
import type { AlertaComando, SeveridadeAlerta, TipoAlerta } from "@/lib/metrics-comando";

const TOM_SEVERIDADE: Record<SeveridadeAlerta, "vermelho" | "ouro" | "verde"> = {
  critico: "vermelho",
  atencao: "ouro",
  oportunidade: "verde",
};

const LABEL_SEVERIDADE: Record<SeveridadeAlerta, string> = {
  critico: "Crítico",
  atencao: "Atenção",
  oportunidade: "Oportunidade",
};

const LABEL_TIPO: Record<TipoAlerta, string> = {
  meta: "Meta",
  caixa: "Caixa",
  cobranca: "Cobrança",
  risco: "Risco",
  rede: "Rede",
  receita: "Receita",
  custo: "Custo",
};

export function ComandoAlertas({ alertas }: { alertas: AlertaComando[] }) {
  const totalEmJogo = alertas.reduce((s, a) => s + a.valor, 0);
  const criticos = alertas.filter((a) => a.severidade === "critico").length;

  // A manchete da seção é a conclusão, não o rótulo. "3 problemas somam
  // R$ 693 mil" faz alguém agir; "Central de alertas" não faz.
  const plural = (n: number, um: string, muitos: string) => (n === 1 ? um : muitos);
  const resposta = !alertas.length
    ? "Nada pedindo ação: caixa, metas e carteira em dia no período."
    : `${alertas.length} ${plural(alertas.length, "ponto soma", "pontos somam")} ${fmtBRL(
        totalEmJogo
      )} em jogo${
        criticos
          ? `, ${criticos} ${plural(criticos, "deles crítico", "deles críticos")}`
          : ""
      }.`;

  return (
    <SecaoVisual
      pergunta="O que precisa da sua ação agora?"
      resposta={resposta}
      tom={!alertas.length ? "bom" : criticos ? "ruim" : "atencao"}
      acao={
        alertas.length ? (
          <span className="text-[11px] text-texto-3">ordenado por dinheiro em jogo</span>
        ) : null
      }
      rodape={
        alertas.length ? (
          <p>
            A fila é ordenada por <span className="text-texto-2">dinheiro em jogo</span>, nunca por
            data: o primeiro da lista é o que custa mais caro deixar parado. &quot;R$ em jogo&quot; é
            quanto se ganha resolvendo, ou se perde ignorando.
          </p>
        ) : null
      }
    >
      {alertas.length ? (
        <Tabela>
          <thead>
            <tr>
              <Th>Prioridade</Th>
              <Th>Problema</Th>
              <Th>Ação sugerida</Th>
              <Th num>R$ em jogo</Th>
            </tr>
          </thead>
          <tbody>
            {alertas.map((a, i) => (
              <tr key={a.id}>
                <Td>
                  <div className="flex items-center gap-2">
                    <span className="w-4 text-right text-xs tabular-nums text-texto-3">{i + 1}</span>
                    <Badge tom={TOM_SEVERIDADE[a.severidade]}>{LABEL_SEVERIDADE[a.severidade]}</Badge>
                  </div>
                </Td>
                <Td>
                  <Link href={a.href} className="font-medium hover:text-primaria-2">
                    {a.titulo}
                  </Link>
                  {/* A memória do alerta ("REDE · R$ 0 de R$ 480.000 · 0 venda") é
                      o que enche a tabela de texto miúdo. Some na visão simples,
                      pela mesma classe dos KPIs — o título e o valor bastam para
                      decidir, e o detalhe está na tela de destino do link. */}
                  <p className="kpi-conta mt-0.5 text-xs text-texto-3">
                    <span className="uppercase tracking-wider">{LABEL_TIPO[a.tipo]}</span> · {a.detalhe}
                  </p>
                </Td>
                <Td className="max-w-[280px] text-xs text-texto-2">{a.acao}</Td>
                <Td num>
                  <span
                    className={cx(
                      "font-display text-lg font-fino tabular-nums",
                      a.severidade === "oportunidade" ? "text-positivo" : "text-negativo"
                    )}
                  >
                    {fmtBRL(a.valor)}
                  </span>
                  <p className="text-[11px] text-texto-3">{a.rotuloValor}</p>
                </Td>
              </tr>
            ))}
          </tbody>
        </Tabela>
      ) : (
        <Vazio>Nenhum risco financeiro relevante no período. Caixa, metas e carteira em dia.</Vazio>
      )}
    </SecaoVisual>
  );
}
