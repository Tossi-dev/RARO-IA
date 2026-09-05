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
import type { FatoHistorico } from "@/lib/mentoria/historico";
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
vi.mock("@/lib/mentoria/acoes-mensagem-form", () => ({ enviarMensagemDoPortal: vi.fn() }));

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
        eventoGoogleId: "",
        linkReuniao: "",
        gravacaoLiberada: false,
        transcricaoLiberada: false,
        transcritaEm: null,
        transcricaoOrigem: "",
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
      { id: "c-hostil", workspaceId: "ws-1", mentoradoId: "ment-1", titulo: "Conteúdo hostil", url: URL_HOSTIL, liberadoEm: "2026-01-01T00:00:00Z", arquivado: false, criadoEm: "2026-01-01T00:00:00Z" },
      { id: "c-valido", workspaceId: "ws-1", mentoradoId: "ment-1", titulo: "Conteúdo válido", url: URL_VALIDA, liberadoEm: "2026-01-01T00:00:00Z", arquivado: false, criadoEm: "2026-01-01T00:00:00Z" },
    ],
    // Vazia na fixture base: a linha do tempo entra na tela na Tarefa 20, e
    // quem a preenche é `lerPortal` (Tarefa 19), não esta fixture.
    linhaTempo: [],
    mensagens: [],
    contratos: [],
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
    linhaTempo: [],
    mensagens: [],
    contratos: [],
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
    linhaTempo: [],
    mensagens: [],
    contratos: [],
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
  it("identifica meta aberta cujo prazo já passou", async () => {
    lerPortalMock.mockResolvedValue(
      portalConectado({
        tarefas: [{ ...portalConectado().tarefas[0], titulo: "Enviar proposta", prazo: "2020-01-01" }],
      }),
    );

    const html = await renderizarPortal();

    expect(html).toContain("Meta vencida");
  });

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

  // ESTE TESTE FOI INVERTIDO NA TAREFA 20, e a inversão precisa ser lida
  // inteira antes de alguém achar que a proteção afrouxou.
  //
  // Ele dizia: "a transcrição NUNCA aparece no HTML". Fazia sentido enquanto a
  // leitura do portal nem pedia a coluna ao banco. Agora o portal lê
  // `sessao_do_portal` (0017), e a view devolve `''` em `transcricao` enquanto
  // a liberação estiver desligada. Ou seja: se o campo chegou preenchido à
  // tela, é porque o mentor liberou — o banco já decidiu, e a tela apenas
  // desenha o que recebeu.
  //
  // O invariante que sobrou é mais forte que o antigo, porque não depende de a
  // tela lembrar de nada: TEXTO VAZIO NÃO DESENHA SEÇÃO. O par de testes
  // abaixo trava os dois lados.
  it("transcrição vazia (não liberada pela view) não desenha seção nenhuma, nem cabeçalho", async () => {
    lerPortalMock.mockResolvedValue(
      portalConectado({
        sessoes: [
          {
            ...portalConectado().sessoes[0],
            transcricao: "",
            linkGravacao: "",
          },
        ],
      })
    );

    const html = await renderizarPortal();

    expect(html).not.toContain(TRANSCRICAO_SECRETA);
    // Nem o rótulo do bloco fechado: "Ver a transcrição desta sessão" contaria
    // à pessoa que existe uma transcrição que ela não pode abrir, o que é uma
    // forma mais lenta de vazar a mesma informação.
    expect(html).not.toContain("Ver a transcrição");
    expect(html).not.toContain("Assistir à gravação");
    // E o resumo, que sempre foi público, continua aparecendo.
    expect(html).toContain("Resumo público da sessão.");
  });

  it("transcrição preenchida (liberada pela view) aparece — é o que a liberação significa", async () => {
    lerPortalMock.mockResolvedValue(portalConectado());

    const html = await renderizarPortal();

    // A fixture base traz a transcrição preenchida, e preenchida só chega da
    // view quando `transcricao_liberada` é verdadeira.
    expect(html).toContain(TRANSCRICAO_SECRETA);
    expect(html).toContain("Ver a transcrição desta sessão");
  });

  // A tela não pode ter uma segunda régua de visibilidade: quem decide é a
  // view. Este teste falha se alguém acrescentar um `if (flag)` na tela — com
  // a flag desligada e o campo preenchido, o texto TEM que aparecer, porque
  // nesse cenário quem mentiu foi a flag, não a view.
  it("desenha pelo CONTEÚDO do campo, nunca por uma flag da linha", async () => {
    const base = portalConectado().sessoes[0];
    lerPortalMock.mockResolvedValue(
      portalConectado({
        sessoes: [{ ...base, transcricao: TRANSCRICAO_SECRETA, transcricaoLiberada: false }],
      })
    );

    const html = await renderizarPortal();

    expect(html).toContain(TRANSCRICAO_SECRETA);
  });

  it("zero emoji no HTML do estado conectado", async () => {
    lerPortalMock.mockResolvedValue(portalConectado());

    const html = await renderizarPortal();

    expect(semEmoji(html)).toBe(true);
  });

  // Defeito visual 2 (fotos/portal.png) — o selo "Em 3 Dias" nasceu de
  // `capitalize` (CSS), que maiuscula CADA PALAVRA; em português só a
  // primeira letra de uma frase é maiúscula. A correção é `first-letter:
  // uppercase`, nunca `capitalize`, no selo da próxima sessão.
  it("REGRA VISUAL 2 — o selo da próxima sessão não usa `capitalize` (maiuscula cada palavra); só `first-letter:uppercase`", async () => {
    // uma sessão daqui a alguns dias — `diasAte` só devolve texto não-vazio
    // para uma data futura, o que é o único caso em que o selo aparece.
    const daqui3dias = new Date(Date.now() + 3 * 86_400_000).toISOString();
    lerPortalMock.mockResolvedValue(
      portalConectado({
        proxima: {
          id: "sessao-proxima",
          workspaceId: "ws-1",
          matriculaId: "mat-1",
          turmaId: null,
          numero: 9,
          quando: daqui3dias,
          duracaoMin: 60,
          status: "agendada",
          linkGravacao: "",
          transcricao: "",
          resumo: "",
          eventoGoogleId: "",
          linkReuniao: "",
          gravacaoLiberada: false,
          transcricaoLiberada: false,
          transcritaEm: null,
          transcricaoOrigem: "",
          criadoEm: "2026-01-01T00:00:00Z",
        },
      })
    );

    const html = await renderizarPortal();

    // o selo de fato renderizou (senão o teste provaria menos do que diz).
    expect(html.toLowerCase()).toContain("em 3 dias");
    // nenhuma classe `capitalize` sobrou no HTML — a causa raiz do defeito.
    expect(html).not.toContain("capitalize");
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

// ============================================================
// Tarefa 20 — linha do tempo e link de gravação
// ============================================================

describe("Portal — Sua evolução (linha do tempo)", () => {
  function fato(over: Partial<FatoHistorico> = {}): FatoHistorico {
    return {
      quando: "2026-08-01T10:00:00Z",
      tipo: "marco",
      titulo: "Marco: primeiro cliente fechado",
      detalhe: "",
      visibilidade: "publico",
      ...over,
    };
  }

  it("lista vazia mostra frase honesta, e não uma lista vazia calada", async () => {
    lerPortalMock.mockResolvedValue(portalConectado({ linhaTempo: [] }));

    const html = await renderizarPortal();

    expect(html).toContain("Sua evolução");
    expect(html).toContain("Ainda não há nada para contar por aqui");
  });

  it("desenha o que a leitura projetou, sem filtrar de novo", async () => {
    lerPortalMock.mockResolvedValue(
      portalConectado({
        linhaTempo: [
          fato({ titulo: "Marco: primeiro cliente fechado", detalhe: "Fechou em julho." }),
          fato({ tipo: "sessao", titulo: "Sessão 2 realizada", quando: "2026-08-01T10:00:00Z" }),
        ],
      })
    );

    const html = await renderizarPortal();

    expect(html).toContain("Marco: primeiro cliente fechado");
    expect(html).toContain("Fechou em julho.");
    expect(html).toContain("Sessão 2 realizada");
  });

  // Defesa em profundidade: mesmo que uma camada anterior seja adulterada,
  // conteúdo privado nunca deve chegar à marcação do portal.
  it("oculta fato interno mesmo quando ele chega à visão", async () => {
    lerPortalMock.mockResolvedValue(
      portalConectado({ linhaTempo: [fato({ tipo: "nota", titulo: "Nota interna", visibilidade: "interno" })] })
    );

    const html = await renderizarPortal();

    expect(html).not.toContain("Nota interna");
  });

  it("data inválida não vira data inventada — some a linha, fica o fato", async () => {
    lerPortalMock.mockResolvedValue(
      portalConectado({ linhaTempo: [fato({ titulo: "Marco sem data", quando: "ontem à noite" })] })
    );

    const html = await renderizarPortal();

    expect(html).toContain("Marco sem data");
    expect(html).not.toContain("ontem à noite");
    expect(html).not.toContain("Invalid Date");
    expect(html).not.toContain("NaN");
  });
});

describe("Portal — link de gravação liberado", () => {
  function comLink(linkGravacao: string) {
    const base = portalConectado().sessoes[0];
    return portalConectado({ sessoes: [{ ...base, linkGravacao, transcricao: "" }] });
  }

  it("link http(s) válido vira âncora clicável", async () => {
    lerPortalMock.mockResolvedValue(comLink("https://exemplo.com/gravacao-1"));

    const html = await renderizarPortal();

    expect(html).toContain('href="https://exemplo.com/gravacao-1"');
    expect(html).toContain("Assistir à gravação");
    // Nunca sem `rel`: `target="_blank"` sem `noopener` entrega à página
    // aberta uma referência para esta.
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it.each([
    ["javascript:alert(1)"],
    ["data:text/html,<script>alert(1)</script>"],
    ["/caminho/relativo"],
    ["exemplo.com/sem-esquema"],
    ["   "],
  ])("link %j não vira âncora, e nem o rótulo aparece", async (link) => {
    lerPortalMock.mockResolvedValue(comLink(link));

    const html = await renderizarPortal();

    expect(html).not.toContain("Assistir à gravação");
    expect(html.toLowerCase()).not.toContain("javascript:alert");
    expect(html).not.toContain("data:text/html");
  });
});

describe("Portal — identificadores nunca chegam à marcação", () => {
  it("nem mentorado_id, nem perfil_id, nem telefone, nem papel", async () => {
    lerPortalMock.mockResolvedValue(
      portalConectado({
        linhaTempo: [
          {
            quando: "2026-08-01T10:00:00Z",
            tipo: "marco",
            titulo: "Marco: primeiro cliente fechado",
            detalhe: "",
            visibilidade: "publico",
          },
        ],
      })
    );

    const html = await renderizarPortal();

    // O id da pessoa e o id do perfil de autenticação não têm serventia
    // nenhuma na tela dela, e são exatamente o que alguém tentaria trocar.
    expect(html).not.toContain("ment-1");
    expect(html).not.toContain("perfil-1");
    expect(html).not.toContain(TELEFONE_SECRETO);
    expect(html).not.toContain(EMAIL_SECRETO);
    for (const papel of ["dono", "gestor", "mentor", "mentorado"]) {
      expect(html).not.toContain(`"${papel}"`);
    }
  });

  it("zero emoji também com a linha do tempo e a transcrição desenhadas", async () => {
    lerPortalMock.mockResolvedValue(
      portalConectado({
        linhaTempo: [
          {
            quando: "2026-08-01T10:00:00Z",
            tipo: "marco",
            titulo: "Marco: primeiro cliente fechado",
            detalhe: "",
            visibilidade: "publico",
          },
        ],
      })
    );

    const html = await renderizarPortal();

    expect(semEmoji(html)).toBe(true);
  });
});

describe("Portal — conversa individual e contrato", () => {
  it("desenha apenas a projeção segura e oferece resposta sem destinatário no formulário", async () => {
    lerPortalMock.mockResolvedValue(
      portalConectado({
        mensagens: [
          {
            id: "msg-1",
            direcao: "gestao_para_mentorado",
            texto: "O que você percebeu nessa semana?",
            criadoEm: "2026-08-10T10:00:00Z",
          },
        ],
        contratos: [
          {
            id: "contrato-1",
            assinadoEm: "2026-08-01",
            vigenciaInicio: "2026-08-01",
            vigenciaFim: null,
            status: "assinado",
          },
        ],
      })
    );

    const html = await renderizarPortal();

    expect(html).toContain("Conversa com seu mentor");
    expect(html).toContain("O que você percebeu nessa semana?");
    expect(html).toContain('name="texto"');
    expect(html).not.toContain('name="mentoradoId"');
    expect(html).toContain("Contratos liberados");
    expect(html).toContain("Contrato assinado");
    expect(html).not.toContain("valor_total");
    expect(html).not.toContain("9999");
  });
});

describe("Portal — referência visual aprovada", () => {
  it("organiza a primeira dobra como acompanhamento, sem aparência financeira", async () => {
    lerPortalMock.mockResolvedValue(portalConectado());

    const html = await renderizarPortal();

    expect(html).toContain('data-portal-visual="referencia-aprovada"');
    expect(html).toContain("Seu progresso");
    expect(html).toContain("Tarefas desta semana");
    expect(html).toContain("Sua jornada");
    expect(html).not.toContain("Faturamento");
  });

  it("mantém ações e seções reais navegáveis na nova composição", async () => {
    lerPortalMock.mockResolvedValue(portalConectado());

    const html = await renderizarPortal();

    expect(html).toContain('id="tarefas-da-semana"');
    expect(html).toContain("Conversa com seu mentor");
    expect(html).toContain("Marcos conquistados");
    expect(html).toContain("Conteúdos liberados");
    expect(html).toContain("Histórico de sessões");
    expect(html).toContain('name="tarefaId"');
  });

  it("não inventa foco, progresso ou próxima sessão quando faltam dados", async () => {
    lerPortalMock.mockResolvedValue(portalConectado({ matriculas: [], proxima: null, tarefas: [], scores: [] }));

    const html = await renderizarPortal();

    expect(soTexto(html)).toContain("Nenhuma matrícula por aqui no momento");
    expect(soTexto(html)).toContain("Nenhuma sessão marcada no momento");
    expect(soTexto(html)).toContain("Nenhuma tarefa combinada por aqui");
    expect(soTexto(html)).toContain("Ainda não há histórico de evolução");
    expect(soTexto(html)).toContain("Nenhuma jornada vinculada");
    expect(soTexto(html)).not.toContain("Acompanhamento em construção");
    expect(soTexto(html)).not.toContain("Seu mentor faz perguntas");
    expect(soTexto(html)).not.toContain("O que você percebe hoje");
  });

  it("deriva o programa e o selo da mesma matrícula atual", async () => {
    const base = portalConectado();
    const concluida = { ...base.matriculas[0], matricula: { ...base.matriculas[0].matricula, id: "mat-antiga", status: "concluida" as const }, programa: { ...base.matriculas[0].programa!, id: "prog-antigo", nome: "Programa antigo" } };
    const ativa = { ...base.matriculas[0], matricula: { ...base.matriculas[0].matricula, id: "mat-atual", status: "ativa" as const }, programa: { ...base.matriculas[0].programa!, id: "prog-atual", nome: "Programa atual" } };
    lerPortalMock.mockResolvedValue(portalConectado({ matriculas: [concluida, ativa] }));

    const html = await renderizarPortal();

    expect(soTexto(html)).toContain("Programa Programa atual");
    expect(soTexto(html)).toContain("Matrícula ativa");
    expect(soTexto(html)).not.toContain("Matrícula concluída");
  });
});
