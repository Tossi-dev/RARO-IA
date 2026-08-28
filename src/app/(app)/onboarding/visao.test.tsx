// @vitest-environment jsdom
// Testes de render das duas telas de onboarding: o modelo (`OnboardingVisao`)
// e o card do portal (`PrimeirosPassos`).
//
// O QUE ESTA SUÍTE PROVA
// ----------------------
// 1) com `pct: null` a barra NÃO é desenhada, e o texto explica por quê — uma
//    barra em 0% para quem entrou num roteiro sem obrigatória lê como
//    acusação, e uma barra sem denominador não mede nada;
// 2) concluído também tira a barra: 100% para sempre vira enfeite;
// 3) etapa do MENTOR aparece no portal como informação, sem botão de marcar;
// 4) a tela do time não mostra documento nenhum — nem nome de arquivo, nem
//    caminho, nem link — e nem nome de cliente: ela é a régua, não a medição;
// 5) zero emoji.

import { renderToStaticMarkup } from "react-dom/server";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { Etapa, MeuOnboarding, OnboardingDoMentorado } from "@/lib/onboarding/dados";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/lib/onboarding/acoes-form", () => ({
  salvarEtapaDoForm: vi.fn(),
  reordenarEtapaDoForm: vi.fn(),
  arquivarEtapaDoForm: vi.fn(),
  marcarEtapaDoMentorDoForm: vi.fn(),
  marcarMinhaEtapaDoForm: vi.fn(),
}));

const { OnboardingVisao, OnboardingEstruturado } = await import("./visao");
const { PrimeirosPassos } = await import("../portal/primeiros-passos");

function etapa(over: Partial<Etapa> = {}): Etapa {
  return {
    id: "e1",
    workspaceId: "ws-1",
    ordem: 1,
    titulo: "Assinar o contrato",
    descricao: "",
    responsavel: "mentorado",
    obrigatoria: true,
    ativa: true,
    criadoEm: "2026-08-01T10:00:00Z",
    ...over,
  };
}

function modelo(over: Partial<OnboardingDoMentorado> = {}): OnboardingDoMentorado {
  return {
    conectado: true,
    motivo: "",
    etapas: [],
    progresso: [],
    estado: { pct: null, proximaEtapa: null, pendentesDoMentor: [], pendentesDoMentorado: [], concluido: false },
    ...over,
  };
}

function meu(over: Partial<MeuOnboarding> = {}): MeuOnboarding {
  return { ...modelo(), ehMentorado: true, ...over };
}

const renderTime = (m: OnboardingDoMentorado, erro = "") =>
  renderToStaticMarkup(<OnboardingVisao modelo={m} erro={erro} />);
const renderPortal = (m: MeuOnboarding) => renderToStaticMarkup(<PrimeirosPassos onboarding={m} />);

