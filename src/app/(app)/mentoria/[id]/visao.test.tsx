// Testes de render de `FichaVisao` — a ficha do mentorado.
//
// O QUE ESTA SUÍTE PROVA (Tarefa 11 da Fase 2, "ficha com histórico e saúde")
// --------------------------------------------------------------------------
// 1) SEM BASE NÃO DESENHA NOTA. Com `saude.score: null` o card de saúde não
//    escreve `0` no lugar do score e não desenha barra de progresso — ausência
//    de dado não é nota baixa, é ausência, e é isso que a tela diz;
// 2) PARCIALIDADE É DITA POR EXTENSO. Com `saude.parcial: true` a tela NOMEIA
//    os fatores que ficaram de fora da conta, em vez de mostrar um número
//    redondo que parece completo;
// 3) A LINHA DO TEMPO DO TIME MOSTRA O QUE É DO TIME. Esta é a ficha interna:
//    fato `interno` (nota de CRM, cobrança, temperatura) TEM que aparecer, e
//    aparecer inteiro. É o contrário da tela do portal, que passa os fatos por
//    `projetarParaPortal` — se alguém trocar as duas por engano, o teste morre;
// 4) zero emoji, e os únicos glifos de enfeite presentes são ▲ ▼ ▬;
// 5) (herdado) defeito visual 3 (fotos/ficha.png): os blocos "+ Agendar sessão"
//    e "+ Dar baixa" não podem mostrar o marcador NATIVO `▶` do `<details>`;
// 6) LEITURA QUE FALHOU NÃO VIRA FATO. `parcial: true` é dito na aba que ABRE,
//    e nesse estado o card não afirma nada sobre a vida do mentorado (nem
//    "nenhuma sessão passada", nem "sem matrícula", nem "registre o
//    andamento") — ver o bloco 2b;
// 7) o rótulo de cada tipo de fato na linha do tempo (bloco 3b: cobrança é
//    "Sistema", nunca "Compra"), os dois estados de borda da ficha ("não deu
//    para ler" ≠ "não existe", bloco 3c) e o banner de `?erro=` (bloco 3d).
//
// SOBRE A FORMA DAS ASSERÇÕES: onde a tela faz uma AFIRMAÇÃO com número
// (quantos fatores entraram na conta, sobre quantos pontos, quanto vale a
// barra, quais fatores ficaram de fora), o teste confere a frase inteira e a
// lista inteira — não um pedaço. `toContain("Dias em silêncio")` passa com a
// lista invertida, e `toContain("55")` passa com o denominador fixo em 100:
// os dois nomes e os dois números também aparecem em outros cantos do card.
//
// MÉTODO: `FichaVisao` é uma função sync pura (recebe a `Ficha` e o
// `HistoricoDaFicha` já resolvidos) — dá para chamar direto com
// `renderToStaticMarkup`, sem o truque de árvore assíncrona que
// `portal/page.test.tsx` precisa. As asserções leem a MARCAÇÃO, e não uma
// função exportada, pelo mesmo motivo escrito em `crm/jornada-visao.test.tsx`:
// é o que a pessoa vê, e morre se algum passo posterior da tela desfizer.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ListaDocumentos } from "@/lib/documentos/dados";
import type { Ficha } from "@/lib/mentoria/dados";
import type { HistoricoDaFicha } from "@/lib/mentoria/dados-historico";
import { TIPOS_FATO, type FatoHistorico, type TipoFato } from "@/lib/mentoria/historico";
import { saudeDoMentorado, type FatorSaudeMentorado, type SaudeMentorado } from "@/lib/mentoria/saude-mentorado";
import type { Mentorado } from "@/lib/mentoria/tipos";

// `FichaVisao` só REFERENCIA `agendarSessao`/`darBaixaNaSessao` como
// `action={...}` de formulário — nunca chama. Mesmo assim o módulo real
// importa `next/cache`/`next/navigation`, que não resolvem fora do Next;
// mockar evita isso (mesma tática de `portal/page.test.tsx`).
vi.mock("@/lib/mentoria/acoes", () => ({
  agendarSessao: vi.fn(),
  darBaixaNaSessao: vi.fn(),
}));

// Mesma razão, para as três Server Actions que a Tarefa 18 trouxe.
vi.mock("@/lib/mentoria/acoes-ficha", () => ({
  sincronizarSessaoDaFicha: vi.fn(),
  transcreverSessaoDaFicha: vi.fn(),
  vincularAudioDaFicha: vi.fn(),
  liberarNoPortalDaFicha: vi.fn(),
  liberarConteudoDaFicha: vi.fn(),
  revogarConteudoDaFicha: vi.fn(),
  revogarAudioDaFicha: vi.fn(),
}));

vi.mock("@/lib/mentoria/acoes-score", () => ({ gravarScoreSemanal: vi.fn() }));
vi.mock("@/lib/ia/acoes-analise", () => ({ analisarSessao: vi.fn() }));
vi.mock("@/lib/mentoria/acoes-mensagem-form", () => ({ enviarMensagemDaFicha: vi.fn() }));

// Mesma razão, para o bloco de documentos que a ficha passou a montar
// (Tarefa 12): `./documentos` só referencia as três Server Actions como
// `action={...}`, mas o módulo real importa `next/cache`/`next/navigation`.
vi.mock("@/lib/documentos/acoes", () => ({
  anexarDocumento: vi.fn(),
  arquivarDocumento: vi.fn(),
  alternarVisivelPortal: vi.fn(),
}));

const { FichaVisao } = await import("./visao");

// ============================================================
// Fábricas
// ============================================================

function mentorado(telefone = "", email = ""): Mentorado {
  // Sem telefone e sem e-mail por padrão: os casos que contam dígito na tela
  // não podem competir com o telefone do contato.
  return {
    id: "ment-1",
    workspaceId: "ws-1",
    alunoId: "aluno-1",
    perfilId: "perfil-1",
    nome: "Beatriz Nogueira",
    telefone,
    email,
    origem: "",
    status: "ativo",
    criadoEm: "2026-01-01T00:00:00Z",
  };
}

/** A ficha mais enxuta possível: conectada, com mentorado e sem nada mais. */
function fichaVazia(): Ficha {
  return {
    conectado: true,
    motivo: "",
    mentorado: mentorado(),
    matriculas: [],
    sessoes: [],
    tarefas: [],
    marcos: [],
    scores: [],
    conteudos: [],
    atendimento: {
      conectado: true,
      encontrado: true,
      mapa: [],
      metas: [],
      passos: [],
      reflexoes: [],
      consentimentos: [],
    },
  };
}

