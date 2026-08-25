export type TipoAlertaRisco = "queda_score" | "silencio" | "faltas" | "tarefas_atrasadas";
export type AlertaRisco = { tipo: TipoAlertaRisco; severidade: "baixa" | "media" | "alta"; fato: string; texto: string };
export type MentoradoRisco = { id: string; nome?: string };
export type SessaoRisco = { data: string; status: string };
export type TarefaRisco = { id: string; vencimento: string; concluida: boolean };
export type ScoreRisco = { semana: string; score: number };
export type AlertaExistente = Pick<AlertaRisco, "tipo" | "fato"> & { resolvido: boolean };

const QUEDA_MINIMA = 10;
const SILENCIO_DIAS = 14;

function dataCivil(valor: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const [ano, mes, dia] = valor.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia ? data : null;
}
function diasEntre(inicio: Date, fim: Date): number { return Math.round((fim.getTime() - inicio.getTime()) / 86_400_000); }
function chave(alerta: Pick<AlertaRisco, "tipo" | "fato">): string { return `${alerta.tipo}:${alerta.fato}`; }
function semEmoji(texto: string): string { return texto.replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\uFE0E\uFE0F\u200D\u20E3\u{E0020}-\u{E007F}]/gu, "").replace(/\s+/g, " ").trim(); }

/** Calcula alertas explicáveis com dados existentes; nenhuma regra consulta IA ou banco. */
export function alertasDe(
  _mentorado: MentoradoRisco,
  sessoes: SessaoRisco[],
  tarefas: TarefaRisco[],
  scores: ScoreRisco[],
  agoraIso: string,
  existentes: AlertaExistente[] = [],
): AlertaRisco[] {
  const hoje = dataCivil(agoraIso.slice(0, 10));
  if (!hoje) return [];
  const existentesPorFato = new Set(existentes.map(chave));
  const resultado: AlertaRisco[] = [];
  const incluir = (alerta: AlertaRisco) => { if (!existentesPorFato.has(chave(alerta)) && !resultado.some((item) => chave(item) === chave(alerta))) resultado.push(alerta); };

  const scoresValidos = scores
    .map((item) => ({ ...item, data: dataCivil(item.semana) }))
    .filter((item): item is ScoreRisco & { data: Date } => item.data !== null && Number.isFinite(item.score))
    .sort((a, b) => a.data.getTime() - b.data.getTime());
  for (let indice = 1; indice < scoresValidos.length; indice++) {
    const anterior = scoresValidos[indice - 1];
    const atual = scoresValidos[indice];
    if (diasEntre(anterior.data, atual.data) === 7 && anterior.score - atual.score >= QUEDA_MINIMA) {
      incluir({ tipo: "queda_score", severidade: "alta", fato: `score:${anterior.semana}:${anterior.score}:${atual.semana}:${atual.score}`, texto: `O score caiu de ${anterior.score} para ${atual.score} em semanas consecutivas.` });
    }
  }

  const sessoesValidas = sessoes
    .map((item) => ({ ...item, civil: dataCivil(item.data) }))
    .filter((item): item is SessaoRisco & { civil: Date } => item.civil !== null)
    .sort((a, b) => a.civil.getTime() - b.civil.getTime());
  const ultima = sessoesValidas.at(-1);
  if (ultima && diasEntre(ultima.civil, hoje) > SILENCIO_DIAS) incluir({ tipo: "silencio", severidade: "media", fato: `silencio:${ultima.data}`, texto: `Não há sessão registrada desde ${ultima.data}.` });
  for (let indice = 1; indice < sessoesValidas.length; indice++) {
    const anterior = sessoesValidas[indice - 1];
    const atual = sessoesValidas[indice];
    if (anterior.status === "faltou" && atual.status === "faltou") incluir({ tipo: "faltas", severidade: "alta", fato: `faltas:${anterior.data}:${atual.data}`, texto: `Duas faltas seguidas foram registradas em ${anterior.data} e ${atual.data}.` });
  }

  for (const tarefa of tarefas) {
    const vencimento = dataCivil(tarefa.vencimento);
    const id = semEmoji(tarefa.id);
    if (!tarefa.concluida && vencimento && vencimento < hoje) incluir({ tipo: "tarefas_atrasadas", severidade: "media", fato: `tarefa:${id}:${tarefa.vencimento}`, texto: `A tarefa ${id} venceu em ${tarefa.vencimento} sem conclusão.` });
  }
  return resultado;
}
