// ============================================================
// Plataforma de curso — matemática exclusiva da aba "Turma & progresso"
// de /lancamentos/[id] (trilha módulo → aula → progresso do aluno, e
// presença nos encontros ao vivo da turma).
//
// Módulo NEUTRO (sem "use client"): a página monta os dados (matrículas,
// módulos, aulas, progresso, encontros) e chama estas funções — a regra do
// pacote é "a página não calcula". `hoje` sempre entra por parâmetro, nunca
// `new Date()` escondido aqui dentro, para as funções continuarem puras e
// os testes não dependerem do relógio da máquina.
//
// O QUE OS DADOS PERMITEM MEDIR — E O QUE NÃO PERMITEM
// `ProgressoAula` só carrega `concluidaEm` (quando a aula foi concluída).
// Não existe carimbo de "último acesso" para quem apenas abriu uma aula sem
// terminar. Por isso todo cálculo de recência aqui usa a ÚLTIMA CONCLUSÃO,
// não "última visita" — e o texto exposto ao usuário (CRITERIO_TRAVADO) diz
// isso com todas as letras, em vez de fingir uma métrica de acesso que a
// plataforma não coleta.
// ============================================================

import type { Aula, Encontro, Modulo, ProgressoAula } from "./types";

const r1 = (v: number) => Math.round(v * 10) / 10;

// ----------------------------------------------------------------
// Critérios de negócio — exportados para a TELA citar o mesmo número que
// o cálculo usa. Critério escondido é critério que ninguém confere.
// ----------------------------------------------------------------

/** Sem concluir nenhuma aula nova há N dias (e sem ter terminado a trilha) = travado. */
export const DIAS_SEM_CONCLUSAO_TRAVADO = 14;

/** Quantos pontos percentuais abaixo da média da turma já vira sinal de risco. */
export const PP_ABAIXO_DA_MEDIA_RISCO = 30;

export const CRITERIO_TRAVADO =
  `"Travado" é o aluno que já abriu o curso (tem pelo menos um registro de ` +
  `progresso) mas não conclui nenhuma aula nova há ${DIAS_SEM_CONCLUSAO_TRAVADO} ` +
  `dias ou mais, e ainda não terminou a trilha. Sem carimbo de conclusão nenhum, ` +
  `entra como travado desde o início — a plataforma só registra QUANDO uma aula ` +
  `é concluída, não quando o aluno só abriu e não terminou.`;

export const CRITERIO_RISCO =
  `"Em risco" reúne três sinais — o motivo na tela diz qual bateu: nunca abriu o ` +
  `curso; está travado (${DIAS_SEM_CONCLUSAO_TRAVADO}+ dias sem concluir uma aula, ` +
  `parado no mesmo módulo); ou está ${PP_ABAIXO_DA_MEDIA_RISCO} pontos percentuais ` +
  `ou mais abaixo do progresso médio da turma. Quem já concluiu a trilha nunca entra.`;

export interface AlunoRosterItem {
  alunoId: string;
  alunoNome: string;
}

export type StatusEngajamento = "nao_comecou" | "travado" | "em_andamento" | "concluido";

export interface ProgressoAluno {
  alunoId: string;
  alunoNome: string;
  totalAulas: number;
  concluidas: number;
  pct: number;
  /** Maior `concluidaEm` entre as aulas concluídas — null se nunca concluiu nenhuma. */
  ultimaConclusao: string | null;
  /** Dias entre `ultimaConclusao` e `hoje` — null quando `ultimaConclusao` é null. */
  diasSemConcluir: number | null;
  moduloAtualId: string | null;
  moduloAtualNome: string | null;
  status: StatusEngajamento;
}

/** Aulas na ordem da trilha: primeiro pela ordem do módulo, depois pela ordem da aula. */
function ordenarAulasDaTrilha(modulos: Modulo[], aulas: Aula[]): Aula[] {
  const ordemModulo = new Map(modulos.map((m) => [m.id, m.ordem]));
  return [...aulas].sort((a, b) => {
    const oa = ordemModulo.get(a.moduloId) ?? 0;
    const ob = ordemModulo.get(b.moduloId) ?? 0;
    return oa !== ob ? oa - ob : a.ordem - b.ordem;
  });
}