function fichaComMatriculaAtivaESessaoAgendada(): Ficha {
  return {
    ...fichaVazia(),
    mentorado: mentorado("31 96666-4321", "beatriz@exemplo.com"),
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
          // "ativa" é a única que desenha o `<details>` de "+ Agendar sessão".
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
        progresso: { realizadas: 14, previstas: 12, rotulo: "sessão 14 de 12", percentual: 100, excedeu: true },
      },
    ],
    sessoes: [
      {
        id: "s-1",
        workspaceId: "ws-1",
        matriculaId: "mat-1",
        turmaId: null,
        numero: 15,
        quando: "2026-09-02T11:00:00Z",
        duracaoMin: 60,
        // "agendada" é a única que desenha o `<details>` de "+ Dar baixa".
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
    ],
    // Duas linhas de score: é o mínimo que `variacaoScore` aceita para
    // desenhar a pílula com um dos três glifos permitidos (▲ ▼ ▬).
    scores: [
      { id: "sc-1", workspaceId: "ws-1", mentoradoId: "ment-1", semana: "2026-08-03", score: 60, motivo: "", criadoEm: "2026-08-03T00:00:00Z" },
      { id: "sc-2", workspaceId: "ws-1", mentoradoId: "ment-1", semana: "2026-08-10", score: 68, motivo: "", criadoEm: "2026-08-10T00:00:00Z" },
    ],
  };
}

function comBase(chave: FatorSaudeMentorado["chave"], nome: string, pontos: number, max: number): FatorSaudeMentorado {
  return { chave, nome, temBase: true, pontos, max, detalhe: `${pontos} de ${max}` };
}

function semBase(chave: FatorSaudeMentorado["chave"], nome: string, max: number): FatorSaudeMentorado {
  return { chave, nome, temBase: false, pontos: null, max, detalhe: "não há o que medir ainda" };
}

/** Nenhum fator com base — o estado que NUNCA pode virar zero na tela. */
function saudeSemBaseNenhuma(): SaudeMentorado {
  return {
    score: null,
    semBase: true,
    parcial: false,
    maxComBase: 0,
    nivel: null,
    fatores: [
      semBase("presenca", "Presença nas sessões", 30),
      semBase("tarefas", "Tarefas no prazo", 25),
      semBase("silencio", "Dias em silêncio", 20),
      semBase("ritmo", "Ritmo previsto do programa", 15),
      semBase("tendencia", "Tendência do score", 10),
    ],
  };
}

/** Dois fatores pontuam, três ficaram sem base: score existe, mas é parcial. */
function saudeParcial(): SaudeMentorado {
  return {
    score: 71,
    semBase: false,
    parcial: true,
    maxComBase: 55,
    nivel: "saudavel",
    fatores: [
      comBase("presenca", "Presença nas sessões", 24, 30),
      comBase("tarefas", "Tarefas no prazo", 15, 25),
      semBase("silencio", "Dias em silêncio", 20),
      semBase("ritmo", "Ritmo previsto do programa", 15),
      semBase("tendencia", "Tendência do score", 10),
    ],
  };
}

/**
 * A saúde EXATA que `lerHistorico` devolve quando uma das leituras da conta
 * falha (`dados-historico.ts`: `saudeSemDado` = a conta de sempre chamada com
 * listas vazias). Escrita à mão aqui, o fixture divergiria da realidade no dia
 * em que um fator novo entrasse — e o teste passaria a proteger um caso que
 * não acontece. O que importa neste caso: os `detalhe` que a função escreve
 * ("nenhuma sessão passada…", "sem matrícula…") são afirmações sobre a vida da
 * pessoa deduzidas de listas VAZIAS, e é justamente o que não pode ir à tela
 * quando o vazio veio de um `permission denied`.
 */
function saudeDeLeituraQueFalhou(): SaudeMentorado {
  return saudeDoMentorado({ matriculas: [], sessoes: [], tarefas: [], scores: [] }, "2026-08-13T12:00:00Z");
}

function historico(over: Partial<HistoricoDaFicha> = {}): HistoricoDaFicha {
  return {
    conectado: true,
    motivo: "",
    parcial: false,
    fatos: [],
    saude: saudeSemBaseNenhuma(),
    ...over,
  };
}

function fato(over: Partial<FatoHistorico> = {}): FatoHistorico {
  return {
    quando: "2026-05-12T13:00:00Z",
    tipo: "nota",
    titulo: "Nota de Ana",
    detalhe: "",
    visibilidade: "interno",
    ...over,
  };
}

/**
 * A lista de documentos que a ficha recebe (Tarefa 12). O padrão é CONECTADA
 * e vazia, e não `undefined`: a prop é obrigatória de propósito — quem
 * desenha a ficha tem que dizer o que sabe sobre os arquivos, mesmo que a
 * resposta seja "nenhum". Uma prop opcional faria o bloco inteiro sumir sem
 * que ninguém tivesse decidido isso.
 */
function documentos(over: Partial<ListaDocumentos> = {}): ListaDocumentos {
  return { conectado: true, motivo: "", documentos: [], ...over };
}

function render(
  ficha: Ficha,
  hist: HistoricoDaFicha = historico(),
  erro?: string,
  docs: ListaDocumentos = documentos(),
  agendaConectada = false
): string {
  return renderToStaticMarkup(
    <FichaVisao
      ficha={ficha}
      historico={hist}
      documentos={docs}
      erro={erro}
      agendaConectada={agendaConectada}
    />
  );
}

// ============================================================
// Leitores da marcação
// ============================================================

/**
 * O texto que está no lugar do número do score. O elemento é marcado com
 * `aria-label` (e não com uma classe de estilo) porque um número solto na
 * tela precisa desse rótulo de qualquer jeito para quem usa leitor de tela —
 * o teste só lê o que a acessibilidade já obriga a existir.
 */
function scoreNaTela(html: string): string {
  const achado = /aria-label="Score de saúde do mentorado"[^>]*>([^<]*)</.exec(html);
  expect(achado, "o card de saúde não desenhou o score").not.toBeNull();
  return achado![1];
}

