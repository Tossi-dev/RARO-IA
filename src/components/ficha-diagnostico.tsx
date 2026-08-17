// O bloco do diagnóstico dentro da ficha do lead.
//
// O QUE ESTA TELA EXISTE PARA EVITAR
// ----------------------------------
// "Oi, tudo bem? Me conta um pouco sobre a sua empresa." O lead já contou —
// cinco perguntas, quarenta segundos, antes de mandar a primeira mensagem.
// Perguntar de novo desperdiça a única vantagem que este funil produz e
// devolve ao dono a sensação de estar falando com mais um vendedor.
//
// Então tudo aqui é para COPIAR E MANDAR, não para ler e interpretar: a
// primeira mensagem inteira, a pergunta da segunda troca, a prova, o ângulo do
// preço e — a parte que evita mais estrago que todas as outras juntas — a
// frase que não pode ser dita para este perfil.
//
// Server component de propósito: nenhum estado, nenhum efeito, nada de
// "use client". O único pedaço interativo (copiar a mensagem) é um
// `<textarea readOnly>`, que o dono seleciona e copia com o gesto que ele já
// conhece — e que funciona no celular sem depender de permissão de clipboard.

import { Badge, Card, type Tom } from "@/components/ui";
import {
  FAIXA_TEXTO,
  INACABADOS_TEXTO,
  RECUSA_TEXTO,
  TRAVA_TEXTO,
  lerFila,
  lerSegmento,
  type MotivoRecusa,
} from "@/lib/diagnostico/codigo";
import { ABORDAGEM, ATRAVESSAR, MODIFICADOR, OFERTA, REGRA_DO_PRECO } from "@/lib/diagnostico/roteiro";
import type { DiagnosticoDoLead } from "@/lib/diagnostico/ficha";

const TOM_DA_FILA: Record<number, Tom> = { 1: "vermelho", 2: "ouro", 3: "azul", 4: "cinza" };

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-borda py-3 first:border-t-0 first:pt-0">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-texto-3">{rotulo}</p>
      <div className="text-sm text-texto-2">{children}</div>
    </div>
  );
}

/** A caixa de copiar: texto pronto, sem botão que precise de permissão. */
function ParaCopiar({ texto }: { texto: string }) {
  return (
    <textarea
      readOnly
      rows={5}
      value={texto}
      onFocus={(e) => e.currentTarget.select()}
      className="mt-1 w-full resize-y rounded-lg border border-borda bg-eleva p-3 text-sm leading-relaxed text-texto"
    />
  );
}