/** Dias corridos entre duas datas ISO (positivo quando `referenciaIso` é depois de `dataIso`). */
export function diasEntre(dataIso: string, referenciaIso: string): number {
  const d = Date.parse(`${dataIso.slice(0, 10)}T00:00:00`);
  const r = Date.parse(`${referenciaIso.slice(0, 10)}T00:00:00`);
  return Math.round((r - d) / 86_400_000);
}

/**
 * Progresso de cada aluno do roster na trilha do produto. É a base de que
 * TODAS as outras funções deste módulo partem — nenhuma delas relê
 * `progresso`/`aulas` do zero por conta própria.
 */
export function progressoDaTurma(
  roster: AlunoRosterItem[],
  modulos: Modulo[],
  aulas: Aula[],
  progresso: ProgressoAula[],
  hoje: string
): ProgressoAluno[] {
  const aulasOrdenadas = ordenarAulasDaTrilha(modulos, aulas);
  const totalAulas = aulasOrdenadas.length;
  const moduloPorId = new Map(modulos.map((m) => [m.id, m]));

  return roster.map(({ alunoId, alunoNome }) => {
    const meus = progresso.filter((p) => p.alunoId === alunoId);
    const concluidasIds = new Set(meus.filter((p) => p.concluida).map((p) => p.aulaId));
    const concluidas = aulasOrdenadas.filter((a) => concluidasIds.has(a.id)).length;
    const pct = totalAulas ? r1((concluidas / totalAulas) * 100) : 0;

    const datasConclusao = meus
      .filter((p) => p.concluida && p.concluidaEm)
      .map((p) => p.concluidaEm as string);
    const ultimaConclusao = datasConclusao.length
      ? datasConclusao.reduce((a, b) => (a > b ? a : b))
      : null;
    const diasSemConcluir = ultimaConclusao ? diasEntre(ultimaConclusao, hoje) : null;

    const abriu = meus.length > 0;
    const proximaPendente = aulasOrdenadas.find((a) => !concluidasIds.has(a.id));
    const moduloAtual = proximaPendente ? (moduloPorId.get(proximaPendente.moduloId) ?? null) : null;

    let status: StatusEngajamento;
    if (!abriu) {
      status = "nao_comecou";
    } else if (totalAulas > 0 && concluidas >= totalAulas) {
      status = "concluido";
    } else if (diasSemConcluir === null || diasSemConcluir >= DIAS_SEM_CONCLUSAO_TRAVADO) {
      // `diasSemConcluir === null` = abriu a trilha mas nunca concluiu uma
      // aula sequer; sem carimbo para medir recência, o critério trata como
      // travado desde já (ver nota de topo do arquivo).
      status = "travado";
    } else {
      status = "em_andamento";
    }

    return {
      alunoId,
      alunoNome,
      totalAulas,
      concluidas,
      pct,
      ultimaConclusao,
      diasSemConcluir,
      moduloAtualId: moduloAtual?.id ?? null,
      moduloAtualNome: moduloAtual?.nome ?? null,
      status,
    };
  });
}

// ----------------------------------------------------------------
// 1) Saúde da turma
// ----------------------------------------------------------------

export interface SaudeTurma {
  totalAlunos: number;
  progressoMedioPct: number;
  concluiram: number;
  emAndamento: number;
  travados: number;
  naoComecaram: number;
}

export function saudeTurma(porAluno: ProgressoAluno[]): SaudeTurma {
  const totalAlunos = porAluno.length;
  const progressoMedioPct = totalAlunos
    ? r1(porAluno.reduce((soma, p) => soma + p.pct, 0) / totalAlunos)
    : 0;
  return {
    totalAlunos,
    progressoMedioPct,
    concluiram: porAluno.filter((p) => p.status === "concluido").length,
    emAndamento: porAluno.filter((p) => p.status === "em_andamento").length,
    travados: porAluno.filter((p) => p.status === "travado").length,
    naoComecaram: porAluno.filter((p) => p.status === "nao_comecou").length,
  };
}

// ----------------------------------------------------------------
// 2) Funil por módulo
// ----------------------------------------------------------------

export interface FunilModulo {
  moduloId: string;
  nome: string;
  ordem: number;
  totalAulas: number;
  /** Alunos do roster que concluíram TODAS as aulas deste módulo. */
  concluiram: number;
  pct: number;
  /** Módulo cadastrado sem nenhuma aula — não dá para dizer quem "passou". */
  semAula: boolean;
}

