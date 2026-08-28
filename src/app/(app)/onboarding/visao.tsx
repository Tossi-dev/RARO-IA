"use client";

// A parte PURA de apresentação do MODELO de onboarding — o roteiro que todo
// mentorado novo percorre. Recebe o `OnboardingDoMentorado` já resolvido e só
// desenha; `page.tsx` cuida da busca.
//
// ============================================================
// ESTA TELA É SOBRE O ROTEIRO, NÃO SOBRE PESSOAS
// ============================================================
//
// O plano da Fase 2 pedia aqui duas coisas: o modelo de etapas e "o painel de
// quem está em que passo". A primeira está aqui. A segunda mora na FICHA do
// mentorado (`/mentoria/[id]`), onde o dado de uma pessoa já vive junto com o
// resto do que se sabe sobre ela — trazer para cá uma lista de clientes com o
// progresso de cada um seria montar um segundo lugar para a mesma pergunta, e
// o primeiro é o certo.
//
// Consequência deliberada: NENHUM nome de cliente aparece nesta tela. Ela é a
// régua, não a medição.
//
// ============================================================
// O QUE ESTA TELA NÃO MOSTRA
// ============================================================
//
// Documento nenhum — nem nome de arquivo, nem caminho, nem link. O contrato
// assinado de um cliente é dado dele, e o lugar onde ele já aparece (para
// quem pode) é o bloco de arquivos da ficha, feito na tarefa 12. Uma tela de
// configuração de roteiro não tem por que saber o que foi enviado.

import { Badge, Botao, Campo, Card, Input, PageHeader, Select, TextArea, Vazio } from "@/components/ui";
import { useState } from "react";
import { arquivarEtapaDoForm, reordenarEtapaDoForm, salvarEtapaDoForm } from "@/lib/onboarding/acoes-form";
import type { OnboardingDoMentorado } from "@/lib/onboarding/dados";
import { responsavelDaEtapa, type EtapaDeOnboarding } from "@/lib/onboarding/roteiro";

const ROTULO_RESPONSAVEL: Record<string, string> = {
  mentor: "Do mentor",
  mentorado: "Do mentorado",
};

type Bloco = "mapa" | "objetivo" | "meta";
type Respostas = Record<Bloco, string>;
export type EstadoDoBloco = { consentido: boolean; pulado: boolean; resposta: string };
type EventoDoBloco = { tipo: "revogar" } | { tipo: "pular" } | { tipo: "consentir" };

/** Revogar autorização também revoga a retenção local daquela resposta. */
export function limparRespostaDoBloco(respostas: Respostas, bloco: Bloco): Respostas {
  return { ...respostas, [bloco]: "" };
}

/** Transições usadas pelos eventos de consentimento e de recusa da tela. */
export function transicionarBloco(estado: EstadoDoBloco, evento: EventoDoBloco) {
  if (evento.tipo === "pular") return { ...estado, consentido: false, pulado: true, resposta: "", ativo: false };
  if (evento.tipo === "revogar") return { ...estado, consentido: false, pulado: false, resposta: "", ativo: false };
  return { ...estado, consentido: true, pulado: false, ativo: true };
}

/**
 * Entrada mínima do mentorado. O componente é deliberadamente local: não há
 * action, request ou persistência aqui. O estado representa o que foi
 * respondido nesta sessão e torna abandono parcial um estado válido, não um
 * erro de validação.
 */
