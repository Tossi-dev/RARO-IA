// Testes de `page.tsx` (o Portal do Mentorado) — ALTO 3 da auditoria.
//
// Até esta suíte nascer, `vitest.config.ts` só incluía `src/**/*.test.ts`
// (nenhum `.test.tsx` rodava — ver o comentário em `vitest.config.ts`), e a
// tela do portal não tinha um teste sequer: cinco mutantes de vazamento
// sobreviveriam sem ninguém notar (ver o bloco de comentário no fim deste
// arquivo, com o procedimento de prova de mutação que foi de fato rodado).
//
// MÉTODO: `Portal` é um Server Component ASSÍNCRONO — React puro
// (`react-dom/server`) não sabe renderizar um componente-função async
// dentro de `renderToStaticMarkup` (isso é um truque do compilador RSC do
// Next, não do React em si). Por isso este arquivo chama `Portal(props)`
// diretamente (função async comum), resolve manualmente qualquer elemento
// cujo `type` também seja uma função async em algum ponto da árvore
// (`resolverArvoreAssincrona`, abaixo — hoje o único caso é
// `PortalAindaNaoLigado`), e só then passa o resultado, já 100% síncrono,
// para `renderToStaticMarkup`. Depois disso o React de verdade renderiza
// tudo (Card, Badge, ProgressBar, PageHeader...), exatamente como faria em
// produção.

import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Portal as PortalDados } from "@/lib/mentoria/portal";

const { lerPortalMock } = vi.hoisted(() => ({ lerPortalMock: vi.fn() }));

vi.mock("@/lib/mentoria/portal", () => ({ lerPortal: lerPortalMock }));

// `concluirTarefa`/`reabrirTarefa` só são REFERENCIADAS como `action={...}`
// de formulário — nunca chamadas por este teste (nenhum submit acontece
// numa renderização estática). Mesmo assim, mockar evita que o módulo real
// (que importa `next/navigation`/`next/cache`/o cliente Supabase) precise
// resolver nada além de duas funções vazias.
vi.mock("@/lib/mentoria/acoes-portal", () => ({
  concluirTarefa: vi.fn(),
  reabrirTarefa: vi.fn(),
}));

const { default: Portal } = await import("./page");

afterEach(() => {
  vi.resetAllMocks();
});

// ============================================================
// resolverArvoreAssincrona — ver o comentário de método no topo do arquivo.
// ============================================================

function ehFuncaoAssincrona(valor: unknown): valor is (props: unknown) => Promise<ReactNode> {
  return typeof valor === "function" && (valor as { constructor?: { name?: string } }).constructor?.name === "AsyncFunction";
}

async function resolverArvoreAssincrona(no: ReactNode): Promise<ReactNode> {
  if (Array.isArray(no)) {
    const resolvidos: ReactNode[] = [];
    for (const item of no) resolvidos.push(await resolverArvoreAssincrona(item));
    return resolvidos;
  }
  if (isValidElement(no)) {
    const elemento = no as ReactElement<{ children?: ReactNode }>;
    if (ehFuncaoAssincrona(elemento.type)) {
      const resultado = await elemento.type(elemento.props);
      return resolverArvoreAssincrona(resultado);
    }
    if (elemento.props && "children" in elemento.props) {
      const filhosResolvidos = await resolverArvoreAssincrona(elemento.props.children);
      return cloneElement(elemento, undefined, filhosResolvidos);
    }
    return elemento;
  }
  return no;
}

async function renderizarPortal(searchParams: { erro?: string } = {}): Promise<string> {
  const arvore = await Portal({ searchParams });
  const arvoreResolvida = await resolverArvoreAssincrona(arvore);
  return renderToStaticMarkup(arvoreResolvida as ReactElement);
}

// ============================================================
// Fixtures — um `Portal` (o contrato de `lerPortal`) plausível para o
// estado "conectado", com dado sensível DELIBERADO em cada campo que a
// tela NÃO deveria mostrar (telefone, email, transcrição, url hostil) —
// exatamente os pontos que os mutantes de vazamento atacam.
// ============================================================

