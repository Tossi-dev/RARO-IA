// O card "Seus primeiros passos" do portal — o roteiro de entrada como o
// MENTORADO o vê.
//
// Componente puro: recebe o `MeuOnboarding` já resolvido e só desenha. Mora em
// arquivo próprio pelo mesmo motivo de `./avisos.tsx`: `visao.tsx` já é
// grande, e este bloco tem suíte de testes própria.
//
// ============================================================
// A BARRA SOME QUANDO NÃO HÁ O QUE MEDIR — E QUANDO ACABOU
// ============================================================
//
// `pct: null` significa "não há etapa obrigatória no roteiro". A barra NÃO é
// desenhada nesse caso, e o texto diz por quê: uma barra em 0% para quem
// acabou de entrar num roteiro vazio lê como acusação, e uma barra sem
// denominador não mede nada.
//
// Concluído também tira a barra. Deixar 100% para sempre transforma uma
// conquista num enfeite — depois de uma semana ninguém olha mais, e o card
// vira ruído no topo da tela do cliente.
//
// ============================================================
// ETAPA DO MENTOR APARECE, MAS SEM BOTÃO
// ============================================================
//
// O mentorado VÊ o roteiro inteiro, inclusive o que é do mentor: saber que "o
// contrato vai ser enviado" faz parte de entender onde ele está. O que ele
// não tem é o botão — e não por decoração: `onboarding_marcar` (0023) recusa
// a etapa do mentor dentro do próprio `where`, no banco. O botão ausente
// evita o clique inútil; a função é que impede o efeito.
//
// ⚠ O UPLOAD DO CONTRATO NÃO ESTÁ AQUI, E ISSO FOI DECISÃO DO DONO
// ----------------------------------------------------------------
// O plano da Fase 2 pedia, neste card, o envio do contrato assinado pelo
// próprio mentorado. A RLS de 0015 não permite: `documento` e o bucket de
// storage só aceitam escrita de dono/gestor. Fazer o upload funcionar exigiria
// uma migração nova abrindo escrita de cliente no storage — superfície nova,
// e não uma linha de tela. Perguntado em 20/08, o dono escolheu ADIAR: o
// contrato continua sendo anexado pelo mentor, na ficha, que já funciona
// desde a tarefa 12. A etapa aparece aqui como informação.

import { Badge, Botao, Card, ProgressBar, Vazio } from "@/components/ui";
import { marcarMinhaEtapaDoForm } from "@/lib/onboarding/acoes-form";
import type { MeuOnboarding } from "@/lib/onboarding/dados";
import { responsavelDaEtapa, type EtapaDeOnboarding } from "@/lib/onboarding/roteiro";

function Etapa({
  etapa,
  concluida,
}: {
  etapa: EtapaDeOnboarding & { descricao: string };
  concluida: boolean;
}) {
  const minha = responsavelDaEtapa(etapa.responsavel) === "mentorado";

  return (
    <li className="border-b border-borda-sutil pb-3.5 last:border-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">
          {etapa.titulo}
          {!etapa.obrigatoria ? <span className="ml-2 text-xs text-texto-3">opcional</span> : null}
        </span>
        {concluida ? <Badge tom="verde">Feito</Badge> : null}
      </div>

      {etapa.descricao ? (
        <p className="mt-1.5 whitespace-pre-line text-sm text-texto-2">{etapa.descricao}</p>
      ) : null}

      {minha ? (
        <form action={marcarMinhaEtapaDoForm} className="mt-2.5">
          <input type="hidden" name="etapaId" value={etapa.id} />
          {/* Só o literal "1" marca (ver `marcarMinhaEtapa`): desmarcar manda
              outra coisa. O lado seguro é esse — o pior erro possível é
              precisar clicar de novo. */}
          <input type="hidden" name="concluida" value={concluida ? "0" : "1"} />
          <Botao tipo={concluida ? "fantasma" : "primario"}>
            {concluida ? "Marcar como não feito" : "Marcar como feito"}
          </Botao>
        </form>
      ) : (
        // Sem botão, e dito: a pessoa precisa saber que o passo existe e que
        // ele não depende dela.
        <p className="mt-1.5 text-xs text-texto-3">Este passo é com seu mentor.</p>
      )}
    </li>
  );
}

export function PrimeirosPassos({ onboarding }: { onboarding: MeuOnboarding }) {
  // Nos dois casos o portal já diz o que precisa ser dito — mesma decisão do
  // card de avisos.
  if (!onboarding.conectado || !onboarding.ehMentorado) return null;

  const { estado } = onboarding;
  const ativas = onboarding.etapas.filter((e) => e.ativa);
  const concluidas = new Set(onboarding.progresso.filter((m) => m.concluida).map((m) => m.etapaId));

  // Roteiro vazio não vira card vazio: some.
  if (ativas.length === 0) return null;

  const mostrarBarra = estado.pct !== null && !estado.concluido;

  return (
    <Card titulo="Seus primeiros passos">
      {mostrarBarra ? (
        <div className="mb-4">
          <p className="mb-1.5 text-xs text-texto-2">{estado.pct}% do essencial concluído</p>
          <ProgressBar pct={estado.pct as number} />
        </div>
      ) : estado.concluido ? (
        <p className="mb-4 rounded-xl border border-positivo/40 bg-positivo/10 px-4 py-3 text-sm text-positivo">
          Tudo o que era essencial já está feito. O que sobrar abaixo é opcional.
        </p>
      ) : (
        // `pct: null` — e o texto diz o porquê, em vez de deixar um espaço em
        // branco onde a barra estaria.
        <p className="mb-4 text-sm text-texto-2">
          Ainda não há passo obrigatório no seu roteiro — os itens abaixo são sugestões.
        </p>
      )}

      {ativas.length === 0 ? (
        <Vazio>Seu roteiro de entrada ainda está sendo montado.</Vazio>
      ) : (
        <ul className="space-y-3.5">
          {ativas.map((etapa) => (
            <Etapa key={etapa.id} etapa={etapa} concluida={concluidas.has(etapa.id)} />
          ))}
        </ul>
      )}
    </Card>
  );
}