export function OnboardingEstruturado() {
  const [consentidos, setConsentidos] = useState<Record<Bloco, boolean>>({ mapa: false, objetivo: false, meta: false });
  const [pulados, setPulados] = useState<Record<Bloco, boolean>>({ mapa: false, objetivo: false, meta: false });
  const [respostas, setRespostas] = useState<Respostas>({ mapa: "", objetivo: "", meta: "" });

  function consentir(bloco: Bloco, valor: boolean) {
    const estado = transicionarBloco(
      { consentido: consentidos[bloco], pulado: pulados[bloco], resposta: respostas[bloco] },
      valor ? { tipo: "consentir" } : { tipo: "revogar" },
    );
    setConsentidos((atual) => ({ ...atual, [bloco]: estado.consentido }));
    setPulados((atual) => ({ ...atual, [bloco]: estado.pulado }));
    setRespostas((atual) => (estado.resposta === "" ? limparRespostaDoBloco(atual, bloco) : atual));
  }

  function pular(bloco: Bloco) {
    const estado = transicionarBloco(
      { consentido: consentidos[bloco], pulado: pulados[bloco], resposta: respostas[bloco] },
      { tipo: "pular" },
    );
    setPulados((atual) => ({ ...atual, [bloco]: estado.pulado }));
    setConsentidos((atual) => ({ ...atual, [bloco]: estado.consentido }));
    setRespostas((atual) => limparRespostaDoBloco(atual, bloco));
  }

  function bloco(bloco: Bloco, titulo: string, explicacao: string, campo: string, placeholder: string) {
    const ativo = consentidos[bloco] && !pulados[bloco];
    return (
      <section data-onboarding-step={bloco} className="rounded-2xl border border-borda-sutil bg-poco p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium">{titulo}</h3>
            <p className="mt-1 text-xs text-texto-2">{explicacao}</p>
          </div>
          <label className="flex items-center gap-2 text-xs text-texto-2">
            <input
              type="checkbox"
              name={`consentimento${bloco[0].toUpperCase()}${bloco.slice(1)}`}
              checked={consentidos[bloco]}
              onChange={(e) => consentir(bloco, e.target.checked)}
            />
            Autorizo esta resposta
          </label>
        </div>
        <div className="mt-3">
          <label className="sr-only" htmlFor={`onboarding-${bloco}`}>{titulo}</label>
          <textarea
            id={`onboarding-${bloco}`}
            name={campo}
            value={respostas[bloco]}
            onChange={(e) => setRespostas((atual) => ({ ...atual, [bloco]: e.target.value }))}
            maxLength={1000}
            rows={3}
            placeholder={placeholder}
            disabled={!ativo}
            aria-disabled={!ativo}
            className="w-full rounded-xl border border-borda-sutil bg-fundo px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
        <button type="button" className="mt-3 text-xs text-texto-2 underline" onClick={() => pular(bloco)}>
          Prefiro não responder
        </button>
      </section>
    );
  }

  return (
    <Card titulo="Comece pelo que quiser">
      <p className="mb-4 text-sm text-texto-2">
        Responda somente o que fizer sentido. Cada parte é opcional, o consentimento é separado e você pode sair no meio.
      </p>
      <div data-abandono-parcial="true" className="space-y-3">
        {bloco("mapa", "Mapa inicial", "O contexto que você autorizar para orientar o atendimento.", "mapa", "O que está acontecendo hoje?")}
        {bloco("objetivo", "Objetivo", "O resultado que você gostaria de construir primeiro.", "objetivo", "O que você quer alcançar?")}
        {bloco("meta", "Primeira meta", "Um primeiro passo concreto, se já houver um.", "primeiraMeta", "Qual é a primeira meta?")}
      </div>
    </Card>
  );
}

function LinhaDaEtapa({ etapa }: { etapa: EtapaDeOnboarding & { descricao: string } }) {
  const responsavel = responsavelDaEtapa(etapa.responsavel);

  return (
    <li className="border-b border-borda-sutil pb-4 last:border-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">
          <span className="mr-2 text-texto-3">{etapa.ordem}</span>
          {etapa.titulo || "Sem título"}
          {!etapa.ativa ? <span className="ml-2 text-xs text-texto-3">fora do roteiro</span> : null}
        </span>
        <span className="flex items-center gap-2">
          {/* `data-responsavel` é o gancho do teste. Sem ele, a asserção teria
              que procurar o texto "Do mentor" na página inteira — e ele
              também aparece no `<option>` do formulário logo abaixo, o que
              faz a asserção passar mesmo com o rótulo da linha apagado. Foi
              exatamente o que um mutante mostrou. */}
          <span data-responsavel={responsavel}>
            <Badge tom={responsavel === "mentorado" ? "violeta" : "azul"}>
              {ROTULO_RESPONSAVEL[responsavel]}
            </Badge>
          </span>
          <Badge tom={etapa.obrigatoria ? "ouro" : "cinza"}>
            {etapa.obrigatoria ? "Obrigatória" : "Opcional"}
          </Badge>
        </span>
      </div>

      {etapa.descricao ? (
        <p className="mt-1.5 whitespace-pre-line text-sm text-texto-2">{etapa.descricao}</p>
      ) : null}

      {etapa.ativa ? (
        <div className="mt-2.5 flex flex-wrap items-end gap-2">
          {/* Reordenar é só um número — a etapa nunca é apagada e recriada,
              porque isso levaria junto, em cascata, o progresso de todo mundo
              que já a cumpriu. */}
          <form action={reordenarEtapaDoForm} className="flex items-end gap-2">
            <input type="hidden" name="id" value={etapa.id} />
            <Campo label="Posição">
              <Input type="number" name="ordem" min={0} step={1} defaultValue={etapa.ordem} className="w-24" />
            </Campo>
            <Botao tipo="fantasma">Mover</Botao>
          </form>

          <form action={arquivarEtapaDoForm}>
            <input type="hidden" name="id" value={etapa.id} />
            {/* "Tirar do roteiro" e não "excluir": quem já cumpriu continua
                tendo cumprido. */}
            <Botao tipo="fantasma">Tirar do roteiro</Botao>
          </form>
        </div>
      ) : null}
    </li>
  );
}