const TELEFONE_SECRETO = "11-99999-8888";
const EMAIL_SECRETO = "ana.secreta@exemplo.com";
const TRANSCRICAO_SECRETA = "TRANSCRICAO-INTEGRAL-DA-CALL-CONFIDENCIAL";
const URL_HOSTIL = "javascript:alert(1)";
const URL_VALIDA = "https://exemplo.com/aula-1";

function portalConectado(parcial: Partial<PortalDados> = {}): PortalDados {
  return {
    conectado: true,
    motivo: "",
    ehMentorado: true,
    mentorado: {
      id: "ment-1",
      workspaceId: "ws-1",
      alunoId: null,
      perfilId: "perfil-1",
      nome: "Ana Souza",
      telefone: TELEFONE_SECRETO,
      email: EMAIL_SECRETO,
      origem: "",
      status: "ativo",
      criadoEm: "2026-01-01T00:00:00Z",
    },
    matriculas: [
      {
        matricula: {
          id: "mat-1",
          workspaceId: "ws-1",
          mentoradoId: "ment-1",
          programaId: "prog-1",
          turmaId: null,
          inicio: "2026-01-01",
          fimPrevisto: null,
          status: "ativa",
          sessoesPrevistas: 12,
          criadoEm: "2026-01-01T00:00:00Z",
        },
        programa: {
          id: "prog-1",
          workspaceId: "ws-1",
          nome: "Elite",
          formato: "individual",
          totalSessoes: 12,
          preco: 1000,
          ativo: true,
          criadoEm: "2026-01-01T00:00:00Z",
        },
        progresso: { realizadas: 2, previstas: 12, rotulo: "sessão 2 de 12", percentual: 17, excedeu: false },
      },
    ],
    proxima: null,
    sessoes: [
      {
        id: "s-1",
        workspaceId: "ws-1",
        matriculaId: "mat-1",
        turmaId: null,
        numero: 2,
        quando: "2026-08-01T10:00:00Z",
        duracaoMin: 60,
        status: "realizada",
        linkGravacao: "",
        transcricao: TRANSCRICAO_SECRETA,
        resumo: "Resumo público da sessão.",
        criadoEm: "2026-01-01T00:00:00Z",
      },
    ],
    tarefas: [
      {
        id: "t-1",
        workspaceId: "ws-1",
        mentoradoId: "ment-1",
        sessaoId: null,
        titulo: "Fazer o exercício combinado",
        prazo: null,
        concluida: false,
        concluidaEm: null,
        marcadaPor: "",
        criadoEm: "2026-01-01T00:00:00Z",
      },
    ],
    marcos: [],
    scores: [],
    conteudos: [
      { id: "c-hostil", workspaceId: "ws-1", mentoradoId: "ment-1", titulo: "Conteúdo hostil", url: URL_HOSTIL, liberadoEm: "2026-01-01T00:00:00Z", criadoEm: "2026-01-01T00:00:00Z" },
      { id: "c-valido", workspaceId: "ws-1", mentoradoId: "ment-1", titulo: "Conteúdo válido", url: URL_VALIDA, liberadoEm: "2026-01-01T00:00:00Z", criadoEm: "2026-01-01T00:00:00Z" },
    ],
    ...parcial,
  };
}

function portalDesconectado(): PortalDados {
  return {
    conectado: false,
    motivo: "Nenhuma conexão com o banco de dados configurada. O portal não pode ser carregado agora.",
    ehMentorado: false,
    mentorado: null,
    matriculas: [],
    proxima: null,
    sessoes: [],
    tarefas: [],
    marcos: [],
    scores: [],
    conteudos: [],
  };
}

function portalSemMentorado(): PortalDados {
  return {
    conectado: true,
    motivo: "",
    ehMentorado: false,
    mentorado: null,
    matriculas: [],
    proxima: null,
    sessoes: [],
    tarefas: [],
    marcos: [],
    scores: [],
    conteudos: [],
  };
}

// ============================================================
// Regra de estilo da casa — zero emoji em qualquer HTML desta tela.
// ============================================================

