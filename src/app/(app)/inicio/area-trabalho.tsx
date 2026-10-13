import { Botao, Card, PageHeader } from "@/components/ui";
import { Springboard } from "@/components/springboard";
import { sair } from "@/lib/actions";
import { hojeISO } from "@/lib/agenda";
import { appsDoPapel, CATALOGO_APPS, CATALOGO_SISTEMA } from "@/lib/apps";
import { getDB } from "@/lib/data";
import { inadimplencia } from "@/lib/metrics";
import { papelAtual } from "@/lib/papel-atual";

export async function AreaTrabalho() {
  const papel = await papelAtual();
  const db = getDB();
  const [reunioes, tarefas, dc] = await Promise.all([db.listReunioes(), db.listTarefas(), db.datasetCaixa()]);
  const hoje = hojeISO();
  const apps = appsDoPapel(papel, CATALOGO_APPS);
  const appsSistema = appsDoPapel(papel, CATALOGO_SISTEMA);
  const badges: Record<string, number> = {
    agenda: reunioes.filter((r) => r.status === "agendada" && r.inicio.slice(0, 10) === hoje).length,
    crm: tarefas.filter((t) => t.status === "pendente" && t.prazo !== null && t.prazo < hoje).length,
    financeiro: inadimplencia(dc).qtdAtrasada,
  };

  return (
    <>
      <PageHeader titulo="Seu espaço de trabalho" sub="Conduza cada conversa, acompanhe cada jornada e mantenha a operação por perto." />
      {apps.length === 0 && appsSistema.length === 0 ? (
        <Card>
          <p className="text-sm leading-relaxed text-texto-2">Não há nenhuma área liberada para este acesso agora. Se você acha que deveria ver algo aqui, fale com quem administra o sistema.</p>
          <form action={sair} className="mt-4"><Botao tipo="fantasma" className="w-full">Sair</Botao></form>
        </Card>
      ) : (
        <>
          {apps.length > 0 && <Springboard apps={apps} badges={badges} />}
          {appsSistema.length > 0 && <><p className="mb-3 mt-10 text-[11px] font-medium uppercase tracking-[0.16em] text-texto-3">Administração e conexões</p><Springboard apps={appsSistema} badges={{}} /></>}
        </>
      )}
    </>
  );
}
