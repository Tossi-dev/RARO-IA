// Plataforma de curso da turma — as seis perguntas que um gestor de turma
// confere todo dia: a turma anda, onde ela trava, quem está em risco, o mapa
// aluno×módulo, a presença nos encontros e o inventário do conteúdo.
// Server component: só recebe o cálculo pronto de src/lib/metrics-curso.ts —
// esta tela não soma, não filtra e não decide status, só desenha.

import Link from "next/link";
import { GraficoBarrasH } from "@/components/charts";
import { CursoAlunoRisco } from "@/components/curso-aluno";
import { SecaoVisual } from "@/components/explicador";
import { Badge, ProgressBar, Tabela, Td, Th, Vazio, cx, type Tom } from "@/components/ui";
import { fmtDate, fmtNum, fmtPct } from "@/lib/format";
import {
  CRITERIO_RISCO,
  CRITERIO_TRAVADO,
  type AlunoEmRisco,
  type FunilModulo,
  type MapaProgresso,
  type ModuloConteudo,
  type PresencaEncontro,
  type SaudeTurma,
  type StatusCelula,
} from "@/lib/metrics-curso";
import type { Aula } from "@/lib/types";

const AULA_TIPO_LABEL: Record<Aula["tipo"], string> = {
  video: "Vídeo",
  texto: "Leitura",
  ao_vivo: "Ao vivo",
  tarefa: "Tarefa",
};

const CELULA_GLIFO: Record<StatusCelula, string> = {
  concluido: "▲",
  em_andamento: "▬",
  nao_comecado: "·",
};

const CELULA_COR: Record<StatusCelula, string> = {
  concluido: "text-positivo",
  em_andamento: "text-ouro",
  nao_comecado: "text-texto-3",
};

const CELULA_LABEL: Record<StatusCelula, string> = {
  concluido: "Concluído",
  em_andamento: "Em andamento",
  nao_comecado: "Não começou",
};