/**
 * Texto VISÍVEL, sem marcação — classes CSS (`rounded-2xl`, `px-4`,
 * `py-2.5`...) e atributos carregam dígitos legítimos que não têm nada a
 * ver com "número na tela"; as asserções de "nenhum número"/"nenhum uuid"
 * deste arquivo olham só o que a pessoa efetivamente LÊ.
 */
function soTexto(html: string): string {
  return html.replace(/<[^>]*>/g, " ");
}

// `\p{Extended_Pictographic}` (a mesma propriedade Unicode que define o que
// "é emoji" nas tabelas oficiais) — diferente do teste de `textos.ts` (que
// compara contra a FAIXA LATINA porque suas amostras são só resultado de
// função pura), o HTML da PÁGINA inteira carrega travessão (—), aspas
// tipográficas e acentuação do português — nenhum dos três é emoji, e um
// limiar por faixa de código os confundiria com um.
const GLIFOS_PERMITIDOS = new Set(["▲", "▼", "▬"]);

function semEmoji(html: string): boolean {
  for (const char of html) {
    if (GLIFOS_PERMITIDOS.has(char)) continue;
    if (/\p{Extended_Pictographic}/u.test(char)) return false;
  }
  return true;
}

// ============================================================
// Estado 1 — desconectado.
// ============================================================

describe("Portal — estado desconectado (conectado: false)", () => {
  it("nenhum número, nenhum uuid, zero emoji", async () => {
    lerPortalMock.mockResolvedValue(portalDesconectado());

    const html = await renderizarPortal();

    expect(html).toContain("Nenhuma conexão com o banco de dados configurada");
    expect(soTexto(html)).not.toMatch(/\d/);
    expect(html).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(semEmoji(html)).toBe(true);
  });
});

// ============================================================
// Estado 2 — conectou, mas não é mentorado.
// ============================================================

describe("Portal — estado 'não é mentorado' (conectado: true, ehMentorado: false)", () => {
  it("nenhum nome de papel, nenhuma lista de rotas, nenhum número, zero emoji", async () => {
    lerPortalMock.mockResolvedValue(portalSemMentorado());

    const html = await renderizarPortal();

    const NOMES_DE_PAPEL = ["dono", "gestor", "comercial", "mentorado", "afiliado", "aluno"];
    const minusculo = html.toLowerCase();
    for (const papel of NOMES_DE_PAPEL) {
      expect(minusculo).not.toContain(papel);
    }
    // "lista de rotas": nenhuma rota do sistema, além do próprio destino do
    // botão de voltar, pode vazar como texto ou href nesta tela.
    for (const rota of ["/financeiro", "/crm", "/analise", "/extrato", "/integracoes", "/painel"]) {
      expect(html).not.toContain(rota);
    }
    expect(soTexto(html)).not.toMatch(/\d/);
    expect(semEmoji(html)).toBe(true);
  });

  // BAIXO 6 — "Voltar para o início" apontava para /portal, a PRÓPRIA
  // tela: quem está sem ficha de mentorado clicava e caía de volta no
  // mesmo lugar vazio. A correção troca por um formulário "Sair"
  // (`@/lib/actions`, `sair` — é sempre a saída certa para quem está no
  // lugar errado).
  it("BAIXO 6: o botão de saída não aponta para /portal", async () => {
    lerPortalMock.mockResolvedValue(portalSemMentorado());

    const html = await renderizarPortal();

    expect(html).not.toMatch(/href="\/portal"/);
    // um formulário de "Sair" — a mesma forma usada em /sem-acesso.
    expect(html.toLowerCase()).toContain("sair");
    expect(html).toMatch(/<form[^>]*>/);
  });
});

// ============================================================
// Estado 3 — conectado, com dado de verdade.
// ============================================================