export function OnboardingVisao({ modelo, erro = "" }: { modelo: OnboardingDoMentorado; erro?: string }) {
  return (
    <>
      <PageHeader
        titulo="Onboarding"
        sub="O roteiro de entrada — o que todo mentorado novo percorre, e de quem é cada passo"
      />

      {erro ? (
        <p className="mb-4 rounded-xl border border-negativo/40 bg-negativo/10 px-4 py-3 text-sm text-negativo">
          {erro}
        </p>
      ) : null}

      {!modelo.conectado ? (
        <Card>
          <p className="text-sm text-texto-2">{modelo.motivo}</p>
        </Card>
      ) : (
        <>
          <Card titulo={`Etapas (${modelo.etapas.length})`}>
            {modelo.etapas.length === 0 ? (
              <Vazio>
                Nenhuma etapa no roteiro ainda. Comece pelas que se repetem em todo cliente novo — enviar o
                contrato, assinar, agendar a primeira sessão — e diga de quem é cada uma.
              </Vazio>
            ) : (
              <ul className="space-y-4">
                {modelo.etapas.map((etapa) => (
                  <LinhaDaEtapa key={etapa.id} etapa={etapa} />
                ))}
              </ul>
            )}
          </Card>

          <details className="mt-4 rounded-2xl border border-borda-sutil bg-poco px-4 py-3">
            <summary className="trans list-none cursor-pointer text-sm font-medium text-primaria-2 [&::-webkit-details-marker]:hidden">
              + Nova etapa
            </summary>
            <form action={salvarEtapaDoForm} className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Campo label="Título">
                  <Input name="titulo" maxLength={200} required placeholder="O que precisa acontecer" />
                </Campo>
              </div>
              <Campo label="De quem é">
                {/* Sem opção em branco: a ação recusa qualquer valor fora do
                    enum, e um campo que começa vazio convida para esse erro. */}
                <Select name="responsavel" defaultValue="mentor">
                  <option value="mentor">Do mentor</option>
                  <option value="mentorado">Do mentorado</option>
                </Select>
              </Campo>
              <Campo label="Posição no roteiro">
                <Input type="number" name="ordem" min={0} step={1} defaultValue={0} />
              </Campo>
              <div className="sm:col-span-2">
                <Campo label="Descrição (opcional)">
                  <TextArea name="descricao" maxLength={2000} rows={3} />
                </Campo>
              </div>
              <div className="sm:col-span-2">
                <label className="flex items-center gap-2 text-sm text-texto-2">
                  <input type="checkbox" name="obrigatoria" value="1" defaultChecked className="h-4 w-4" />
                  Obrigatória
                </label>
                <p className="mt-1.5 text-xs text-texto-2">
                  Só as obrigatórias contam para o progresso e para o onboarding ficar concluído. As
                  opcionais aparecem na lista do cliente, mas não seguram ninguém.
                </p>
              </div>
              <div className="sm:col-span-2">
                <Botao>Salvar etapa</Botao>
              </div>
            </form>
          </details>
        </>
      )}
    </>
  );
}