/** '95' → '1h 35min' — só usado para exibir duração de trilha, sem depender de format.ts (que não cobre minutos). */
function fmtDuracaoMin(min: number): string {
  if (min <= 0) return "0min";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}min`;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}

function Tile({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-xl border border-borda-sutil bg-painel-2 p-3.5">
      <p className="text-[11px] font-medium uppercase tracking-wider text-texto-3">{label}</p>
      <p className="mt-1 kpi-valor-medio font-display font-fino tabular-nums text-texto">{valor}</p>
    </div>
  );
}

// ---------- 1) Saúde da turma ----------

function SecaoSaudeTurma({ turmaNome, saude }: { turmaNome: string; saude: SaudeTurma }) {
  const semEngajamento = saude.travados + saude.naoComecaram;
  const comEngajamento = saude.concluiram + saude.emAndamento;
  const tom = saude.totalAlunos === 0 ? "neutro" : semEngajamento > comEngajamento ? "atencao" : "bom";
  const resposta = `${fmtPct(saude.progressoMedioPct)} de progresso médio na turma ${turmaNome}: ${saude.concluiram} de ${saude.totalAlunos} já concluíram, ${saude.travados} estão travados e ${saude.naoComecaram} nunca abriram o curso.`;

  return (
    <SecaoVisual
      pergunta={`A turma ${turmaNome} está andando?`}
      resposta={resposta}
      tom={tom}
      rodape={CRITERIO_TRAVADO}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Progresso médio" valor={fmtPct(saude.progressoMedioPct)} />
        <Tile label="Concluíram" valor={fmtNum(saude.concluiram)} />
        <Tile label="Travados" valor={fmtNum(saude.travados)} />
        <Tile label="Nunca abriram" valor={fmtNum(saude.naoComecaram)} />
      </div>
      <div className="mt-4">
        <ProgressBar pct={saude.progressoMedioPct} />
      </div>
    </SecaoVisual>
  );
}

// ---------- 2) Funil por módulo ----------

function SecaoFunilModulo({ funil, totalAlunos }: { funil: FunilModulo[]; totalAlunos: number }) {
  const comAula = funil.filter((f) => !f.semAula);
  const semAula = funil.filter((f) => f.semAula);

  let resposta: string;
  if (comAula.length === 0) {
    resposta = "Nenhum módulo com aula cadastrada ainda — sem aula não há como medir onde a turma trava.";
  } else if (comAula.every((f) => f.concluiram === 0)) {
    resposta = `Ninguém da turma terminou nem "${comAula[0].nome}" ainda.`;
  } else {
    let pior = { i: -1, queda: -Infinity };
    for (let i = 0; i < comAula.length - 1; i++) {
      const queda = comAula[i].concluiram - comAula[i + 1].concluiram;
      if (queda > pior.queda) pior = { i, queda };
    }
    resposta =
      pior.i >= 0 && pior.queda > 0
        ? `A maior queda acontece entre "${comAula[pior.i].nome}" e "${comAula[pior.i + 1].nome}": ${fmtNum(pior.queda)} aluno(s) somem no caminho.`
        : `A turma avança sem queda forte entre módulos — ${fmtNum(comAula[0].concluiram)} de ${fmtNum(totalAlunos)} já passaram do primeiro módulo.`;
  }

  return (
    <SecaoVisual
      pergunta="Onde a turma trava?"
      resposta={resposta}
      rodape={
        <>
          Conta como &quot;passou do módulo&quot; quem concluiu TODAS as aulas dele.
          {semAula.length > 0 && (
            <>
              {" "}
              Fora do gráfico por não ter aula cadastrada: {semAula.map((f) => `"${f.nome}"`).join(", ")}.
            </>
          )}
        </>
      }
    >
      {comAula.length === 0 ? (
        <Vazio>Cadastre aulas nos módulos deste produto para o funil aparecer.</Vazio>
      ) : (
        <GraficoBarrasH data={comAula.map((f) => ({ nome: f.nome, valor: f.concluiram }))} formato="num" />
      )}
    </SecaoVisual>
  );
}

// ---------- 3) Alunos em risco ----------

function SecaoAlunosEmRisco({
  risco,
  crmHref,
}: {
  risco: AlunoEmRisco[];
  crmHref: (alunoId: string) => string;
}) {
  const resposta =
    risco.length === 0
      ? "Nenhum aluno em risco agora — quem não terminou ainda está dentro do prazo e do ritmo da turma."
      : `${fmtNum(risco.length)} aluno(s) em risco nesta turma, ordenados pela urgência.`;

  return (
    <SecaoVisual pergunta="Quem precisa de atenção agora?" resposta={resposta} tom={risco.length ? "atencao" : "bom"} rodape={CRITERIO_RISCO}>
      {risco.length === 0 ? (
        <Vazio>Ninguém em risco pelos critérios acima.</Vazio>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {risco.map((r) => (
            <CursoAlunoRisco key={r.alunoId} risco={r} href={crmHref(r.alunoId)} />
          ))}
        </div>
      )}
    </SecaoVisual>
  );
}

// ---------- 4) Mapa de progresso ----------

function SecaoMapaProgresso({ mapa, crmHref }: { mapa: MapaProgresso; crmHref: (alunoId: string) => string }) {
  const linhasOrdenadas = [...mapa.linhas].sort((a, b) => a.pctGeral - b.pctGeral);
  const resposta =
    mapa.linhas.length === 0
      ? "Sem aluno matriculado para desenhar o mapa."
      : `Mapa de ${fmtNum(mapa.linhas.length)} aluno(s) × ${fmtNum(mapa.modulos.length)} módulo(s) — quem está mais atrás aparece primeiro.`;

  return (
    <SecaoVisual pergunta="Quem está em qual módulo, célula a célula?" resposta={resposta}>
      {mapa.linhas.length === 0 || mapa.modulos.length === 0 ? (
        <Vazio>Sem módulo ou sem aluno matriculado para montar o mapa.</Vazio>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-texto-2">
            <span>
              <span className="text-positivo">▲</span> concluído
            </span>
            <span>
              <span className="text-ouro">▬</span> em andamento
            </span>
            <span>
              <span className="text-texto-3">·</span> não começou
            </span>
          </div>
          <Tabela>
            <thead>
              <tr>
                <Th>Aluno</Th>
                {mapa.modulos.map((m) => (
                  <Th key={m.id}>{m.nome}</Th>
                ))}
                <Th num>Progresso</Th>
              </tr>
            </thead>
            <tbody>
              {linhasOrdenadas.map((linha) => (
                <tr key={linha.alunoId}>
                  <Td>
                    <Link className="hover:text-primaria-2" href={crmHref(linha.alunoId)}>
                      {linha.alunoNome}
                    </Link>
                  </Td>
                  {mapa.modulos.map((m) => {
                    const status = linha.celulas[m.id];
                    return (
                      <Td key={m.id} className="text-center">
                        <span aria-label={CELULA_LABEL[status]} className={cx("text-base", CELULA_COR[status])}>
                          {CELULA_GLIFO[status]}
                        </span>
                      </Td>
                    );
                  })}
                  <Td num>{fmtPct(linha.pctGeral)}</Td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        </>
      )}
    </SecaoVisual>
  );
}

// ---------- 5) Presença nos encontros ----------

function SecaoPresencaEncontros({ presencas }: { presencas: PresencaEncontro[] }) {
  const mediaPresenca = presencas.length
    ? Math.round(
        (presencas.reduce((s, p) => s + p.pct, 0) / presencas.length) * 10
      ) / 10
    : 0;
  const resposta =
    presencas.length === 0
      ? "Nenhum encontro ao vivo registrado ainda para esta turma."
      : `${fmtPct(mediaPresenca)} de presença média nos ${fmtNum(presencas.length)} encontro(s) já realizados.`;

  return (
    <SecaoVisual pergunta="A turma comparece aos encontros ao vivo?" resposta={resposta}>
      {presencas.length === 0 ? (
        <Vazio>Marque um encontro para começar a registrar presença.</Vazio>
      ) : (
        <ul className="space-y-2.5">
          {presencas.map((p) => (
            <li key={p.id} className="rounded-xl border border-borda-sutil bg-painel-2 p-3.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-sm font-medium text-texto">{p.titulo}</span>
                <span className="text-xs text-texto-2">{fmtDate(p.data.slice(0, 10))}</span>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <div className="flex-1">
                  <ProgressBar pct={p.pct} />
                </div>
                <span className="shrink-0 text-xs tabular-nums text-texto-2">
                  {p.presentes}/{p.totalConvocados} · {fmtPct(p.pct)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SecaoVisual>
  );
}

// ---------- 6) Conteúdo do curso ----------

function SecaoConteudoCurso({ conteudo, totalAlunos }: { conteudo: ModuloConteudo[]; totalAlunos: number }) {
  const totalAulas = conteudo.reduce((s, m) => s + m.aulas.length, 0);
  const duracaoTotal = conteudo.reduce((s, m) => s + m.duracaoTotalMin, 0);
  const resposta =
    conteudo.length === 0
      ? "Nenhum módulo cadastrado para este curso."
      : `${fmtNum(conteudo.length)} módulo(s), ${fmtNum(totalAulas)} aula(s), ${fmtDuracaoMin(duracaoTotal)} de conteúdo ao todo.`;

  return (
    <SecaoVisual pergunta="O que compõe este curso?" resposta={resposta}>
      {conteudo.length === 0 ? (
        <Vazio>Cadastre módulos e aulas do produto para o conteúdo aparecer aqui.</Vazio>
      ) : (
        <div className="space-y-2">
          {conteudo.map((m) => (
            <details key={m.id} className="painel-form superficie rounded-2xl border border-borda-sutil">
              <summary className="trans flex cursor-pointer items-center justify-between gap-2 px-4 py-3.5 text-sm transition-colors hover:bg-eleva">
                <span className="min-w-0">
                  <span className="font-medium text-texto">{m.nome}</span>
                  <span className="ml-2 text-xs text-texto-2">
                    {fmtNum(m.aulas.length)} aula(s) · {fmtDuracaoMin(m.duracaoTotalMin)}
                  </span>
                </span>
              </summary>
              <div className="border-t border-borda-sutil px-4 py-3.5">
                {m.descricao ? <p className="mb-3 text-xs text-texto-2">{m.descricao}</p> : null}
                {m.aulas.length === 0 ? (
                  <Vazio>Módulo sem aula cadastrada.</Vazio>
                ) : (
                  <ul className="space-y-2">
                    {m.aulas.map((a) => (
                      <li key={a.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                        <span className="text-texto">
                          {a.ordem}. {a.titulo}
                          <span className="ml-2 text-texto-3">
                            {AULA_TIPO_LABEL[a.tipo]} · {fmtDuracaoMin(a.duracaoMin)}
                          </span>
                        </span>
                        <span className="tabular-nums text-texto-2">
                          {fmtNum(a.concluidosCount)}/{fmtNum(totalAlunos)} concluíram · {fmtPct(a.pctConcluido)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </details>
          ))}
        </div>
      )}
    </SecaoVisual>
  );
}

// ---------- composição da aba ----------

export function CursoTurma({
  turmaNome,
  turmaStatus,
  crmHref,
  temTrilha,
  temAlunos,
  saude,
  funil,
  risco,
  mapa,
  presencas,
  conteudo,
}: {
  turmaNome: string;
  turmaStatus?: { label: string; tom: Tom };
  crmHref: (alunoId: string) => string;
  /** false quando o produto não tem módulo/aula cadastrado — a tela explica onde cadastrar em vez de gráfico vazio. */
  temTrilha: boolean;
  /** false quando ninguém está matriculado nesta turma ainda. */
  temAlunos: boolean;
  saude: SaudeTurma;
  funil: FunilModulo[];
  risco: AlunoEmRisco[];
  mapa: MapaProgresso;
  presencas: PresencaEncontro[];
  conteudo: ModuloConteudo[];
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="font-display text-base font-normal text-texto">{turmaNome}</h3>
        {turmaStatus ? <Badge tom={turmaStatus.tom}>{turmaStatus.label}</Badge> : null}
      </div>

      {!temTrilha ? (
        <SecaoVisual pergunta={`A turma ${turmaNome} está andando?`} resposta="Falta cadastrar o conteúdo do curso.">
          <Vazio>
            Este produto ainda não tem módulo nem aula cadastrados — sem trilha não dá para medir progresso. Cadastre
            a trilha nas tabelas <code className="rounded bg-poco px-1 py-0.5 font-mono text-[10px]">modulos</code> e{" "}
            <code className="rounded bg-poco px-1 py-0.5 font-mono text-[10px]">aulas</code> (Supabase) ou nas abas{" "}
            <code className="rounded bg-poco px-1 py-0.5 font-mono text-[10px]">MODULOS</code> /{" "}
            <code className="rounded bg-poco px-1 py-0.5 font-mono text-[10px]">AULAS</code> da planilha.
          </Vazio>
        </SecaoVisual>
      ) : !temAlunos ? (
        <>
          <SecaoVisual
            pergunta={`A turma ${turmaNome} está andando?`}
            resposta="Ainda não há aluno matriculado nesta turma."
          >
            <Vazio>
              Assim que a primeira matrícula desta turma entrar, a plataforma de curso passa a medir progresso.
            </Vazio>
          </SecaoVisual>
          {/* conteúdo não depende de matrícula — mostra o que já foi cadastrado */}
          <SecaoConteudoCurso conteudo={conteudo} totalAlunos={0} />
        </>
      ) : (
        <>
          <SecaoSaudeTurma turmaNome={turmaNome} saude={saude} />
          <SecaoFunilModulo funil={funil} totalAlunos={saude.totalAlunos} />
          <SecaoAlunosEmRisco risco={risco} crmHref={crmHref} />
          <SecaoMapaProgresso mapa={mapa} crmHref={crmHref} />
          <SecaoPresencaEncontros presencas={presencas} />
          <SecaoConteudoCurso conteudo={conteudo} totalAlunos={saude.totalAlunos} />
        </>
      )}
    </div>
  );
}
