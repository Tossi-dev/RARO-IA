// Tela inicial — a RAIZ do sistema ("/"), em espírito iOS: uma "área de
// trabalho" com um
// ícone por área do sistema. Ver src/lib/apps.ts para o catálogo e
// src/components/springboard.tsx para o visual (squircle, pasta, badge).
//
// Por que os badges são calculados AQUI, e não dentro do catálogo: apps.ts é
// módulo neutro e não busca dado nenhum — o contador de verdade (reunião de
// hoje, tarefa vencida, recebível atrasado) só existe depois de ler o banco,
// e ler banco é coisa de Server Component. Regra do produto: badge inventado
// é pior que badge nenhum, então cada número aqui vem de uma função que já
// existe no núcleo de métricas — nada foi calculado só para "ter um número".

import { PageHeader } from "@/components/ui";
import { Springboard } from "@/components/springboard";
import { hojeISO } from "@/lib/agenda";
import { CATALOGO_APPS, CATALOGO_SISTEMA } from "@/lib/apps";
import { getDB } from "@/lib/data";
import { inadimplencia } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export default async function Inicio() {
  const db = getDB();
  const [reunioes, tarefas, dc] = await Promise.all([
    db.listReunioes(),
    db.listTarefas(),
    db.datasetCaixa(),
  ]);
  const hoje = hojeISO();

  // Agenda: só a reunião que ainda vai acontecer HOJE conta — a já realizada
  // ou cancelada não pede atenção nenhuma na tela inicial.
  const reunioesHoje = reunioes.filter((r) => r.status === "agendada" && r.inicio.slice(0, 10) === hoje).length;

  // Central de Clientes: tarefa de gestão pendente com prazo já passado.
  // Prazo nulo (sem data marcada) não é "vencida" — não tem como estar
  // atrasada uma coisa que não tinha data para acontecer.
  const tarefasVencidas = tarefas.filter(
    (t) => t.status === "pendente" && t.prazo !== null && t.prazo < hoje
  ).length;

  // Financeiro: recebível vencido e ainda não recebido — a mesma conta de
  // src/lib/metrics.ts (`inadimplencia`), que já responde "quanto do que eu
  // já vendi está preso e há quanto tempo?" na tela de capital de giro.
  const recebiveisAtrasados = inadimplencia(dc).qtdAtrasada;

  const badges: Record<string, number> = {
    agenda: reunioesHoje,
    crm: tarefasVencidas,
    financeiro: recebiveisAtrasados,
  };

  return (
    <>
      <PageHeader titulo="Início" sub="Cada área do sistema, num ícone — como um app." />
      <Springboard apps={CATALOGO_APPS} badges={badges} />

      {/* Segunda fileira, separada de propósito: ferramenta não é trabalho do
          dia. Ela existe aqui porque a sidebar saiu da tela — sem esta fileira,
          "Importar extrato" e "Integrações" só seriam alcançáveis por quem
          soubesse o nome de cor para digitar no ⌘K. */}
      <p className="mb-3 mt-9 text-[11px] font-medium uppercase tracking-wider text-texto-3">
        Sistema
      </p>
      <Springboard apps={CATALOGO_SISTEMA} badges={{}} />
    </>
  );
}