describe("Portal — estado conectado (ehMentorado: true)", () => {
  it("url http(s) vira href clicável; url javascript: NUNCA vira href", async () => {
    lerPortalMock.mockResolvedValue(portalConectado());

    const html = await renderizarPortal();

    expect(html).toContain(`href="${URL_VALIDA}"`);
    expect(html).not.toContain(`href="${URL_HOSTIL}"`);
    expect(html.toLowerCase()).not.toContain("javascript:alert");
  });

  it("telefone e e-mail do mentorado NUNCA aparecem no HTML", async () => {
    lerPortalMock.mockResolvedValue(portalConectado());

    const html = await renderizarPortal();

    expect(html).not.toContain(TELEFONE_SECRETO);
    expect(html).not.toContain(EMAIL_SECRETO);
  });

  it("a transcrição da sessão NUNCA aparece no HTML (só o resumo, que É exibido)", async () => {
    lerPortalMock.mockResolvedValue(portalConectado());

    const html = await renderizarPortal();

    expect(html).not.toContain(TRANSCRICAO_SECRETA);
    expect(html).toContain("Resumo público da sessão.");
  });

  it("zero emoji no HTML do estado conectado", async () => {
    lerPortalMock.mockResolvedValue(portalConectado());

    const html = await renderizarPortal();

    expect(semEmoji(html)).toBe(true);
  });

  // MÉDIO 5 — `?erro=` nunca é o texto cru da URL: a ação manda um CÓDIGO
  // curto, a tela traduz. Um texto de ataque no lugar do código nunca
  // aparece no banner.
  describe("MÉDIO 5 — ?erro= é traduzido por código, nunca renderizado literalmente", () => {
    it("código conhecido ('tarefa') -> a frase traduzida aparece no banner", async () => {
      lerPortalMock.mockResolvedValue(portalConectado());

      const html = await renderizarPortal({ erro: "tarefa" });

      expect(html.toLowerCase()).toContain("não foi possível atualizar esta tarefa");
    });

    it("código inventado -> frase genérica, nunca o código cru", async () => {
      lerPortalMock.mockResolvedValue(portalConectado());

      const html = await renderizarPortal({ erro: "codigo-que-nao-existe-e2e-9x" });

      expect(html).not.toContain("codigo-que-nao-existe-e2e-9x");
    });

    it("texto de ataque na querystring -> NUNCA aparece no HTML (a prova do MÉDIO 5)", async () => {
      lerPortalMock.mockResolvedValue(portalConectado());
      const ataque = "Sua conta foi suspensa, ligue para 0800-000-0000 agora";

      const html = await renderizarPortal({ erro: ataque });

      expect(html).not.toContain(ataque);
      expect(html).not.toContain("0800");
      expect(html.toLowerCase()).not.toContain("suspensa");
    });

    it("sem código -> nenhum banner de erro no HTML", async () => {
      lerPortalMock.mockResolvedValue(portalConectado());

      const html = await renderizarPortal({});

      expect(html.toLowerCase()).not.toContain("não foi possível");
    });
  });
});

// ============================================================
// PROVA DE MUTAÇÃO (ALTO 3) — procedimento executado manualmente contra
// esta suíte, documentado aqui para quem herdar o código não precisar
// confiar só na palavra de quem escreveu:
//
//   1) `md5sum src/app/(app)/portal/page.tsx` guardado ANTES de qualquer
//      mutação (linha de base).
//   2) Cinco mutantes, um de cada vez, cada um restaurado ao original
//      (via o md5 do passo 1) antes do próximo:
//        M1 — trocar `urlValida ? <a href={conteudo.url}>...` por
//             `<a href={conteudo.url}>...` sempre (remove a validação).
//        M2 — imprimir `papel` (o retorno de `papelAtual()`) em algum
//             texto visível do estado "não é mentorado".
//        M3 — imprimir `mentorado.telefone` em algum ponto do estado
//             conectado.
//        M4 — imprimir `sessao.transcricao` em vez de `sessao.resumo` no
//             histórico de sessões.
//        M5 — trocar o corpo do estado "não é mentorado"
//             (`PortalAindaNaoLigado`) pelo portal cheio (a condição
//             `if (!portal.ehMentorado ...)` nunca redireciona para o
//             componente certo).
//   3) Cada mutante rodou `npx vitest run
//      "src/app/(app)/portal/page.test.tsx"` e TODOS os cinco fizeram ao
//      menos um teste desta suíte falhar — nenhum mutante sobreviveu.
//   4) `md5sum` conferido de novo depois de restaurar, batendo com a linha
//      de base do passo 1 — o arquivo final é bit a bit o original, não
//      uma versão "quase igual".
// ============================================================