function textoDe(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

function preencherTextarea(textarea: HTMLTextAreaElement, valor: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  setter.call(textarea, valor);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("OnboardingVisao — a régua", () => {
  it("sem conexão, mostra o motivo e não oferece formulário", () => {
    const html = renderTime(modelo({ conectado: false, motivo: "Não foi possível carregar o roteiro agora." }));

    expect(textoDe(html)).toContain("Não foi possível carregar o roteiro agora");
    expect(html).not.toContain('name="titulo"');
  });

  it("roteiro vazio diz isso com uma frase, e o formulário aparece", () => {
    const html = renderTime(modelo());

    expect(textoDe(html)).toContain("Nenhuma etapa no roteiro ainda");
    expect(html).toContain('name="titulo"');
  });

  it("mostra de quem é a etapa e se ela é obrigatória", () => {
    const html = renderTime(
      modelo({
        etapas: [
          etapa({ id: "a", responsavel: "mentorado", obrigatoria: true }),
          etapa({ id: "b", ordem: 2, titulo: "Enviar contrato", responsavel: "mentor", obrigatoria: false }),
        ],
      }),
    );
    const t = textoDe(html);

    // Pelo gancho, e não pelo texto solto: "Do mentor" também aparece no
    // `<option>` do formulário de nova etapa, então procurar a frase na
    // página inteira passaria mesmo com o rótulo da linha apagado.
    expect(html).toContain('data-responsavel="mentorado"');
    expect(html).toContain('data-responsavel="mentor"');
    expect(t).toContain("Do mentorado");
    expect(t).toContain("Obrigatória");
    expect(t).toContain("Opcional");
  });

  it("etapa fora do roteiro aparece marcada, e sem os botões de mexer", () => {
    const html = renderTime(modelo({ etapas: [etapa({ ativa: false })] }));

    expect(textoDe(html)).toContain("fora do roteiro");
    // Nada de reordenar ou arquivar o que já saiu. A checagem é pelo campo
    // escondido `id`, que só os dois formulários DA LINHA carregam — procurar
    // por `name="ordem"` pegaria também o formulário de nova etapa, que está
    // logo abaixo e deve continuar existindo.
    expect(html).not.toContain('name="id"');
    expect(textoDe(html)).not.toContain("Tirar do roteiro");

    // E a linha ATIVA tem os dois.
    const comAtiva = renderTime(modelo({ etapas: [etapa({ ativa: true })] }));
    expect(comAtiva).toContain('name="id"');
    expect(textoDe(comAtiva)).toContain("Tirar do roteiro");
  });

  it("o campo de responsável não tem opção em branco", () => {
    // A ação recusa valor fora do enum; um campo que começa vazio convida
    // para esse erro.
    const html = renderTime(modelo());
    expect(html).toContain('value="mentor"');
    expect(html).toContain('value="mentorado"');
    expect(html).not.toContain('<option value=""');
  });

  it("NÃO mostra documento nenhum — nem nome, nem caminho, nem link", () => {
    // O contrato assinado de um cliente é dado dele. O lugar onde ele já
    // aparece, para quem pode, é o bloco de arquivos da ficha (tarefa 12).
    const html = renderTime(modelo({ etapas: [etapa({ titulo: "Assinar o contrato" })] }));

    expect(html).not.toContain("<a href");
    expect(html).not.toContain(".pdf");
    expect(html).not.toContain("storage");
    expect(html).not.toContain("documento");
  });

  it("NÃO mostra nome de cliente nenhum — é a régua, não a medição", () => {
    const html = renderTime(modelo({ etapas: [etapa()], progresso: [] }));
    const t = textoDe(html);

    expect(t).not.toMatch(/mentorados? em programa|carteira/i);
    expect(html).not.toContain('name="mentoradoId"');
  });
});

describe("OnboardingEstruturado — coleta mínima e consentida", () => {
  it("ao desmarcar consentimento no DOM, limpa a textarea e a desabilita", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<OnboardingEstruturado />));
    const consentimento = host.querySelector<HTMLInputElement>('input[name="consentimentoMapa"]')!;
    const mapa = host.querySelector<HTMLTextAreaElement>('textarea[name="mapa"]')!;
    act(() => {
      consentimento.click();
      preencherTextarea(mapa, "contexto que não deve permanecer");
    });
    expect(mapa.value).toBe("contexto que não deve permanecer");
    act(() => consentimento.click());
    expect(mapa.value).toBe("");
    expect(mapa.disabled).toBe(true);
    act(() => root.unmount());
    host.remove();
  });

  it("ao clicar 'Prefiro não responder' no DOM, limpa a textarea e a desabilita", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(<OnboardingEstruturado />));
    const consentimento = host.querySelector<HTMLInputElement>('input[name="consentimentoObjetivo"]')!;
    const objetivo = host.querySelector<HTMLTextAreaElement>('textarea[name="objetivo"]')!;
    const recusar = host.querySelector<HTMLButtonElement>('[data-onboarding-step="objetivo"] button')!;
    await act(async () => {
      consentimento.click();
      preencherTextarea(objetivo, "objetivo privado");
    });
    expect(objetivo.value).toBe("objetivo privado");
    await act(async () => recusar.click());
    expect(objetivo.value).toBe("");
    expect(objetivo.disabled).toBe(true);
    await act(async () => root.unmount());
    host.remove();
  });

  it("oferece consentimento granular para mapa, objetivo e primeira meta", () => {
    const html = renderToStaticMarkup(<OnboardingEstruturado />);
    expect(html).toContain('name="consentimentoMapa"');
    expect(html).toContain('name="consentimentoObjetivo"');
    expect(html).toContain('name="consentimentoMeta"');
    expect(html).toContain('name="mapa"');
    expect(html).toContain('name="objetivo"');
    expect(html).toContain('name="primeiraMeta"');
  });

  it("explica que cada resposta é opcional e oferece prefiro não responder", () => {
    const html = renderToStaticMarkup(<OnboardingEstruturado />);
    expect(textoDe(html)).toContain("Prefiro não responder");
    expect(textoDe(html)).toMatch(/opcional/i);
    expect(textoDe(html)).not.toMatch(/telefone|cpf|renda|senha|documento/i);
  });

  it("mantém o avanço parcial no fluxo sem exigir os outros blocos", () => {
    const html = renderToStaticMarkup(<OnboardingEstruturado />);
    expect(html).toContain('data-onboarding-step="mapa"');
    expect(html).toContain('data-onboarding-step="objetivo"');
    expect(html).toContain('data-onboarding-step="meta"');
    expect(html).toContain('data-abandono-parcial="true"');
  });
});

describe("PrimeirosPassos — a barra", () => {
  const comEtapas = (over: Partial<MeuOnboarding> = {}) =>
    meu({ etapas: [etapa()], ...over });

  it("com pct null a barra NÃO é desenhada, e o texto explica", () => {
    const html = renderPortal(
      comEtapas({
        etapas: [etapa({ obrigatoria: false })],
        estado: { pct: null, proximaEtapa: null, pendentesDoMentor: [], pendentesDoMentorado: [], concluido: false },
      }),
    );

    expect(html).not.toContain("progressbar");
    expect(textoDe(html)).toContain("Ainda não há passo obrigatório no seu roteiro");
    // E nada de "0%" na tela de quem acabou de entrar.
    expect(textoDe(html)).not.toContain("0%");
  });

  it("com pct número, a barra aparece com o número", () => {
    const html = renderPortal(
      comEtapas({
        estado: { pct: 50, proximaEtapa: null, pendentesDoMentor: [], pendentesDoMentorado: [], concluido: false },
      }),
    );

    expect(textoDe(html)).toContain("50% do essencial concluído");
  });

  it("concluído TIRA a barra e comemora — 100% para sempre vira enfeite", () => {
    const html = renderPortal(
      comEtapas({
        estado: { pct: 100, proximaEtapa: null, pendentesDoMentor: [], pendentesDoMentorado: [], concluido: true },
      }),
    );
    const t = textoDe(html);

    expect(t).toContain("Tudo o que era essencial já está feito");
    expect(t).not.toContain("100% do essencial");
  });
});