export function funilPorModulo(
  roster: AlunoRosterItem[],
  modulos: Modulo[],
  aulas: Aula[],
  progresso: ProgressoAula[]
): FunilModulo[] {
  const modulosOrdenados = [...modulos].sort((a, b) => a.ordem - b.ordem);
  return modulosOrdenados.map((m) => {
    const aulasDoModulo = aulas.filter((a) => a.moduloId === m.id);
    if (aulasDoModulo.length === 0) {
      return {
        moduloId: m.id,
        nome: m.nome,
        ordem: m.ordem,
        totalAulas: 0,
        concluiram: 0,
        pct: 0,
        semAula: true,
      };
    }
    const idsAulas = aulasDoModulo.map((a) => a.id);
    const concluiram = roster.filter(({ alunoId }) => {
      const concluidasDoAluno = new Set(
        progresso.filter((p) => p.alunoId === alunoId && p.concluida).map((p) => p.aulaId)
      );
      return idsAulas.every((id) => concluidasDoAluno.has(id));
    }).length;
    return {
      moduloId: m.id,
      nome: m.nome,
      ordem: m.ordem,
      totalAulas: aulasDoModulo.length,
      concluiram,
      pct: roster.length ? r1((concluiram / roster.length) * 100) : 0,
      semAula: false,
    };
  });
}

// ----------------------------------------------------------------
// 3) Alunos em risco
// ----------------------------------------------------------------

export interface AlunoEmRisco {
  alunoId: string;
  alunoNome: string;
  pct: number;
  status: StatusEngajamento;
  diasSemConcluir: number | null;
  moduloAtualNome: string | null;
  /** Cada motivo já em português, pronto para a tela. */
  motivos: string[];
  /** Só serve para ordenar — não é exibido. Maior = mais urgente. */
  score: number;
}

export function alunosEmRisco(porAluno: ProgressoAluno[]): AlunoEmRisco[] {
  // a média só considera quem tem trilha para comparar (totalAulas > 0);
  // com totalAulas = 0 (produto sem conteúdo) ninguém entra na conta.
  const comTrilha = porAluno.filter((p) => p.totalAulas > 0);
  const mediaTurma = comTrilha.length
    ? r1(comTrilha.reduce((s, p) => s + p.pct, 0) / comTrilha.length)
    : 0;

  const linhas: AlunoEmRisco[] = [];
  for (const p of porAluno) {
    if (p.status === "concluido") continue; // quem terminou não é risco
    const motivos: string[] = [];
    let score = 0;

    if (p.status === "nao_comecou") {
      motivos.push("Comprou e nunca abriu o curso");
      score += 1000;
    } else if (p.status === "travado") {
      const dias = p.diasSemConcluir;
      motivos.push(
        dias === null
          ? `Abriu o curso mas nunca concluiu uma aula — parado em "${p.moduloAtualNome ?? "—"}"`
          : `Sem concluir aula há ${dias} dias — parado em "${p.moduloAtualNome ?? "—"}"`
      );
      score += 500 + (dias ?? 365);
    }

    const abaixoDaMedia = r1(mediaTurma - p.pct);
    if (p.status !== "nao_comecou" && abaixoDaMedia >= PP_ABAIXO_DA_MEDIA_RISCO) {
      motivos.push(`${abaixoDaMedia} pontos percentuais abaixo da média da turma (${mediaTurma}%)`);
      score += abaixoDaMedia;
    }

    if (motivos.length === 0) continue;
    linhas.push({
      alunoId: p.alunoId,
      alunoNome: p.alunoNome,
      pct: p.pct,
      status: p.status,
      diasSemConcluir: p.diasSemConcluir,
      moduloAtualNome: p.moduloAtualNome,
      motivos,
      score,
    });
  }
  return linhas.sort((a, b) => b.score - a.score);
}

// ----------------------------------------------------------------
// 4) Mapa de progresso (alunos × módulos)
// ----------------------------------------------------------------

export type StatusCelula = "concluido" | "em_andamento" | "nao_comecado";

export interface LinhaMapa {
  alunoId: string;
  alunoNome: string;
  pctGeral: number;
  celulas: Record<string, StatusCelula>; // moduloId -> status
}

