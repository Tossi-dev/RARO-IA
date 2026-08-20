// A parte PURA de apresentação da trilha do MENTORADO — recebe a
// `MinhaTrilha` já resolvida por `lerMinhaTrilha` e só desenha.
//
// ============================================================
// A AULA FECHADA: DUAS PORTAS, FECHADAS SEPARADAMENTE
// ============================================================
//
// `dados-trilha.ts` já entrega a aula não liberada com `urlVideo` e `texto`
// VAZIOS — quando a linha chega aqui, o conteúdo não está mais nela. Esta
// tela, mesmo assim, decide pelo campo `liberada`, e não por "a url está
// vazia". Não é redundância à toa: são duas perguntas diferentes ("o que eu
// recebi?" e "o que eu desenho?"), e a suíte de testes passa de propósito uma
// aula fechada COM conteúdo dentro para provar que esta tela não o
// desenharia. Este projeto já viu três vezes o mesmo acidente nesta fase (o
// `.ics`, o `console.warn` da transcrição, a frase do consentimento): uma
// porta blindada e a do lado aberta.
//
// ============================================================
// DATA, NUNCA "EM BREVE"
// ============================================================
//
// A aula que ainda não abriu mostra o DIA em que abre. "Em breve" é a frase
// que faz a pessoa voltar cinco vezes e desistir na sexta — e quem paga por
// uma mentoria merece saber quando o que ela comprou aparece. Quando a data
// não é conhecida (matrícula sem `inicio`), a tela não inventa nem promete
// prazo: diz só que ainda não abriu.

import { Botao, Card, PageHeader, ProgressBar, Vazio } from "@/components/ui";
import { marcarAulaDoPortal } from "@/lib/conteudo/acoes-portal-trilha";
import type { AulaDoMentorado, MinhaTrilha } from "@/lib/conteudo/dados-trilha";
import { urlDeEmbedYoutube } from "@/lib/conteudo/video";
import { dataBr } from "../../mentoria/textos";

function AulaLiberada({ aula }: { aula: AulaDoMentorado }) {
  const embed = urlDeEmbedYoutube(aula.urlVideo);

  return (
    <>
      {embed ? (
        <div className="mt-2.5 aspect-video max-w-2xl overflow-hidden rounded-xl border border-borda-sutil">
          <iframe src={embed} title={aula.titulo} loading="lazy" allowFullScreen className="h-full w-full" />
        </div>
      ) : null}

      {aula.texto ? (
        <p className="mt-2.5 whitespace-pre-line text-sm leading-relaxed text-texto-2">{aula.texto}</p>
      ) : null}

      <form action={marcarAulaDoPortal} className="mt-3">
        <input type="hidden" name="aulaId" value={aula.id} />
        {/* Só o literal "1" marca (ver `marcarAula`): qualquer outra coisa
            DESMARCA. O lado seguro é esse — o pior erro possível é a pessoa
            precisar clicar de novo, nunca uma aula constar como feita sem
            ninguém ter dito isso. */}
        <input type="hidden" name="concluida" value={aula.concluida ? "0" : "1"} />
        <Botao tipo={aula.concluida ? "fantasma" : "primario"}>
          {aula.concluida ? "Marcar como não concluída" : "Marcar como concluída"}
        </Botao>
      </form>
    </>
  );
}

function AulaFechada({ aula }: { aula: AulaDoMentorado }) {
  const dia = dataBr(aula.abreNoDia);

  return (
    <p className="mt-2 text-sm text-texto-2">
      {dia ? `Abre em ${dia}.` : "Esta aula ainda não abriu."}
    </p>
  );
}

function LinhaDaAula({ aula }: { aula: AulaDoMentorado }) {
  return (
    <li className="border-b border-borda-sutil pb-4 last:border-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">
          <span className="mr-2 text-texto-3">{aula.ordem}</span>
          {aula.titulo}
        </span>
        {aula.duracaoMin > 0 ? <span className="text-xs text-texto-3">{aula.duracaoMin} min</span> : null}
      </div>

      {/* A decisão é pelo campo `liberada`, nunca por "a url veio vazia" —
          ver o cabeçalho do arquivo. */}
      {aula.liberada ? <AulaLiberada aula={aula} /> : <AulaFechada aula={aula} />}
    </li>
  );
}

export function MinhaTrilhaVisao({ minha, erro = "" }: { minha: MinhaTrilha; erro?: string }) {
  return (
    <>
      <PageHeader titulo="Sua trilha" sub="As aulas do seu programa, na ordem em que abrem" />

      {erro ? (
        <p className="mb-4 rounded-xl border border-negativo/40 bg-negativo/10 px-4 py-3 text-sm text-negativo">
          {erro}
        </p>
      ) : null}

      {!minha.conectado ? (
        <Card>
          <p className="text-sm text-texto-2">{minha.motivo}</p>
        </Card>
      ) : !minha.ehMentorado ? (
        // Mesmo estado (e mesma redação) de `PortalAindaNaoLigado`: sem nome
        // de papel do banco na cara de quem lê — isso contaria o desenho
        // interno para alguém que não pediu.
        <Card>
          <h1 className="font-display text-[20px] font-fino tracking-tight text-texto">
            Ainda não há nada por aqui
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-texto-2">
            Esta página mostra as aulas de quem está em acompanhamento. Sua conta ainda não está
            vinculada a esse acompanhamento, então não há nada para exibir agora.
          </p>
        </Card>
      ) : minha.trilhas.length === 0 ? (
        <Card>
          <Vazio>
            Você ainda não está em nenhuma trilha. Assim que seu mentor liberar uma, ela aparece
            aqui com as aulas e as datas em que cada uma abre.
          </Vazio>
        </Card>
      ) : (
        minha.trilhas.map(({ trilha, aulas, progresso, temCertificado }) => (
          <div key={trilha.id} className="mb-4">
            <Card titulo={trilha.nome}>
              {trilha.descricao ? <p className="mb-3 text-sm text-texto-2">{trilha.descricao}</p> : null}

              {progresso.pct !== null ? (
                <div className="mb-4">
                  <p className="mb-1.5 text-xs text-texto-2">
                    {progresso.concluidas} de {progresso.total} aulas concluídas
                  </p>
                  <ProgressBar pct={progresso.pct} />
                </div>
              ) : null}

              {temCertificado ? (
                // Comemora, e para por aí. A EMISSÃO do certificado é uma
                // tarefa própria, ainda não escrita (o porquê está no meio de
                // `acoes-trilha.ts`): a política de insert de `certificado`
                // permite dono e gestor, não o mentorado. Prometer aqui um
                // botão que não existe seria pior que não dizer nada —
                // certificado é documento.
                <p className="mb-4 rounded-xl border border-positivo/40 bg-positivo/10 px-4 py-3 text-sm text-positivo">
                  Você concluiu esta trilha. Fale com seu mentor sobre o certificado.
                </p>
              ) : null}

              {aulas.length === 0 ? (
                <Vazio>Esta trilha ainda não tem aulas cadastradas.</Vazio>
              ) : (
                <ul className="space-y-4">
                  {aulas.map((aula) => (
                    <LinhaDaAula key={aula.id} aula={aula} />
                  ))}
                </ul>
              )}
            </Card>
          </div>
        ))
      )}
    </>
  );
}
