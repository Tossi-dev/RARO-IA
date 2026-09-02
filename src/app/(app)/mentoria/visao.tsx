// A parte PURA de apresentação da carteira de mentoria — recebe a
// `Carteira` (contrato de `src/lib/mentoria/dados.ts`) já resolvida e o
// `agoraIso` da borda da rota, e só desenha. `page.tsx` cuida da busca
// (`lerCarteira`); nenhuma consulta, nenhum `new Date()` aqui — mesma
// disciplina de `../portal/visao.tsx`.

import Link from "next/link";
import { Badge, Card, PageHeader, ProgressBar, Tabela, Td, Th, Vazio, type Tom } from "@/components/ui";
import type { Carteira } from "@/lib/mentoria/dados";
import type { StatusMatricula } from "@/lib/mentoria/tipos";
import { rotuloAlertaCarteira, rotuloContagemMentorados, rotuloProximaSessao } from "./textos";

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

export function CarteiraVisao({ carteira, agoraIso }: { carteira: Carteira; agoraIso: string }) {
  return (
    <>
      <PageHeader
        titulo="Carteira de mentorados"
        sub="Acompanhe o ritmo de cada pessoa, perceba quem pede atenção e chegue à próxima conversa com contexto."
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
        <Card titulo={`Mentorados em programa (${rotuloContagemMentorados(carteira.linhas)})`} className="overflow-hidden">
          <p className="-mt-1 mb-5 max-w-2xl text-sm leading-relaxed text-texto-2">A prioridade aqui é continuidade: próximo encontro, progresso no programa e um aviso claro quando a conversa ficou distante.</p>
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
                  // `group` + `hover:bg-eleva` na LINHA inteira (não só no
                  // nome) — numa tabela de mentorados o alvo natural do
                  // clique é a linha toda, não só as letras do nome; sem
                  // isso, uma foto estática da tela não tinha nenhum sinal
                  // de que a linha respondia a nada.
                  <tr
                    key={linha.matricula.id}
                    className="group trans transition-colors hover:bg-eleva/60"
                  >
                    <Td>
                      {/* Cor `primaria-2` (a mesma que todo link de texto do
                          app usa — ver "volte para a carteira" em
                          `/mentoria/[id]/visao.tsx` e o conteúdo liberado do
                          portal) + seta que só o CSS do `group-hover`
                          desloca: sem isso o nome tinha a mesma cor do texto
                          normal e nada na tela avisava que dava pra clicar. */}
                      <Link
                        href={`/mentoria/${linha.mentorado.id}`}
                        className="inline-flex items-center gap-1 font-medium text-primaria-2 hover:underline"
                      >
                        {linha.mentorado.nome}
                        <span
                          aria-hidden
                          className="trans text-primaria-2/70 transition-transform group-hover:translate-x-0.5"
                        >
                          →
                        </span>
                      </Link>
                      {/* Dourado é acento de atenção aqui, nunca fundo. */}
                      {alerta ? <p className="mt-1 inline-flex rounded-full border border-dourado/30 bg-dourado/10 px-2 py-0.5 text-xs text-dourado">{alerta}</p> : null}
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