// "Glifo" aqui é o que a regra da casa proíbe: pictograma (emoji) e forma
// geométrica/dingbat usada como enfeite — a faixa de onde saem ▲ ▼ ▬ e de onde
// sairia um ▶, ● ou ✓. Pontuação tipográfica que o repositório já usa como
// TEXTO (— travessão, · ponto médio, • marcador da timeline, ← da migalha de
// pão) fica de fora: ela é escrita, não enfeite.
const GLIFOS_PERMITIDOS = new Set(["▲", "▼", "▬"]);

// A migalha de pão escreve `←` desde antes desta tarefa (visao.tsx) e ele é
// TEXTO de navegação, não enfeite — mas a faixa de setas inteira (U+2190–21FF)
// entra na varredura assim mesmo, com esta única exceção nomeada: sem isso um
// `→` ou `⇒` novo passaria batido, e a regra da casa é sobre o conjunto de
// glifos da tela, não sobre a lista de glifos que alguém lembrou de proibir.
const SETAS_DE_TEXTO_JA_EXISTENTES = new Set(["←"]);

function glifosForaDoPermitido(html: string): string[] {
  const achados = new Set<string>();
  for (const char of html) {
    if (GLIFOS_PERMITIDOS.has(char)) continue;
    if (SETAS_DE_TEXTO_JA_EXISTENTES.has(char)) continue;
    // ←-⇿: setas. ─-➿: box drawing, formas geométricas (onde moram ▲ ▼ ▬ e
    // ▶), símbolos diversos e dingbats. ⬀-⯿: setas e formas extras.
    const enfeite = /[←-⇿─-➿⬀-⯿]/.test(char) || /\p{Extended_Pictographic}/u.test(char);
    if (enfeite) achados.add(char);
  }
  return [...achados];
}

describe("FichaVisao — ficha 360 do atendimento", () => {
  it("explica quando não há base de atendimento", async () => {
    const ficha = fichaVazia();
    ficha.atendimento.consentimentos = [{ categoria: "mapa", consentido: true }];
    const html = render(ficha);
    expect(html).toContain("Mapa de atendimento");
    expect(html).toContain("Ainda não há dados de atendimento registrados.");
  });

  it("não exibe dados quando o consentimento está ausente", () => {
    const ficha = fichaVazia();
    ficha.atendimento.mapa.push({ id: "mapa-1", dimensao: "profissional", nota: 8, dor: "dor privada" });
    const html = render(ficha);
    expect(html).toContain("consentimento");
    expect(html).not.toContain("dor privada");
  });

  it("distingue falha de leitura de ausência de registros", () => {
    const html = render({ ...fichaVazia(), atendimento: { ...fichaVazia().atendimento, conectado: false } });
    expect(html).toContain("Não foi possível carregar os dados de atendimento agora.");
    expect(html).not.toContain("Ainda não há dados de atendimento registrados.");
  });

  it("mostra mapa, metas, passos, reflexões, relações e perguntas editáveis só na ficha profissional", () => {
    const ficha = fichaVazia();
    ficha.atendimento = {
      conectado: true,
      encontrado: true,
      mapa: [{ id: "mapa-1", dimensao: "profissional", nota: 8, dor: "sobrecarga", medo: "estagnar", objetivo: "organizar a semana" }],
      metas: [{ id: "meta-1", titulo: "Rotina sustentável", prazo: "2026-09-10", status: "em_andamento", visibilidade: "privada_profissional" }],
      passos: [{ id: "passo-1", meta_id: "meta-1", descricao: "Bloquear duas horas", responsavel: "profissional", ordem: 1, status: "pendente" }],
      reflexoes: [{ id: "ref-1", texto: "Revisar limites", origem: "profissional", visibilidade: "privada_profissional" }],
      consentimentos: [{ id: "con-1", categoria: "mapa", consentido: true }, { id: "con-2", categoria: "meta", consentido: true }, { id: "con-3", categoria: "reflexao", consentido: true }],
    };
    const html = render(ficha);
    expect(html).toContain("Mapa de atendimento");
    expect(html).toContain("Rotina sustentável");
    expect(html).toContain("Bloquear duas horas");
    expect(html).toContain("Revisar limites");
    expect(html).toContain("Relações");
    expect(html).toContain("Sugestão de pergunta");
    expect(html).toContain('contenteditable="true"');
    expect(html).toContain("profissional");
  });

  it("não expõe metas, passos ou relações quando o consentimento de meta falta", () => {
    const ficha = fichaVazia();
    ficha.atendimento = {
      ...ficha.atendimento,
      metas: [{ id: "meta-revogada", titulo: "Meta privada", status: "ativa" }],
      passos: [{ id: "passo-revogado", meta_id: "meta-revogada", descricao: "Passo privado" }],
      reflexoes: [{ id: "ref-2", texto: "Reflexão autorizada", visibilidade: "privada_profissional" }],
      consentimentos: [{ categoria: "reflexao", consentido: true }, { categoria: "meta", consentido: false }],
    };
    const html = render(ficha);
    expect(html).toContain("Reflexão autorizada");
    expect(html).not.toContain("Meta privada");
    expect(html).not.toContain("Passo privado");
    expect(html).not.toContain("Relações");
  });

  it("explica indisponibilidade de plano e relações sem ler ou expor conteúdo", () => {
    const ficha = fichaVazia();
    ficha.atendimento = { ...ficha.atendimento, conectado: false };
    const html = render(ficha);
    expect(html.match(/Não foi possível carregar os dados de atendimento agora\./g)?.length).toBeGreaterThanOrEqual(3);

    const semConsentimento = render(fichaVazia());
    expect(semConsentimento).toContain("O plano de ação não está disponível porque o consentimento está ausente.");
    expect(semConsentimento).toContain("As relações não estão disponíveis porque o consentimento está ausente.");
  });

  it("não expõe reflexões quando somente o consentimento de meta está ativo", () => {
    const ficha = fichaVazia();
    ficha.atendimento = {
      ...ficha.atendimento,
      metas: [{ id: "meta-1", titulo: "Meta autorizada" }],
      reflexoes: [{ id: "ref-3", texto: "Reflexão não autorizada" }],
      consentimentos: [{ categoria: "meta", consentido: true }, { categoria: "reflexao", consentido: false }],
    };
    const html = render(ficha);
    expect(html).toContain("Meta autorizada");
    expect(html).not.toContain("Reflexão não autorizada");
  });

  it("explica ficha de atendimento não encontrada nos três painéis", () => {
    const ficha = fichaVazia();
    ficha.atendimento = { ...ficha.atendimento, encontrado: false };
    const html = render(ficha);
    expect(html.match(/Não encontramos uma ficha de atendimento para este mentorado\./g)?.length).toBe(3);
  });
});