export function FichaDiagnostico({ d }: { d: DiagnosticoDoLead }) {
  // QUEM NÃO PASSOU NO CRITÉRIO
  // ---------------------------
  // A ficha existe mesmo assim, e diz o motivo. Empresa cresce: a lista de
  // quem gostaria de ter entrado é o melhor lugar para procurar cliente daqui
  // a dezoito meses — e o motivo escrito evita que alguém "aproveite o
  // contato" e ofereça mesmo assim, desmentindo a recusa da landing.
  if (!d.qualificado) {
    const motivo = (d.papel && d.papel !== "D" ? d.papel : d.faturamento) as MotivoRecusa;
    return (
      <Card titulo="Diagnóstico da landing">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge tom="cinza">fora do critério</Badge>
          <code className="text-xs text-texto-3">{d.codigo}</code>
        </div>
        <Linha rotulo="Por que não passou">{RECUSA_TEXTO[motivo] ?? "não atende ao critério de entrada"}</Linha>
        <Linha rotulo="O que fazer">
          Nada de abordagem comercial. Ele já recebeu as três ferramentas na própria landing. Quando
          a empresa crescer, ele volta — e esta ficha vai estar aqui.
        </Linha>
      </Card>
    );
  }

  const seg = lerSegmento(d.codigo);
  if (!seg) {
    // Qualificado com código ilegível não deveria existir (a restrição do banco
    // e o schema da rota impedem), mas se existir a tela diz isso em vez de
    // renderizar uma abordagem escolhida no chute.
    return (
      <Card titulo="Diagnóstico da landing">
        <p className="text-sm text-texto-2">
          O código <code className="text-texto">{d.codigo}</code> não pôde ser lido. As respostas
          estão gravadas, mas a abordagem não foi escolhida automaticamente — trate como lead sem
          diagnóstico.
        </p>
      </Card>
    );
  }

  const fila = lerFila(seg.urgencia);
  const porta = ABORDAGEM[seg.travaDeclarada];
  const quarto = ABORDAGEM[seg.travaDeTrabalho];
  const oferta = OFERTA[seg.faixa];

  return (
    <div className="grid gap-4">
      <Card titulo="Diagnóstico da landing">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge tom={TOM_DA_FILA[fila.prioridade]}>{fila.prazo}</Badge>
          <Badge tom="violeta">{seg.travaDeclarada} declarada</Badge>
          {seg.atravessar && <Badge tom="ouro">{seg.travaDeTrabalho} de trabalho</Badge>}
          <code className="text-xs text-texto-3">{d.codigo}</code>
        </div>

        <Linha rotulo="As cinco respostas">
          <ul className="grid gap-1 sm:grid-cols-2">
            <li>Faturamento: {FAIXA_TEXTO[seg.faixa]}</li>
            <li>Papel: dono ou sócio</li>
            <li className="sm:col-span-2">Trava: {TRAVA_TEXTO[seg.travaDeclarada]}</li>
            <li className="sm:col-span-2">Inacabados: {INACABADOS_TEXTO[seg.inacabados]}</li>
            <li className="sm:col-span-2">
              Quando quer começar: {["", "essa semana", "nos próximos 30 dias", "esse trimestre", "só pesquisando"][seg.urgencia]}
            </li>
          </ul>
        </Linha>

        <Linha rotulo="Urgência — o que ela muda">{MODIFICADOR[seg.urgencia]}</Linha>
      </Card>

      <Card titulo={`Abra por aqui — ${seg.travaDeclarada} · ${porta.titulo}`}>
        <p className="text-sm text-texto-3">
          A primeira mensagem. Ela não vende, não pergunta e não agradece o contato: devolve, em uma
          frase, algo que ele não contou.
        </p>
        <ParaCopiar texto={porta.primeiraMensagem} />
        <div className="mt-3">
          <Linha rotulo="Pergunta da segunda troca">{porta.aprofundar}</Linha>
          <Linha rotulo="O que ouvir na resposta">{porta.ouvir}</Linha>
          <Linha rotulo="Prova">{porta.prova}</Linha>
          <Linha rotulo="Ferramenta">
            <code className="text-texto">{porta.ferramenta}</code>
          </Linha>
          <Linha rotulo="Não diga">
            <span className="text-negativo">{porta.naoDizer}</span>
          </Linha>
        </div>
      </Card>

      {seg.atravessar && (
        <Card titulo={`Atravesse para — ${seg.travaDeTrabalho} · ${quarto.titulo}`}>
          <p className="text-sm text-texto-3">
            Ele marcou {seg.travaDeclarada}, mas {INACABADOS_TEXTO[seg.inacabados]} — o que a
            mentoria resolve é o ciclo interrompido. A conversa abre pela porta que ele apontou e
            entrega pelo quarto. <b className="text-texto">Nunca pule o passo 1 para chegar no 3:</b>{" "}
            chegar rápido demais no diagnóstico certo soa como script, e quem já comprou promessa
            antes reconhece script mais rápido que qualquer um.
          </p>
          <div className="mt-3">
            <Linha rotulo="1 · abra pela porta">{ATRAVESSAR.passo1}</Linha>
            <Linha rotulo="2 · a ponte">{ATRAVESSAR.passo2}</Linha>
            <Linha rotulo="3 · só então nomeie">{ATRAVESSAR.passo3}</Linha>
            <Linha rotulo="Ângulo de fechamento (o quarto)">{quarto.anguloDeFechamento}</Linha>
            <Linha rotulo="Não diga">
              <span className="text-negativo">{quarto.naoDizer}</span>
            </Linha>
          </div>
        </Card>
      )}

      <Card titulo={`Oferta — faixa ${seg.faixa}`}>
        <Linha rotulo="Perfil">{oferta.perfil}</Linha>
        <Linha rotulo="Formato">{oferta.formato}</Linha>
        <Linha rotulo="Ângulo do preço">{oferta.anguloDoPreco}</Linha>
        <Linha rotulo="Regra do preço">{REGRA_DO_PRECO}</Linha>
        <Linha rotulo="Ângulo de fechamento">{porta.anguloDeFechamento}</Linha>
      </Card>
    </div>
  );
}
