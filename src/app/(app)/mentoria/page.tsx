// /mentoria — a carteira: uma linha por mentorado/matrícula, com progresso,
// próxima sessão e alerta de silêncio prolongado. Server Component: lê tudo
// de `lerCarteira` (src/lib/mentoria/dados.ts) numa ida só, sem cliente,
// sem estado — a mesma forma de /crm (src/app/(app)/crm/page.tsx).
//
// `new Date()` mora AQUI, na borda da rota, e só aqui: `dados.ts` e
// `textos.ts` são módulos puros que recebem "agora" como parâmetro, nunca o
// perguntam sozinhos (mesma regra documentada no topo de `progresso.ts`).

import Link from "next/link";
import { Badge, Card, PageHeader, ProgressBar, Tabela, Td, Th, Vazio, type Tom } from "@/components/ui";
import { lerCarteira } from "@/lib/mentoria/dados";
import type { StatusMatricula } from "@/lib/mentoria/tipos";
import { rotuloAlertaCarteira, rotuloContagemMentorados, rotuloProximaSessao } from "./textos";

export const dynamic = "force-dynamic";

const LABEL_STATUS_MATRICULA: Record<StatusMatricula, string> = {
  ativa: "Ativa",
  concluida: "Concluída",
  cancelada: "Cancelada",
  trancada: "Trancada",
};

const TOM_STATUS_MATRICULA: Record<StatusMatricula, Tom> = {
  ativa: "verde",
  concluida: "azul",
  cancelada: "vermelho",
  trancada: "ouro",
};

export default async function Mentoria() {
  // borda: "agora" nasce aqui, uma vez, e desce como string para tudo que
  // precisar dele (a leitura e a formatação da próxima sessão).
  const agoraIso = new Date().toISOString();
  const carteira = await lerCarteira(agoraIso);

  return (
    <>
      <PageHeader
        titulo="Mentoria"
        sub="A carteira de mentorados — progresso, sessões e quem está sem contato"
      />

      {/* Estado 1: sem Supabase configurado, ou a leitura falhou. Uma frase
          humana com o `motivo` que `lerCarteira` já preparou — nunca uma
          tabela vazia fingindo que existem zero mentorados. */}
      {!carteira.conectado ? (
        <Card>
          <p className="text-sm text-texto-2">{carteira.motivo}</p>
        </Card>
      ) : carteira.linhas.length === 0 ? (
        // Estado 2: conectou, mas ainda não existe matrícula nenhuma no banco.
        <Card>
          <Vazio>
            Nenhum mentorado em programa ainda. Assim que um cliente virar mentorado com uma
            matrícula ativa, ele aparece aqui — comece pela{" "}
            <Link href="/crm" className="text-primaria-2 hover:underline">
              Central de Clientes
            </Link>
            .
          </Vazio>
        </Card>
      ) : (
        // Estado 3: uma linha por mentorado/matrícula. O título conta
        // PESSOAS (rotuloContagemMentorados), não matrículas — ver MÉDIO 3
        // em textos.ts: "Mentorados" tem que responder à pergunta que a
        // palavra faz, não ao número de linhas da tabela.
        <Card titulo={`Mentorados em programa (${rotuloContagemMentorados(carteira.linhas)})`}>
          <Tabela>
            <thead>
              <tr>
                <Th>Mentorado</Th>
                <Th>Programa</Th>
                <Th>Progresso</Th>
                <Th>Status</Th>
                <Th>Próxima sessão</Th>
              </tr>
            </thead>
            <tbody>
              {carteira.linhas.map((linha) => {
                // BAIXO: `rotuloAlertaCarteira` cobre as duas causas do
                // mesmo alerta dourado — silêncio prolongado OU nunca teve
                // a primeira sessão (ver `diasEmSilencio`, progresso.ts).
                const alerta = rotuloAlertaCarteira(linha.silencio);
                const { progresso } = linha;
                // Cortesia do mentor, não defeito — texto neutro, sem tom de erro.
                const excedente =
                  progresso.excedeu && progresso.previstas !== null
                    ? progresso.realizadas - progresso.previstas
                    : 0;
                return (
                  <tr key={linha.matricula.id}>
                    <Td>
                      <Link
                        href={`/mentoria/${linha.mentorado.id}`}
                        className="font-medium hover:text-primaria-2"
                      >
                        {linha.mentorado.nome}
                      </Link>
                      {/* Dourado é acento de atenção aqui, nunca fundo. */}
                      {alerta ? <p className="mt-0.5 text-xs text-dourado">{alerta}</p> : null}
                    </Td>
                    <Td className="text-texto-2">{linha.programa?.nome ?? "—"}</Td>
                    <Td>
                      <p className="text-sm">
                        {progresso.rotulo}
                        {excedente > 0 ? (
                          <span className="text-texto-2"> · {excedente} sessões além do pacote</span>
                        ) : null}
                      </p>
                      {progresso.percentual !== null ? (
                        <div className="mt-1.5 w-32">
                          <ProgressBar pct={progresso.percentual} />
                        </div>
                      ) : null}
                    </Td>
                    <Td>
                      <Badge tom={TOM_STATUS_MATRICULA[linha.matricula.status]}>
                        {LABEL_STATUS_MATRICULA[linha.matricula.status]}
                      </Badge>
                    </Td>
                    <Td className="text-texto-2">
                      {rotuloProximaSessao(linha.proxima?.quando ?? null, agoraIso)}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Tabela>
        </Card>
      )}
    </>
  );
}
