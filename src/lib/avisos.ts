// Montagem (server-side) dos dados do Quadro de Avisos e do card
// Saúde do Negócio. Tudo serializável — o dock é um client component.

import { getDB } from "./data";
import {
  faixasReativacao,
  faturamentoSemanal,
  saudeNegocio,
  upsellResumo,
  type FaixaComAlunos,
  type FaturamentoSemanal,
  type SaudeNegocio,
  type UpsellResumo,
} from "./metrics";
import type { Tarefa } from "./types";

export interface ReuniaoDoDia {
  id: string;
  hora: string;
  titulo: string;
  comQuem: string;
  alunoId: string | null;
  lancamentoId: string | null;
  link: string;
}

export interface DadosAvisos {
  reunioesHoje: ReuniaoDoDia[];
  semana: FaturamentoSemanal;
  upsell: UpsellResumo;
  faixas: FaixaComAlunos[];
  tarefas: Tarefa[];
  visaoGeral: { nome: string; cor: string; qtd: number }[];
  saude: SaudeNegocio;
}

export async function montarAvisos(): Promise<DadosAvisos> {
  const db = getDB();
  const [ds, alunos, atividades, tarefas, reunioes, estagios, metas] = await Promise.all([
    db.dataset(),
    db.listAlunos(),
    db.listAtividades(),
    db.listTarefas(),
    db.listReunioes(),
    db.listEstagios(),
    db.listMetasFinanceiras(),
  ]);

  const hoje = new Date();
  const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(
    hoje.getDate()
  ).padStart(2, "0")}`;

  const reunioesHoje = reunioes
    .filter((r) => r.inicio.slice(0, 10) === hojeStr && r.status !== "cancelada")
    .map((r) => ({
      id: r.id,
      hora: r.inicio.slice(11, 16),
      titulo: r.titulo,
      comQuem: r.comQuem,
      alunoId: r.alunoId,
      lancamentoId: r.lancamentoId,
      link: r.link,
    }));

  const faixas = faixasReativacao(alunos, atividades, ds.matriculas);
  const visaoGeral = estagios.map((e) => ({
    nome: e.nome,
    cor: e.cor,
    qtd: alunos.filter((a) => a.estagioId === e.id).length,
  }));

  return {
    reunioesHoje,
    semana: faturamentoSemanal(ds),
    upsell: upsellResumo(ds),
    faixas,
    tarefas: tarefas.filter((t) => t.status === "pendente").slice(0, 8),
    visaoGeral,
    saude: saudeNegocio(alunos, ds, tarefas, reunioesHoje.length, metas, atividades),
  };
}