export interface MapaProgresso {
  modulos: Array<{ id: string; nome: string; ordem: number }>;
  linhas: LinhaMapa[];
}

export function mapaProgresso(
  roster: AlunoRosterItem[],
  modulos: Modulo[],
  aulas: Aula[],
  progresso: ProgressoAula[],
  porAluno: ProgressoAluno[]
): MapaProgresso {
  const modulosOrdenados = [...modulos].sort((a, b) => a.ordem - b.ordem);
  const pctPorAluno = new Map(porAluno.map((p) => [p.alunoId, p.pct]));

  const linhas = roster.map(({ alunoId, alunoNome }) => {
    const doAluno = progresso.filter((p) => p.alunoId === alunoId);
    const concluidasDoAluno = new Set(doAluno.filter((p) => p.concluida).map((p) => p.aulaId));
    const tocadasDoAluno = new Set(doAluno.map((p) => p.aulaId));

    const celulas: Record<string, StatusCelula> = {};
    for (const m of modulosOrdenados) {
      const aulasDoModulo = aulas.filter((a) => a.moduloId === m.id);
      if (aulasDoModulo.length === 0) {
        celulas[m.id] = "nao_comecado";
        continue;
      }
      const todasConcluidas = aulasDoModulo.every((a) => concluidasDoAluno.has(a.id));
      const algumaTocada = aulasDoModulo.some((a) => tocadasDoAluno.has(a.id));
      celulas[m.id] = todasConcluidas ? "concluido" : algumaTocada ? "em_andamento" : "nao_comecado";
    }
    return { alunoId, alunoNome, pctGeral: pctPorAluno.get(alunoId) ?? 0, celulas };
  });

  return {
    modulos: modulosOrdenados.map((m) => ({ id: m.id, nome: m.nome, ordem: m.ordem })),
    linhas,
  };
}

// ----------------------------------------------------------------
// 5) Presença nos encontros
// ----------------------------------------------------------------

export interface PresencaEncontro {
  id: string;
  titulo: string;
  data: string;
  presentes: number;
  totalConvocados: number;
  pct: number;
}

export function presencaEncontros(encontros: Encontro[], totalTurma: number): PresencaEncontro[] {
  return [...encontros]
    .sort((a, b) => a.data.localeCompare(b.data))
    .map((e) => ({
      id: e.id,
      titulo: e.titulo,
      data: e.data,
      presentes: e.presentes.length,
      totalConvocados: totalTurma,
      pct: totalTurma ? r1((e.presentes.length / totalTurma) * 100) : 0,
    }));
}

// ----------------------------------------------------------------
// 6) Conteúdo do curso
// ----------------------------------------------------------------

export interface AulaConteudo {
  id: string;
  titulo: string;
  ordem: number;
  tipo: Aula["tipo"];
  duracaoMin: number;
  concluidosCount: number;
  pctConcluido: number;
}

export interface ModuloConteudo {
  id: string;
  nome: string;
  ordem: number;
  descricao: string;
  duracaoTotalMin: number;
  aulas: AulaConteudo[];
}

export function conteudoDoCurso(
  modulos: Modulo[],
  aulas: Aula[],
  progresso: ProgressoAula[],
  totalAlunos: number
): ModuloConteudo[] {
  const modulosOrdenados = [...modulos].sort((a, b) => a.ordem - b.ordem);
  return modulosOrdenados.map((m) => {
    const aulasDoModulo = aulas.filter((a) => a.moduloId === m.id).sort((a, b) => a.ordem - b.ordem);
    const aulasView = aulasDoModulo.map((a) => {
      const concluidosCount = progresso.filter((p) => p.aulaId === a.id && p.concluida).length;
      return {
        id: a.id,
        titulo: a.titulo,
        ordem: a.ordem,
        tipo: a.tipo,
        duracaoMin: a.duracaoMin,
        concluidosCount,
        pctConcluido: totalAlunos ? r1((concluidosCount / totalAlunos) * 100) : 0,
      };
    });
    return {
      id: m.id,
      nome: m.nome,
      ordem: m.ordem,
      descricao: m.descricao,
      duracaoTotalMin: aulasDoModulo.reduce((s, a) => s + a.duracaoMin, 0),
      aulas: aulasView,
    };
  });
}
