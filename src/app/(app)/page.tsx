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
//
// B2.7 — POR QUE OS DOIS CATÁLOGOS PASSAM POR `appsDoPapel` ANTES DA GRADE:
// o portão de rota (`rotaPermitida`, em src/lib/papeis.ts) já barrava um
// mentorado de abrir /financeiro — mas nada impedia o TILE de Financeiro de
// aparecer na tela inicial e levar direto para /sem-acesso. Isso é
// vazamento de EXISTÊNCIA: a tela /sem-acesso foi escrita para não revelar o
// mapa do que existe do outro lado (ver o comentário no topo dela), e a
// grade de ícones entregava esse mapa inteiro na primeira tela. `papelAtual()`
// lê o papel UMA VEZ, no servidor, e `appsDoPapel` filtra os dois catálogos
// (o de trabalho e o de "Sistema") com a mesma função que decide o portão —
// nenhuma lista nova de permissão foi inventada aqui.

import { Botao, Card, PageHeader } from "@/components/ui";
import { Springboard } from "@/components/springboard";
import { sair } from "@/lib/actions";
import { hojeISO } from "@/lib/agenda";
import { appsDoPapel, CATALOGO_APPS, CATALOGO_SISTEMA } from "@/lib/apps";
import { getDB } from "@/lib/data";
import { inadimplencia } from "@/lib/metrics";
import { papelAtual } from "@/lib/papel-atual";

export const dynamic = "force-dynamic";

export default async function Inicio() {
  const papel = await papelAtual();
  const db = getDB();
  const [reunioes, tarefas, dc] = await Promise.all([
    db.listReunioes(),
    db.listTarefas(),
    db.datasetCaixa(),
  ]);
  const hoje = hojeISO();

  const apps = appsDoPapel(papel, CATALOGO_APPS);
  const appsSistema = appsDoPapel(papel, CATALOGO_SISTEMA);

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
      <PageHeader
        titulo="Seu espaço de trabalho"
        sub="Conduza cada conversa, acompanhe cada jornada e mantenha a operação por perto."
      />

      {apps.length === 0 && appsSistema.length === 0 ? (
        // B2.7, caso "grade vazia": um `appsDoPapel` que devolvesse nada não
        // pode virar uma tela em branco sem explicação — a mesma regra de
        // não vazar papel da tela /sem-acesso vale aqui (sem citar qual
        // papel é este, nem qual área existiria do outro lado), só que a
        // saída é o botão "Sair", porque não há nenhuma primeira rota deste
        // papel para onde apontar um "voltar".
        <Card>
          <p className="text-sm leading-relaxed text-texto-2">
            Não há nenhuma área liberada para este acesso agora. Se você acha
            que deveria ver algo aqui, fale com quem administra o sistema.
          </p>
          <form action={sair} className="mt-4">
            <Botao tipo="fantasma" className="w-full">
              Sair
            </Botao>
          </form>
        </Card>
      ) : (
        <>
          {apps.length > 0 && <Springboard apps={apps} badges={badges} />}

          {/* Segunda fileira, separada de propósito: ferramenta não é
              trabalho do dia. Ela existe aqui porque a sidebar saiu da tela —
              sem esta fileira, "Importar extrato" e "Integrações" só seriam
              alcançáveis por quem soubesse o nome de cor para digitar no ⌘K.
              Só desenha quando sobrou pelo menos um item depois do filtro de
              papel — um título "Sistema" sem grade nenhuma embaixo seria uma
              seção vazia sem propósito. */}
          {appsSistema.length > 0 && (
            <>
              <p className="mb-3 mt-10 text-[11px] font-medium uppercase tracking-[0.16em] text-texto-3">
                Administração e conexões
              </p>
              <Springboard apps={appsSistema} badges={{}} />
            </>
          )}
        </>
      )}
    </>
  );
}