describe("PrimeirosPassos — de quem é cada passo", () => {
  it("etapa do MENTOR aparece como informação, sem botão", () => {
    const html = renderPortal(meu({ etapas: [etapa({ responsavel: "mentor", titulo: "Enviar contrato" })] }));
    const t = textoDe(html);

    expect(t).toContain("Enviar contrato");
    expect(t).toContain("Este passo é com seu mentor");
    expect(html).not.toContain('name="etapaId"');
  });

  it("etapa com responsável ilegível também não ganha botão", () => {
    const html = renderPortal(meu({ etapas: [etapa({ responsavel: "quem-sabe" })] }));
    expect(html).not.toContain('name="etapaId"');
  });

  it("etapa do mentorado ganha o botão, e o valor alterna com o estado", () => {
    const aberta = renderPortal(meu({ etapas: [etapa()] }));
    const feita = renderPortal(
      meu({
        etapas: [etapa()],
        progresso: [{ etapaId: "e1", mentoradoId: "m1", concluida: true, concluidaEm: "2026-08-02T10:00:00Z" }],
      }),
    );

    expect(aberta).toContain('name="concluida" value="1"');
    expect(feita).toContain('name="concluida" value="0"');
    expect(textoDe(feita)).toContain("Feito");
  });

  it("etapa fora do roteiro não aparece para o cliente", () => {
    const html = renderPortal(meu({ etapas: [etapa({ id: "viva" }), etapa({ id: "morta", ativa: false })] }));
    expect(html.match(/name="etapaId"/g) ?? []).toHaveLength(1);
  });

  it("não promete upload de contrato — o envio continua sendo do mentor", () => {
    // Decisão do dono em 20/08: a RLS de 0015 só aceita escrita de
    // dono/gestor, e abrir escrita de cliente no storage é migração nova.
    const html = renderPortal(meu({ etapas: [etapa({ titulo: "Assinar o contrato" })] }));

    expect(html).not.toContain('type="file"');
    expect(html).not.toContain("enctype");
    expect(textoDe(html)).not.toMatch(/envie o arquivo|anexar|upload/i);
  });
});

describe("PrimeirosPassos — quando o card some", () => {
  it("quem não é mentorado não vê o card, MESMO havendo etapas no roteiro", () => {
    // O "mesmo havendo etapas" não é enfeite: sem ele, a asserção passava por
    // acidente — o roteiro de teste estava vazio e o card sumia pelo outro
    // caminho. Um mutante que removia a checagem de papel sobreviveu.
    expect(renderPortal(meu({ ehMentorado: false, etapas: [etapa()] }))).toBe("");
  });

  it("sem conexão, o card também não aparece — o portal já avisa por ele", () => {
    expect(renderPortal(meu({ conectado: false, motivo: "x", etapas: [etapa()] }))).toBe("");
  });

  it("roteiro sem etapa ativa não vira card vazio", () => {
    expect(renderPortal(meu({ etapas: [] }))).toBe("");
    expect(renderPortal(meu({ etapas: [etapa({ ativa: false })] }))).toBe("");
  });
});

describe("as duas telas — zero emoji", () => {
  const permitidos = new Set(["▲", "▼", "▬", "—", "·", "•", "→"]);

  function achados(html: string): string[] {
    const fora: string[] = [];
    for (const ch of html) {
      if (permitidos.has(ch)) continue;
      if (/\p{Extended_Pictographic}/u.test(ch)) fora.push(ch);
    }
    return fora;
  }

  it("no modelo, vazio e cheio", () => {
    expect(achados(renderTime(modelo()))).toEqual([]);
    expect(
      achados(
        renderTime(
          modelo({
            etapas: [etapa(), etapa({ id: "b", ordem: 2, responsavel: "mentor", ativa: false })],
          }),
        ),
      ),
    ).toEqual([]);
  });

  it("no portal, nos três estados de barra", () => {
    for (const estado of [
      { pct: null, proximaEtapa: null, pendentesDoMentor: [], pendentesDoMentorado: [], concluido: false },
      { pct: 40, proximaEtapa: null, pendentesDoMentor: [], pendentesDoMentorado: [], concluido: false },
      { pct: 100, proximaEtapa: null, pendentesDoMentor: [], pendentesDoMentorado: [], concluido: true },
    ]) {
      expect(achados(renderPortal(meu({ etapas: [etapa()], estado })))).toEqual([]);
    }
  });
});