/**
 * Os dois painéis de aba, na ordem, e a prova de que são DOIS e de que o que
 * abre por padrão é o primeiro ("Visão geral").
 *
 * Isto não é detalhe de implementação: `Tabs` renderiza TAMBÉM o painel
 * escondido (`hidden`), então um aviso que só existe na aba "Histórico" está
 * na marcação sem estar na tela de quem acabou de abrir a ficha — e uma
 * asserção `toContain` no HTML inteiro não sabe a diferença. Tudo que precisa
 * ser VISTO na abertura é conferido dentro de `visaoGeral`.
 */
function paineis(html: string): { visaoGeral: string; historico: string } {
  const partes = html.split('role="tabpanel"');
  expect(partes.length, "a ficha não desenhou exatamente duas abas").toBe(3);
  expect(partes[1].startsWith(">"), "o painel 'Visão geral' não é o que abre por padrão").toBe(true);
  expect(partes[2].startsWith(" hidden"), "o painel 'Histórico' deveria nascer escondido").toBe(true);
  return { visaoGeral: partes[1], historico: partes[2] };
}

/** O texto que a pessoa lê, sem as tags — para conferir FRASE, e não fragmento. */
function textoDe(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** Todo valor de barra de progresso da marcação, na ordem em que aparece. */
function valoresDasBarras(html: string): string[] {
  return [...html.matchAll(/aria-valuenow="(\d+)"/g)].map((achado) => achado[1]);
}

/**
 * O rótulo que a `Timeline` imprimiu para cada fato, por título. É o que a
 * pessoa lê ao lado do fato ("Cobrança vencida — R$ 500,00 · Sistema"), e é a
 * única prova possível de `TIPO_ATIVIDADE_DO_FATO`: o mapa não é exportado, e
 * exportá-lo só para o teste trocaria a asserção sobre a TELA por uma
 * asserção sobre uma constante.
 */
function rotulosDaLinhaDoTempo(html: string): Record<string, string> {
  const mapa: Record<string, string> = {};
  const regex = /<span class="font-medium">([^<]+)<\/span> <span class="text-xs text-texto-2">· ([^·]+)·/g;
  for (const achado of html.matchAll(regex)) mapa[achado[1]] = achado[2].trim();
  return mapa;
}

// ============================================================
// 1. Score sem base não vira zero
// ============================================================

describe("card de saúde — sem base não desenha nota", () => {
  it("com `score: null` não escreve 0 no lugar do score nem desenha barra de progresso", () => {
    const html = render(fichaVazia(), historico({ saude: saudeSemBaseNenhuma() }));

    // O card existe (senão o teste provaria menos do que diz).
    expect(html).toContain("Saúde do mentorado");

    const score = scoreNaTela(html);
    expect(score).not.toMatch(/\d/);
    expect(score).toBe("sem base");

    // Nenhuma barra de progresso na tela inteira: esta ficha não tem
    // matrícula, então a única que poderia existir seria a do score.
    expect(html).not.toContain('role="progressbar"');
    // E nenhum elemento com o texto "0" sozinho — o zero disfarçado de dado.
    expect(html).not.toContain(">0<");
  });

  it("com base, o número aparece de verdade — o teste acima não passa por a tela estar vazia", () => {
    const html = render(fichaVazia(), historico({ saude: saudeParcial() }));

    expect(scoreNaTela(html)).toBe("71");
    // A barra tem que valer o MESMO que o número escrito ao lado. Uma barra
    // cheia ao lado de um 71 é um segundo número na tela, e um número que
    // ninguém calculou — esta ficha não tem matrícula, então a única barra
    // possível é a do score.
    expect(valoresDasBarras(html)).toEqual(["71"]);
  });

  it("saúde incoerente (score sem nível, ou nível sem score) cai no lado seguro: nada de nota", () => {
    // `saude-mentorado.ts` não produz este par hoje — mas quem garante isso é
    // aquele módulo, não esta tela. Se o par chegar aqui, o caminho numérico
    // imprimiria o score vazio e procuraria a cor de um nível `null`; o que a
    // tela faz é o que faria sem base nenhuma: dizer que não há nota.
    const scoreSemNivel: SaudeMentorado = { ...saudeParcial(), nivel: null };
    const nivelSemScore: SaudeMentorado = { ...saudeParcial(), score: null };

    for (const saude of [scoreSemNivel, nivelSemScore]) {
      const html = render(fichaVazia(), historico({ saude }));

      expect(scoreNaTela(html)).not.toMatch(/\d/);
      expect(valoresDasBarras(html)).toEqual([]);
    }
  });
});

// ============================================================
// 2. Parcialidade dita por extenso
// ============================================================

describe("card de saúde — a parcialidade é nomeada, nunca escondida", () => {
  it("com `parcial: true`, a frase nomeia os três fatores que ficaram de fora da conta", () => {
    const html = render(fichaVazia(), historico({ saude: saudeParcial() }));
    const { visaoGeral } = paineis(html);
    const texto = textoDe(visaoGeral);

    // A frase INTEIRA, e não pedaços dela. `toContain("Dias em silêncio")`
    // passaria com a lista invertida (os nomes dos cinco fatores estão na
    // tela de qualquer jeito, na lista ao lado), `toContain("55")` passaria
    // com o denominador fixo em 100 (o 55 também aparece no cabeçalho do
    // card) e "2 de 5" passaria com a contagem trocada. Cada número desta
    // frase é uma afirmação diferente sobre o que o score significa.
    expect(texto).toContain(
      "Score parcial: calculado só sobre 2 de 5 fatores, num total de 55 pontos possíveis." +
        " Ficaram de fora, por não haver o que medir:" +
        " Dias em silêncio, Ritmo previsto do programa, Tendência do score."
    );

    // E os dois que PONTUARAM não estão na lista dos que ficaram de fora —
    // dito de outro jeito, para o dia em que a frase mudar de forma.
    const foraDaConta = /Ficaram de fora, por não haver o que medir: ([^.]+)\./.exec(texto);
    expect(foraDaConta, "a frase que nomeia os fatores fora da conta não foi escrita").not.toBeNull();
    expect(foraDaConta![1].split(", ")).toEqual([
      "Dias em silêncio",
      "Ritmo previsto do programa",
      "Tendência do score",
    ]);

    // O cabeçalho do card conta a mesma história que a frase.
    expect(texto).toContain("2 de 5 fatores com base · peso considerado 55");
  });

  it("com os cinco fatores pontuando, a frase de parcialidade NÃO aparece", () => {
    const completa: SaudeMentorado = {
      score: 88,
      semBase: false,
      parcial: false,
      maxComBase: 100,
      nivel: "excelente",
      fatores: [
        comBase("presenca", "Presença nas sessões", 30, 30),
        comBase("tarefas", "Tarefas no prazo", 20, 25),
        comBase("silencio", "Dias em silêncio", 18, 20),
        comBase("ritmo", "Ritmo previsto do programa", 12, 15),
        comBase("tendencia", "Tendência do score", 8, 10),
      ],
    };

    const html = render(fichaVazia(), historico({ saude: completa }));

    expect(scoreNaTela(html)).toBe("88");
    expect(html).not.toContain("Ficaram de fora");
  });

  it("histórico lido pela metade avisa na tela — nunca uma linha do tempo com buraco silencioso", () => {
    const html = render(
      fichaVazia(),
      historico({ parcial: true, fatos: [fato({ titulo: "Nota de Ana" })] }),
    );

    expect(html).toContain("Parte do histórico não pôde ser lida");
  });

  it("histórico desconectado mostra o motivo, e não 'nenhuma atividade registrada'", () => {
    const html = render(
      fichaVazia(),
      historico({ conectado: false, motivo: "Não foi possível carregar o histórico agora." }),
    );

    expect(html).toContain("Não foi possível carregar o histórico agora.");
    expect(html).not.toContain("Nenhuma atividade registrada ainda.");
  });
});

// ============================================================
// 2b. Leitura que falhou nunca vira afirmação sobre o mentorado
// ============================================================
//
// `lerHistorico` devolve `conectado: true`, `parcial: true` e a saúde SEM
// DADO quando uma das quatro leituras da conta falha (ver o bloco "A CONTA DA
// SAÚDE SÓ RODA SOBRE LEITURA COMPLETA", em `dados-historico.ts`) — e delega
// à tela, por escrito, dizer que faltou leitura. É o caso mais perigoso da
// ficha inteira: sem essa fala, um `permission denied` da RLS chega ao mentor
// como "nenhuma sessão passada com presença registrada" e "sem matrícula",
// sobre alguém que pode estar em dia — exatamente o incidente que abre o
// plano da fase, invertido de sinal.

describe("card de saúde — leitura incompleta é dita, não traduzida em fatos", () => {
  it("com `parcial: true` e saúde sem dado, o card não afirma que não há andamento", () => {
    const saude = saudeDeLeituraQueFalhou();
    const html = render(fichaVazia(), historico({ parcial: true, saude }));
    const { visaoGeral } = paineis(html);
    const texto = textoDe(visaoGeral);

    // 1) A parcialidade é dita na aba que ABRE (o aviso da aba "Histórico"
    //    existe, mas mora no painel escondido — não é o que a pessoa lê).
    expect(texto).toContain("Parte da leitura falhou");

    // 2) Nada de "não há dado": ninguém sabe se não há dado ou se não deu
    //    para lê-lo, e essa é a única frase honesta possível aqui.
    expect(texto).not.toContain("registre o andamento");
    expect(texto).not.toContain("tem dado suficiente para pontuar");
    expect(texto).not.toContain("nenhum dos 5 fatores com base");

    // 3) Nem os detalhes fator a fator, que `saude-mentorado.ts` escreveu a
    //    partir das listas VAZIAS que a leitura falha produziu: cada um deles
    //    é uma afirmação ("nenhuma sessão passada com presença registrada",
    //    "sem matrícula") deduzida de um vazio que ninguém verificou.
    for (const fator of saude.fatores) {
      expect(texto, `o detalhe de "${fator.nome}" foi afirmado sobre leitura que falhou`).not.toContain(
        fator.detalhe
      );
    }

    // 4) E, claro, nenhum número: nem no lugar do score, nem em barra.
    expect(scoreNaTela(html)).not.toMatch(/\d/);
    expect(valoresDasBarras(html)).toEqual([]);
  });

  it("com `parcial: true` e score calculado, o aviso de leitura incompleta também aparece na visão geral", () => {
    // Falha em marcos/documentos/CRM não derruba o score (essas fontes não
    // entram na conta), então aqui existe número — e existe buraco. As duas
    // coisas precisam estar na tela ao mesmo tempo.
    const html = render(fichaVazia(), historico({ parcial: true, saude: saudeParcial() }));
    const { visaoGeral, historico: painelHistorico } = paineis(html);

    expect(textoDe(visaoGeral)).toContain("Parte da leitura falhou");
    expect(scoreNaTela(html)).toBe("71");
    // e a aba "Histórico" continua com o aviso dela, sobre a linha do tempo.
    expect(textoDe(painelHistorico)).toContain("Parte do histórico não pôde ser lida");
  });

  it("sem parcialidade, o aviso de leitura incompleta NÃO aparece", () => {
    // A rede do teste acima: um aviso que aparece sempre não avisa nada.
    const html = render(fichaVazia(), historico({ parcial: false, saude: saudeParcial() }));

    expect(textoDe(paineis(html).visaoGeral)).not.toContain("Parte da leitura falhou");
  });

  it("histórico desconectado: o card mostra o motivo e não desenha score, fatores nem barra", () => {
    const saude = saudeParcial();
    const html = render(
      fichaVazia(),
      historico({ conectado: false, motivo: "Não foi possível carregar o histórico agora.", saude }),
    );
    const texto = textoDe(paineis(html).visaoGeral);

    expect(texto).toContain("Não foi possível carregar o histórico agora.");
    // Sem a guarda, o card desenharia o 71 e os cinco fatores de um objeto de
    // saúde que veio de leitura NENHUMA — número com cara de medição.
    expect(texto).not.toContain("71");
    expect(valoresDasBarras(html)).toEqual([]);
    for (const fator of saude.fatores) {
      expect(texto, `o fator "${fator.nome}" foi desenhado sem histórico lido`).not.toContain(fator.nome);
    }
  });
});

// ============================================================
// 3. A ficha do TIME mostra o que é do time
// ============================================================

describe("aba Histórico — fato interno aparece (esta é a tela do time, não o portal)", () => {
  it("nota de CRM, cobrança e temperatura rendem, com o texto inteiro", () => {
    const fatos: FatoHistorico[] = [
      fato({
        tipo: "nota",
        titulo: "Nota de Ana",
        // Telefone e valor CRUS: se alguém trocar esta tela pela projeção do
        // portal, `higienizarTextoPublico` os substituiria por "[telefone
        // removido]"/"[valor removido]" e esta asserção morre.
        detalhe: "combinou no 11 98888-7777, fechou R$ 5.000,00",
        visibilidade: "interno",
      }),
      fato({ quando: "2026-05-10T13:00:00Z", tipo: "cobranca", titulo: "Cobrança vencida", visibilidade: "interno" }),
      fato({ quando: "2026-05-09T13:00:00Z", tipo: "temperatura", titulo: "Temperatura do lead: Morno", visibilidade: "interno" }),
      fato({ quando: "2026-05-08T13:00:00Z", tipo: "sessao", titulo: "Sessão 3 realizada", visibilidade: "publico" }),
    ];

    const html = render(fichaVazia(), historico({ fatos }));

    expect(html).toContain("Nota de Ana");
    expect(html).toContain("11 98888-7777");
    expect(html).toContain("R$ 5.000,00");
    expect(html).toContain("Cobrança vencida");
    expect(html).toContain("Temperatura do lead: Morno");
    // E o público continua aparecendo: a tela do time vê os dois lados.
    expect(html).toContain("Sessão 3 realizada");
  });

  it("sem fato nenhum, a aba diz que não há histórico — e não inventa linha", () => {
    const html = render(fichaVazia(), historico({ fatos: [] }));

    expect(html).toContain("Nenhuma atividade registrada ainda.");
  });
});

// ============================================================
// 3b. O rótulo de cada fato na linha do tempo é uma AFIRMAÇÃO
// ============================================================
//
// `Record<TipoFato, AtividadeTipo>` obriga a existir uma entrada para cada
// tipo — não obriga a entrada a estar certa. E errar aqui não é erro de
// enfeite: "Cobrança vencida — R$ 500,00 · Compra" diz que alguém pagou.

describe("aba Histórico — o rótulo de cada tipo de fato", () => {
  it("os doze tipos rendem com o rótulo combinado, e cobrança NÃO vira Compra", () => {
    // Um fato de cada tipo de `TIPOS_FATO`: tipo novo lá entra aqui sozinho e
    // este teste falha até alguém dizer, por escrito, como ele se chama.
    const fatos = TIPOS_FATO.map((tipo) => fato({ tipo, titulo: `Fato ${tipo}` }));
    const html = render(fichaVazia(), historico({ fatos }));

    const esperado: Record<TipoFato, string> = {
      marco: "Sistema",
      sessao: "Reunião/Evento",
      tarefa: "Tarefa",
      conteudo: "Sistema",
      documento_portal: "Sistema",
      documento_interno: "Sistema",
      cobranca: "Sistema",
      score: "Sistema",
      temperatura: "Sistema",
      nota: "Nota",
      atividade: "Sistema",
      interacao: "WhatsApp",
    };

    const lidos = rotulosDaLinhaDoTempo(paineis(html).historico);
    expect(lidos).toEqual(
      Object.fromEntries(TIPOS_FATO.map((tipo) => [`Fato ${tipo}`, esperado[tipo]]))
    );

    // Dito de novo, sozinho, porque é a linha que custa dinheiro de verdade:
    // uma cobrança rotulada "Compra" afirma um pagamento que não houve.
    expect(lidos["Fato cobranca"]).toBe("Sistema");
    expect(lidos["Fato cobranca"]).not.toBe("Compra");
  });
});

// ============================================================
// 3c. Os dois estados de borda da ficha — "não deu para ler" ≠ "não existe"
// ============================================================
//
// `lerFicha` distingue os dois (regra 7 de `dados.ts`) e a tela existe para
// deixar a diferença visível. Trocar um pelo outro é dizer a um mentor que o
// mentorado dele foi removido porque a RLS negou uma leitura.

describe("FichaVisao — falha de leitura e ficha inexistente são telas diferentes", () => {
  it("`conectado: false` mostra o motivo, e nunca 'não encontramos este mentorado'", () => {
    const html = render({
      ...fichaVazia(),
      conectado: false,
      motivo: "Não foi possível carregar a ficha agora.",
      mentorado: null,
    });

    expect(html).toContain("Não foi possível carregar a ficha agora.");
    expect(html).not.toContain("Não encontramos este mentorado");
    // Nem nome, nem abas, nem card de saúde: não há ficha lida para mostrar.
    expect(html).not.toContain("Beatriz Nogueira");
    expect(html).not.toContain('role="tabpanel"');
    expect(html).not.toContain("Saúde do mentorado");
  });

  it("conectado e sem mentorado diz que a ficha não existe, sem inventar motivo de falha", () => {
    const html = render({ ...fichaVazia(), mentorado: null });

    expect(html).toContain("Não encontramos este mentorado");
    expect(html).not.toContain('role="tabpanel"');
    expect(html).not.toContain("Saúde do mentorado");
  });
});

// ============================================================
// 3d. O erro das Server Actions volta escrito na tela
// ============================================================

describe("FichaVisao — banner de erro de `?erro=`", () => {
  it("mostra a mensagem que `agendarSessao`/`darBaixaNaSessao` devolveram", () => {
    // Sem este banner, a pessoa clica "Agendar", a Server Action recusa, a
    // tela volta igual e nada explica o que houve.
    const html = render(fichaVazia(), historico(), "Data da sessão inválida.");

    expect(textoDe(html)).toContain("Data da sessão inválida.");
  });

  it("sem `?erro=`, nenhum banner de erro é desenhado", () => {
    const html = render(fichaVazia());

    expect(html).not.toContain("bg-negativo/10");
  });
});

// ============================================================
// 4. Zero emoji, só os três glifos
// ============================================================

describe("ficha — zero emoji e só os glifos ▲ ▼ ▬", () => {
  it("a ficha cheia (com saúde, histórico e variação de score) não traz nenhum outro glifo", () => {
    const html = render(
      fichaComMatriculaAtivaESessaoAgendada(),
      historico({
        saude: saudeParcial(),
        parcial: true,
        fatos: [fato({ tipo: "marco", titulo: "Marco: primeiro cliente", visibilidade: "publico" }), fato()],
      }),
    );

    expect(glifosForaDoPermitido(html)).toEqual([]);
    // A pílula de variação de fato desenhou um dos três (senão o teste acima
    // passaria por não haver glifo nenhum na tela).
    expect(html).toContain("▲");
  });
});

// ============================================================
// 5. Defeito visual 3 — sem o marcador nativo `▶` do <details>
// ============================================================

describe("FichaVisao — defeito visual 3: sem o marcador nativo `▶` do <details>", () => {
  it("os dois <summary> ('+ Agendar sessão' e '+ Dar baixa') não têm o glifo ▶ no HTML", () => {
    const html = render(fichaComMatriculaAtivaESessaoAgendada());

    // os dois blocos de fato renderizaram — senão o teste provaria menos do
    // que diz (um `<details>` que nunca apareceu não pode provar nada).
    expect(html).toContain("+ Agendar sessão");
    expect(html).toContain("+ Dar baixa");
    expect(html).not.toContain("▶");
    // marcador nativo escondido nas duas classes exigidas — a causa raiz.
    // (o HTML escapa `&` para `&amp;` dentro de atributos, por isso o
    // trecho procurado aqui é só a parte estável do seletor arbitrário.)
    expect(html).toContain("list-none");
    expect(html).toContain("webkit-details-marker]:hidden");
  });
});

// ============================================================
// 6. O bloco de documentos é montado na aba que ABRE (Tarefa 12)
// ============================================================
//
// `DocumentosDoMentorado` tem a suíte dele (`./documentos.test.tsx`), que
// prova o comportamento do bloco. O que se prova AQUI é outra coisa, e é a
// que faltaria: que a ficha o monta, que o monta no painel que abre (a
// `Tabs` desenha o painel escondido também — bloco em painel `hidden` está
// na marcação sem estar na tela) e que fazer isso não criou uma terceira aba.

describe("FichaVisao — o bloco de documentos entra na ficha", () => {
  it("é desenhado dentro da 'Visão geral', com a lista recebida", () => {
    const html = render(fichaVazia(), historico(), undefined, {
      conectado: true,
      motivo: "",
      documentos: [
        {
          id: "doc-1",
          workspaceId: "ws-1",
          mentoradoId: "ment-1",
          alunoId: null,
          titulo: "Contrato assinado.pdf",
          caminhoStorage: "ws-1/contrato/contrato-assinado.pdf",
          mime: "application/pdf",
          bytes: 204800,
          categoria: "contrato",
          visivelPortal: false,
          enviadoPor: null,
          criadoEm: "2026-08-10T13:00:00Z",
          arquivado: false,
        },
      ],
    });

    const { visaoGeral } = paineis(html);

    expect(visaoGeral).toContain("Documentos (1)");
    expect(visaoGeral).toContain("Contrato assinado.pdf");
    // O `mentoradoId` da ficha viaja nos formulários do bloco — sem ele, as
    // Server Actions não sabem para qual ficha voltar nem a quem anexar.
    expect(visaoGeral).toContain('name="mentoradoId" value="ment-1"');
    // E o caminho interno do objeto continua fora da marcação, como na suíte
    // do próprio bloco (a montagem não pode desfazer isso).
    expect(html).not.toContain("ws-1/contrato/contrato-assinado.pdf");
  });

  it("a ficha continua com DUAS abas — o bloco não virou uma terceira", () => {
    // `paineis` já falha se houver três painéis; esta asserção existe para
    // que o motivo da falha fique escrito.
    const html = render(fichaVazia());

    expect(html.split('role="tabpanel"').length - 1).toBe(2);
    expect(textoDe(paineis(html).visaoGeral)).toContain("Nenhum arquivo anexado a este mentorado ainda.");
  });
});

// ============================================================
// Bloco 6 — agenda e transcrição na sessão (Tarefa 18)
//
// As cinco asserções do plano, mais as três palavras do estado da agenda.
// Todas leem a MARCAÇÃO, e todas dentro do painel que ABRE — o histórico de
// sessões vive na "Visão geral", então o que este bloco confere é o que a
// pessoa vê ao abrir a ficha, não o que está escondido na outra aba.
// ============================================================

/** A mesma ficha da fixture, com a sessão ajustada campo a campo. */
function fichaComSessao(over: Partial<Ficha["sessoes"][number]>): Ficha {
  const base = fichaComMatriculaAtivaESessaoAgendada();
  return { ...base, sessoes: [{ ...base.sessoes[0], ...over }] };
}

describe("agenda e transcrição na sessão", () => {
  it("sem conta do Google, o botão de sincronizar VIRA o link do .ics — e não some", () => {
    const { visaoGeral } = paineis(render(fichaComSessao({}), historico(), undefined, documentos(), false));

    expect(visaoGeral).toContain("agenda não conectada");
    // O caminho alternativo existe e aponta para a rota de download.
    expect(visaoGeral).toContain('href="/api/agenda/sessao/s-1"');
    expect(textoDe(visaoGeral)).toContain("Baixar convite (.ics)");
    // E o botão que dependeria da conexão NÃO fica ali prometendo o que não
    // pode cumprir.
    expect(textoDe(visaoGeral)).not.toContain("Sincronizar com a agenda");
  });

  it("com conta ligada e sessão nunca sincronizada, oferece sincronizar", () => {
    const { visaoGeral } = paineis(
      render(fichaComSessao({ eventoGoogleId: "" }), historico(), undefined, documentos(), true)
    );

    expect(visaoGeral).toContain("não sincronizada");
    expect(textoDe(visaoGeral)).toContain("Sincronizar com a agenda");
    expect(visaoGeral).not.toContain('href="/api/agenda/sessao/s-1"');
  });

  it("com conta ligada e evento já criado, diz 'na agenda' e oferece atualizar", () => {
    const { visaoGeral } = paineis(
      render(fichaComSessao({ eventoGoogleId: "evt-123" }), historico(), undefined, documentos(), true)
    );

    expect(visaoGeral).toContain("na agenda");
    expect(textoDe(visaoGeral)).toContain("Atualizar na agenda");
    // O id do evento é dado do Google, não informação para a tela — e a
    // pessoa não tem o que fazer com ele.
    expect(visaoGeral).not.toContain("evt-123");
  });

  it("os dois interruptores nascem desligados", () => {
    const { visaoGeral } = paineis(render(fichaComSessao({}), historico(), undefined, documentos(), true));
    const texto = textoDe(visaoGeral);

    // Desligado = o botão oferece LIGAR. Se nascesse ligado, ele ofereceria
    // ocultar — e alguém teria publicado sem pedir.
    expect(texto).toContain("Liberar gravação no portal");
    expect(texto).toContain("Liberar transcrição no portal");
    expect(texto).not.toContain("Ocultar gravação do portal");
    expect(texto).not.toContain("Ocultar transcrição do portal");
    // E o POST que cada um carrega é o de LIGAR.
    expect(visaoGeral).toContain('name="campo" value="gravacao"');
    expect(visaoGeral).toContain('name="campo" value="transcricao"');
  });

  it("já liberados, os botões oferecem ocultar e o POST é o de desligar", () => {
    const { visaoGeral } = paineis(
      render(
        fichaComSessao({ gravacaoLiberada: true, transcricaoLiberada: true }),
        historico(),
        undefined,
        documentos(),
        true
      )
    );
    const texto = textoDe(visaoGeral);

    expect(texto).toContain("Ocultar gravação do portal");
    expect(texto).toContain("Ocultar transcrição do portal");
    expect(visaoGeral).toContain('name="valor" value="0"');
    expect(visaoGeral).not.toContain('name="valor" value="1"');
  });

  it("sessão de turma mostra o aviso extra; sessão individual não", () => {
    const emTurma = paineis(
      render(
        fichaComSessao({ matriculaId: null, turmaId: "turma-1" }),
        historico(),
        undefined,
        documentos(),
        true
      )
    ).visaoGeral;
    const individual = paineis(
      render(fichaComSessao({ matriculaId: "mat-1", turmaId: null }), historico(), undefined, documentos(), true)
    ).visaoGeral;

    expect(textoDe(emTurma)).toContain("a fala de todos os participantes");
    expect(textoDe(individual)).not.toContain("a fala de todos os participantes");
    // O aviso comum aparece nos dois — o extra é ACRÉSCIMO, não substituição.
    expect(textoDe(individual)).toContain("passa a ler a transcrição inteira");
  });

  it("a transcrição em si NÃO é impressa na ficha; só o estado dela", () => {
    const segredo = "o cliente contou que o socio esta saindo da empresa";
    const html = render(
      fichaComSessao({
        transcricao: segredo,
        transcritaEm: "2026-08-15T14:00:00Z",
        transcricaoOrigem: "groq",
      }),
      historico(),
      undefined,
      documentos(),
      true
    );

    // Em NENHUM lugar da marcação, nem no painel escondido.
    expect(html).not.toContain(segredo);
    expect(html).not.toContain("socio esta saindo");
    // Mas a ficha diz que existe, e desde quando.
    expect(textoDe(paineis(html).visaoGeral)).toContain("gerada em");
  });

  it("sem transcrição, a ficha diz que não tem em vez de ficar calada", () => {
    const { visaoGeral } = paineis(
      render(fichaComSessao({ transcricao: "", transcritaEm: null }), historico(), undefined, documentos(), true)
    );

    expect(textoDe(visaoGeral)).toContain("ainda não transcrita");
  });

  it("deixa explícito que a análise é humana no disparo e bloqueia sessão sem transcrição", () => {
    const { visaoGeral } = paineis(
      render(fichaComSessao({ transcricao: "", transcritaEm: null }), historico(), undefined, documentos(), true)
    );
    const texto = textoDe(visaoGeral);

    expect(texto).toContain("Calcular score desta semana");
    expect(texto).toContain("Analisar esta sessão com IA");
    expect(texto).toContain("Quem dispara é uma pessoa");
    expect(texto).toContain("fica registrada com o nome de quem clicou");
    expect(texto).toContain("Disponível quando houver transcrição");
    expect(visaoGeral).toMatch(/<button[^>]*disabled=""[^>]*>Analisar esta sessão com IA<\/button>/);
  });

  it("oferece entrada manual e envio automático separado, com aviso de consentimento", () => {
    const { visaoGeral } = paineis(render(fichaComSessao({}), historico(), undefined, documentos(), true));

    expect(visaoGeral).toContain('name="texto"');
    expect(visaoGeral).toContain('name="visibilidade"');
    expect(visaoGeral).toContain("Salvar transcrição manual");
    expect(visaoGeral).toContain('name="arquivo"');
    expect(visaoGeral).toContain("Vincular áudio privado");
    expect(visaoGeral).toContain('name="confirmarConsentimento"');
    expect(visaoGeral).toContain("Transcrever áudio vinculado");
    expect(visaoGeral).toContain("Revogar autorização do áudio");
    expect(visaoGeral).toContain("permanece retido para auditoria");
    expect(visaoGeral).toContain("consentimento explícito");
    expect(visaoGeral).not.toContain('name="audio"');
  });

  it("deixa o upload de áudio para a Server Action configurar, sem encType manual", () => {
    const { visaoGeral } = paineis(render(fichaComSessao({}), historico(), undefined, documentos(), true));
    const formularioDoAudio = Array.from(
      visaoGeral.matchAll(/<form([^>]*)>([\s\S]*?)<\/form>/g)
    ).find((formulario) => formulario[2].includes("Vincular áudio privado"));

    expect(formularioDoAudio, "o formulário de vínculo de áudio deve existir").not.toBeNull();
    expect(formularioDoAudio![1]).not.toMatch(/\bencType=/i);
    expect(formularioDoAudio![1]).not.toMatch(/\bmethod=/i);
    expect(formularioDoAudio![2]).toContain('name="arquivo"');
    expect(formularioDoAudio![2]).toContain('name="confirmarConsentimento"');
  });

  it("o bloco novo não trouxe emoji nenhum", () => {
    const html = render(fichaComSessao({ gravacaoLiberada: true, turmaId: "t-1", matriculaId: null }), historico(), undefined, documentos(), true);

    expect(glifosForaDoPermitido(html)).toEqual([]);
  });
});
