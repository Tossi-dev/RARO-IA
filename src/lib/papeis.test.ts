import { describe, expect, it } from "vitest";
import {
  PAPEL_PADRAO,
  papelDe,
  primeiraRotaDe,
  rotaPermitida,
  type Papel,
} from "./papeis";

const TODOS_OS_PAPEIS: Papel[] = ["dono", "gestor", "comercial", "mentorado", "afiliado", "aluno"];

describe("papelDe", () => {
  it("aceita cada um dos seis valores do enum do Postgres", () => {
    for (const papel of TODOS_OS_PAPEIS) {
      expect(papelDe(papel)).toBe(papel);
    }
  });

  it("normaliza caixa e espaços de um valor válido", () => {
    expect(papelDe("DONO")).toBe("dono");
    expect(papelDe("  gestor  ")).toBe("gestor");
    expect(papelDe("Comercial")).toBe("comercial");
  });

  it("fail-closed: qualquer entrada desconhecida vira o papel padrão", () => {
    expect(papelDe(undefined)).toBe(PAPEL_PADRAO);
    expect(papelDe(null)).toBe(PAPEL_PADRAO);
    expect(papelDe("")).toBe(PAPEL_PADRAO);
    expect(papelDe("root")).toBe(PAPEL_PADRAO);
    expect(papelDe("admin")).toBe(PAPEL_PADRAO);
    expect(papelDe(42)).toBe(PAPEL_PADRAO);
    expect(papelDe({ papel: "dono" })).toBe(PAPEL_PADRAO);
  });

  it("PAPEL_PADRAO é o mentorado, o menos privilegiado", () => {
    expect(PAPEL_PADRAO).toBe("mentorado");
  });
});

describe("rotaPermitida — dono e gestor", () => {
  it("permitem qualquer pathname, inclusive um que ainda não existe", () => {
    for (const papel of ["dono", "gestor"] as const) {
      expect(rotaPermitida(papel, "/financeiro/dre")).toBe(true);
      expect(rotaPermitida(papel, "/relatorio-secreto")).toBe(true);
    }
  });
});

describe("rotaPermitida — finanças pessoais", () => {
  it("permite /pessoal apenas ao dono, inclusive em rotas filhas", () => {
    expect(rotaPermitida("dono", "/pessoal")).toBe(true);
    expect(rotaPermitida("dono", "/pessoal/novo")).toBe(true);
    expect(rotaPermitida("gestor", "/pessoal")).toBe(false);
    expect(rotaPermitida("gestor", "/pessoal/novo")).toBe(false);
  });
});

describe("/comercial — a tela de trabalho do closer (tarefa 47)", () => {
  it("comercial, dono e gestor abrem; os três papéis de cliente não", () => {
    expect(rotaPermitida("comercial", "/comercial")).toBe(true);
    expect(rotaPermitida("dono", "/comercial")).toBe(true);
    expect(rotaPermitida("gestor", "/comercial")).toBe(true);

    // A RLS de 0024 é quem impede de verdade: nenhuma das seis políticas
    // menciona o papel do mentorado. Isto aqui é a porta.
    expect(rotaPermitida("mentorado", "/comercial")).toBe(false);
    expect(rotaPermitida("afiliado", "/comercial")).toBe(false);
    expect(rotaPermitida("aluno", "/comercial")).toBe(false);
  });

  it("a tela de UMA negociação segue a mesma regra da lista", () => {
    expect(rotaPermitida("comercial", "/comercial/0f8c1c2e-4f1a-4a11-9e33-0a1b2c3d4e5f")).toBe(true);
    expect(rotaPermitida("mentorado", "/comercial/0f8c1c2e-4f1a-4a11-9e33-0a1b2c3d4e5f")).toBe(false);
  });
});

describe("/marketing — leitura e links rastreados (tarefa 73)", () => {
  it("comercial trabalha no marketing; mentorado não lê dados de captura", () => {
    expect(rotaPermitida("comercial", "/marketing")).toBe(true);
    expect(rotaPermitida("dono", "/marketing")).toBe(true);
    expect(rotaPermitida("gestor", "/marketing")).toBe(true);
    expect(rotaPermitida("mentorado", "/marketing")).toBe(false);
  });
});

describe("rotaPermitida — comercial", () => {
  it("permite as rotas comerciais e a raiz", () => {
    const permitidas = ["/", "/inicio", "/painel", "/comecar", "/tour", "/crm", "/agenda", "/conteudo"];
    for (const rota of permitidas) {
      expect(rotaPermitida("comercial", rota)).toBe(true);
    }
  });

  it("permite sub-rotas por segmento, como /crm/aluno-1 e /conteudo/ranking", () => {
    expect(rotaPermitida("comercial", "/crm/aluno-1")).toBe(true);
    expect(rotaPermitida("comercial", "/conteudo/ranking")).toBe(true);
  });

  it("nega financeiro, análise, extrato e integrações", () => {
    expect(rotaPermitida("comercial", "/financeiro")).toBe(false);
    expect(rotaPermitida("comercial", "/analise")).toBe(false);
    expect(rotaPermitida("comercial", "/extrato")).toBe(false);
    expect(rotaPermitida("comercial", "/integracoes")).toBe(false);
  });
});

describe("rotaPermitida — mentorado (e papéis antigos afiliado/aluno no mesmo nível)", () => {
  it("permite as rotas mínimas para os três papéis", () => {
    const permitidas = ["/", "/inicio", "/portal", "/comecar", "/tour", "/conteudo", "/agenda"];
    for (const papel of ["mentorado", "afiliado", "aluno"] as const) {
      for (const rota of permitidas) {
        expect(rotaPermitida(papel, rota)).toBe(true);
      }
    }
  });

  it("nega financeiro, crm, análise, extrato, integrações e painel", () => {
    const negadas = ["/financeiro", "/crm", "/analise", "/extrato", "/integracoes", "/painel"];
    for (const papel of ["mentorado", "afiliado", "aluno"] as const) {
      for (const rota of negadas) {
        expect(rotaPermitida(papel, rota)).toBe(false);
      }
    }
  });
});

describe("rotaPermitida — desenho de lista de permissão (não de bloqueio)", () => {
  it("uma rota nova e imprevista é negada para comercial e mentorado, e liberada só para dono/gestor", () => {
    const rotaFutura = "/relatorio-secreto";
    expect(rotaPermitida("dono", rotaFutura)).toBe(true);
    expect(rotaPermitida("gestor", rotaFutura)).toBe(true);
    expect(rotaPermitida("comercial", rotaFutura)).toBe(false);
    expect(rotaPermitida("mentorado", rotaFutura)).toBe(false);
    expect(rotaPermitida("afiliado", rotaFutura)).toBe(false);
    expect(rotaPermitida("aluno", rotaFutura)).toBe(false);
  });

  it("prefixo casa por segmento: /conteudografico não é liberado por causa de /conteudo", () => {
    expect(rotaPermitida("comercial", "/conteudografico")).toBe(false);
    expect(rotaPermitida("mentorado", "/conteudografico")).toBe(false);
  });

  it("a raiz / é exata: liberar / não libera /financeiro", () => {
    expect(rotaPermitida("mentorado", "/")).toBe(true);
    expect(rotaPermitida("mentorado", "/financeiro")).toBe(false);
    expect(rotaPermitida("comercial", "/")).toBe(true);
    expect(rotaPermitida("comercial", "/financeiro")).toBe(false);
  });
});

describe("rotaPermitida — /financeiro/dre só para dono e gestor", () => {
  it("percorre os seis papéis", () => {
    for (const papel of TODOS_OS_PAPEIS) {
      const esperado = papel === "dono" || papel === "gestor";
      expect(rotaPermitida(papel, "/financeiro/dre")).toBe(esperado);
    }
  });
});

describe("primeiraRotaDe", () => {
  // ALTO 2 da auditoria — as políticas de RLS do grupo 3 (0007/0008) só
  // liberam as tabelas do portal para `papel_atual() = 'mentorado'`.
  // `afiliado` e `aluno` são o MESMO NÍVEL de acesso (ver ROTAS_MINIMAS,
  // acima), mas não são literalmente 'mentorado' no enum do Postgres — um
  // afiliado ou aluno mandado para `/portal` cai numa tela que a RLS
  // esvazia por completo (nenhuma matrícula, sessão, tarefa: tudo filtrado
  // por `mentorado_atual()`, que só resolve para quem tem ficha em
  // `public.mentorado`), sem entender por quê. `/portal` continua
  // PERMITIDO para os três (a tela sabe dizer "esta área é do mentorado"
  // sem vazar nada — ver `PortalAindaNaoLigado` em
  // `src/app/(app)/portal/page.tsx`) — o que muda aqui é só para ONDE cada
  // um é mandado ao entrar.
  it("manda dono e gestor para a raiz, comercial para /crm, mentorado para /portal, e afiliado/aluno para /inicio (ALTO 2 — /portal é estruturalmente vazio para eles)", () => {
    expect(primeiraRotaDe("dono")).toBe("/");
    expect(primeiraRotaDe("gestor")).toBe("/");
    expect(primeiraRotaDe("comercial")).toBe("/crm");
    expect(primeiraRotaDe("mentorado")).toBe("/portal");
    expect(primeiraRotaDe("afiliado")).toBe("/inicio");
    expect(primeiraRotaDe("aluno")).toBe("/inicio");
  });

  it("a rota devolvida para cada papel é sempre permitida para o próprio papel — sem isso, laço de redirecionamento", () => {
    for (const papel of TODOS_OS_PAPEIS) {
      expect(rotaPermitida(papel, primeiraRotaDe(papel))).toBe(true);
    }
  });

  // ALTO 2 — nomeado explicitamente, como o enunciado pede: prova que
  // afiliado e aluno NÃO caem em /portal ao entrar, mesmo que /portal
  // continue sendo uma rota que eles têm permissão de abrir manualmente.
  it("ALTO 2: afiliado e aluno NÃO caem em /portal ao entrar (mentorado, sim)", () => {
    expect(primeiraRotaDe("mentorado")).toBe("/portal");
    for (const papel of ["afiliado", "aluno"] as const) {
      expect(primeiraRotaDe(papel)).not.toBe("/portal");
      expect(primeiraRotaDe(papel)).toBe("/inicio");
      // e /portal continua ABERTO para os dois — o que mudou é só o
      // destino de entrada, nunca a permissão de visitar a rota depois.
      expect(rotaPermitida(papel, "/portal")).toBe(true);
    }
  });
});

// B3.2 — /portal é a tela do MENTORADO (o cliente do Jefson): entra na lista
// mínima (mentorado/afiliado/aluno), dono/gestor já veem tudo, mas COMERCIAL
// não — o portal é do cliente, e um closer não tem o que fazer lá dentro.
describe("rotaPermitida — /portal é do mentorado, não do comercial (B3.2)", () => {
  it("mentorado, afiliado e aluno abrem /portal", () => {
    for (const papel of ["mentorado", "afiliado", "aluno"] as const) {
      expect(rotaPermitida(papel, "/portal")).toBe(true);
    }
  });

  it("dono e gestor abrem /portal (recebem 'todas')", () => {
    expect(rotaPermitida("dono", "/portal")).toBe(true);
    expect(rotaPermitida("gestor", "/portal")).toBe(true);
  });

  it("comercial NÃO abre /portal — nem a rota, nem uma sub-rota dela", () => {
    expect(rotaPermitida("comercial", "/portal")).toBe(false);
    expect(rotaPermitida("comercial", "/portal/qualquer-coisa")).toBe(false);
  });
});

// Item 1 — `rotaPermitida` e `primeiraRotaDe` recebem, na assinatura, um
// `Papel`, mas nada impede em runtime que chegue outra coisa (linha do
// Supabase sem `papel` preenchido direito, cookie adulterado, claim de JWT
// velho). Sem normalizar por dentro, um papel fora do enum hoje ora lança
// `TypeError` (rotaPermitida indexa `ROTAS_POR_PAPEL` e chama `.some` em
// `undefined`), ora devolve `undefined` (primeiraRotaDe cai fora do switch
// sem default). As duas funções têm que se comportar como se tivessem
// recebido PAPEL_PADRAO — nunca lançar, nunca devolver undefined.
describe("rotaPermitida e primeiraRotaDe — normalizam entrada desconhecida como papelDe faria", () => {
  const entradasDesconhecidas: unknown[] = ["admin", "", undefined, null, 42, ["dono"]];

  it("rotaPermitida nunca lança para papel desconhecido, e trata como PAPEL_PADRAO", () => {
    for (const entrada of entradasDesconhecidas) {
      const papel = entrada as unknown as Papel;
      expect(() => rotaPermitida(papel, "/financeiro/dre")).not.toThrow();
      // PAPEL_PADRAO é "mentorado": não vê /financeiro/dre.
      expect(rotaPermitida(papel, "/financeiro/dre")).toBe(false);
      // mas vê as próprias rotas mínimas, como qualquer mentorado veria.
      expect(rotaPermitida(papel, "/inicio")).toBe(true);
    }
  });

  it("primeiraRotaDe nunca devolve undefined para papel desconhecido, e manda para /portal como PAPEL_PADRAO", () => {
    for (const entrada of entradasDesconhecidas) {
      const papel = entrada as unknown as Papel;
      expect(() => primeiraRotaDe(papel)).not.toThrow();
      expect(primeiraRotaDe(papel)).toBe("/portal");
    }
  });
});

// Item 2 (mata o mutante M4) — um `ROTAS_POR_PAPEL[papel] ?? "todas"` no
// lugar do lookup simples faria papel fora do enum cair no ramo "todas" (o
// mesmo sinal que dono/gestor recebem) em vez de cair em PAPEL_PADRAO. A
// suíte de hoje não tinha nenhum teste que chamasse rotaPermitida com papel
// inválido contra uma rota exclusiva de dono/gestor, então esse `?? "todas"`
// passaria batido. Este teste prova, de forma isolada do item 1, que papel
// desconhecido não ganha o mesmo acesso de dono/gestor.
describe("rotaPermitida — papel desconhecido NÃO recebe o sinal 'todas' de dono/gestor", () => {
  it("nem /financeiro/dre nem uma rota totalmente nova (que só dono/gestor veem) abrem para papel inválido", () => {
    for (const entrada of ["admin", "root", "superadmin", 42, ["dono"], {}] as unknown[]) {
      const papel = entrada as unknown as Papel;
      expect(rotaPermitida(papel, "/financeiro/dre")).toBe(false);
      expect(rotaPermitida(papel, "/relatorio-secreto")).toBe(false);
    }
  });
});

// Item 3 (mata o mutante M6) — `papelDe` precisa continuar rejeitando
// QUALQUER coisa que não seja `typeof valor === "string"`, sem coerção. Um
// `String(valor)` no lugar da checagem de tipo trocaria a defesa: um array
// vira "dono,gestor"·(rejeitado, ok) mas um objeto com `toString` customizado
// viraria a própria string escolhida pelo atacante — e é exatamente essa a
// forma que um papel maltratado chega aqui: uma coluna do Supabase lida
// errado (`profiles.papel` como array de um join malfeito) ou um claim de
// JWT decodificado sem validar o tipo.
describe("papelDe — rejeita qualquer coisa que não seja string, sem tentar converter", () => {
  it("array com um papel válido dentro não vira o papel: typeof array é 'object', não 'string'", () => {
    expect(papelDe(["dono"] as unknown)).toBe(PAPEL_PADRAO);
    expect(papelDe(["dono", "gestor"] as unknown)).toBe(PAPEL_PADRAO);
  });

  it("String boxada (new String) não vira o papel: typeof é 'object', não 'string'", () => {
    // eslint-disable-next-line no-new-wrappers -- é exatamente o valor hostil que o teste precisa forçar
    expect(papelDe(new String("dono") as unknown)).toBe(PAPEL_PADRAO);
  });

  it("objeto com toString customizado não vira o papel: nada aqui chama toString", () => {
    expect(papelDe({ toString: () => "dono" } as unknown)).toBe(PAPEL_PADRAO);
  });
});

// Item 4 (mata o mutante M8) — a raiz "/" é tratada à parte em
// `comecaNoPrefixo` porque, por `startsWith`, ela seria prefixo de qualquer
// coisa. Apagar esse tratamento faria "/" liberar "/financeiro" também. O
// comportamento de hoje já está certo; faltava o teste que trava isso.
describe("rotaPermitida — a raiz é tratada à parte, nunca por prefixo (mata M8)", () => {
  it("//financeiro, ///extrato e // não são liberados por conta da raiz", () => {
    for (const papel of ["mentorado", "comercial"] as const) {
      expect(rotaPermitida(papel, "//financeiro")).toBe(false);
      expect(rotaPermitida(papel, "///extrato")).toBe(false);
      expect(rotaPermitida(papel, "//")).toBe(false);
    }
  });
});

// Item 5 (mata os mutantes M5, M7 e M12) — testes de FORMA de pathname,
// independente de qual papel/rota estão em jogo. Cada um destes prende um
// jeito específico de um mutante enfraquecer o casamento de prefixo:
// M5 trocaria "pathname vazio" por um `return true` cego; M7 casaria prefixo
// ignorando caixa; M12 (adiante, no item 6) trocaria a checagem de ".." por
// um `return true`.
describe("rotaPermitida — forma do pathname (mata M5 e M7)", () => {
  it("pathname vazio nunca é permitido (mata M5)", () => {
    expect(rotaPermitida("mentorado", "")).toBe(false);
    expect(rotaPermitida("comercial", "")).toBe(false);
  });

  it("sem barra inicial nunca casa com prefixo nenhum", () => {
    expect(rotaPermitida("mentorado", "financeiro")).toBe(false);
    expect(rotaPermitida("mentorado", "conteudo")).toBe(false);
    expect(rotaPermitida("comercial", "conteudo")).toBe(false);
  });

  it("caixa trocada não casa — o casamento é sensível a caixa, de propósito (mata M7)", () => {
    expect(rotaPermitida("mentorado", "/CONTEUDO")).toBe(false);
    expect(rotaPermitida("mentorado", "/Conteudo/aula")).toBe(false);
    expect(rotaPermitida("comercial", "/CONTEUDO")).toBe(false);
  });

  it("barra final: /conteudo/ permitido, /financeiro/ negado", () => {
    expect(rotaPermitida("mentorado", "/conteudo/")).toBe(true);
    expect(rotaPermitida("mentorado", "/financeiro/")).toBe(false);
    expect(rotaPermitida("comercial", "/conteudo/")).toBe(true);
    expect(rotaPermitida("comercial", "/financeiro/")).toBe(false);
  });
});

// Item 6 — TRAVESSIA CODIFICADA. Hoje `rotaPermitida("mentorado",
// "/conteudo/..%2ffinanceiro")` devolve `true`: o prefixo "/conteudo" casa
// por `startsWith`, e quem impede o vazamento de verdade é o roteador do
// Next normalizando o "%2f" antes de rotear — um detalhe de outra camada,
// não deste módulo. Isso é um comportamento NOVO (os outros itens só
// destravam teste para comportamento que já existia): um pathname com
// qualquer sinal de ambiguidade — "%" (percent-encoding), "\", ";", ou um
// segmento "." ou ".." — passa a ser recusado para quem não é dono/gestor.
describe("rotaPermitida — travessia codificada é recusada para quem não é dono/gestor (item 6)", () => {
  const caminhosMaliciosos = [
    "/conteudo/..%2ffinanceiro",
    "/conteudo/..;/financeiro",
    "/conteudo/../financeiro",
    "/conteudo/./financeiro",
    "/conteudo%2f..%2ffinanceiro",
    "/conteudo\\..\\financeiro",
  ];

  it("nenhum dos caminhos maliciosos passa para mentorado ou comercial", () => {
    for (const caminho of caminhosMaliciosos) {
      expect(rotaPermitida("mentorado", caminho)).toBe(false);
      expect(rotaPermitida("comercial", caminho)).toBe(false);
    }
  });

  it("um caminho normal, com id de verdade, continua passando", () => {
    expect(rotaPermitida("mentorado", "/conteudo/aula-1")).toBe(true);
    expect(rotaPermitida("mentorado", "/conteudo/abc-123")).toBe(true);
    expect(rotaPermitida("comercial", "/conteudo/aula-1")).toBe(true);
  });
});

// Item 7 — LAÇO DE REDIRECIONAMENTO. `/login`, `/acesso` e `/privacidade`
// são as `ROTAS_LIVRES` de `src/lib/acesso.ts`: se o middleware barra um
// mentorado e manda pra uma delas, e este módulo também barra essas rotas
// pro mentorado, o navegador é barrado de novo — o mesmo laço que
// `portao.ts` documenta ter evitado no nível de sessão. Este módulo importa
// `rotaLivre` (sem tocar em `acesso.ts`) e libera essas três rotas para
// qualquer papel, ANTES do resto da lógica.
describe("rotaPermitida — rotas livres nunca causam laço de redirecionamento (item 7)", () => {
  const rotasLivres = ["/login", "/acesso", "/privacidade"];

  it("os seis papéis conseguem abrir as três rotas livres", () => {
    for (const papel of TODOS_OS_PAPEIS) {
      for (const rota of rotasLivres) {
        expect(rotaPermitida(papel, rota)).toBe(true);
      }
    }
  });

  // A liberação de rotaLivre não pode virar uma porta lateral para a mesma
  // travessia do item 6: "/login/" bate no prefixo de rotaLivre por
  // startsWith, mas "/login/..%2ffinanceiro" ainda carrega um "%2f" — a
  // guarda de travessia tem que continuar valendo mesmo disfarçada de rota
  // livre.
  it("uma rota livre disfarçando travessia continua negada", () => {
    expect(rotaPermitida("mentorado", "/login/..%2ffinanceiro")).toBe(false);
    expect(rotaPermitida("comercial", "/login/..%2ffinanceiro")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tarefa 29 — Trilhas e certificado entram no mapa de rotas
// ---------------------------------------------------------------------------
//
// Três decisões deste bloco, escritas como teste para não virarem folclore:
//
//   1. `/trilhas` (a tela de GESTÃO de trilhas) NÃO entra em ROTAS_COMERCIAL.
//      Trilha é entrega, não venda: quem vende não monta a esteira de aula
//      de quem já comprou. Dono e gestor abrem porque recebem "todas".
//   2. O aluno não abre `/trilhas` — a tela DELE é `/portal/trilha`, que já
//      cai sob o prefixo `/portal` de ROTAS_MINIMAS. Rota nova de aluno
//      dentro de `/portal` não precisa de entrada nova aqui; rota nova de
//      gestão precisa de decisão consciente. É o desenho de lista de
//      permissão funcionando.
//   3. `/certificado/[codigo]` é PÚBLICA (entra em `rotaLivre`, acesso.ts):
//      um certificado que só o dono do sistema consegue conferir não é
//      certificado — é print. Quem valida é um contratante, um cliente do
//      aluno, alguém que não tem (nem vai criar) login aqui.
describe("rotaPermitida — trilhas e certificado (tarefa 29)", () => {
  it("/trilhas é de gestão: comercial e mentorado não abrem, dono e gestor sim", () => {
    expect(rotaPermitida("comercial", "/trilhas")).toBe(false);
    expect(rotaPermitida("mentorado", "/trilhas")).toBe(false);
    expect(rotaPermitida("afiliado", "/trilhas")).toBe(false);
    expect(rotaPermitida("aluno", "/trilhas")).toBe(false);
    expect(rotaPermitida("dono", "/trilhas")).toBe(true);
    expect(rotaPermitida("gestor", "/trilhas")).toBe(true);
  });

  it("uma trilha específica (/trilhas/<id>) segue a mesma regra da lista", () => {
    expect(rotaPermitida("comercial", "/trilhas/abc-123")).toBe(false);
    expect(rotaPermitida("mentorado", "/trilhas/abc-123")).toBe(false);
    expect(rotaPermitida("dono", "/trilhas/abc-123")).toBe(true);
  });

  it("/portal/trilha é do aluno — já coberto pelo prefixo /portal, sem entrada nova", () => {
    for (const papel of ["mentorado", "afiliado", "aluno", "dono", "gestor"] as const) {
      expect(rotaPermitida(papel, "/portal/trilha")).toBe(true);
    }
    // O comercial continua fora do portal inteiro (B3.2) — inclusive da trilha.
    expect(rotaPermitida("comercial", "/portal/trilha")).toBe(false);
  });

  it("/certificado/<codigo> abre para os seis papéis: é rota pública", () => {
    for (const papel of TODOS_OS_PAPEIS) {
      expect(rotaPermitida(papel, "/certificado/ABC23456789K")).toBe(true);
    }
  });

  it("a guarda de travessia continua valendo para as rotas novas", () => {
    // Sem a guarda, um proxy que normalize %2f em barra depois desta decisão
    // transformaria "/trilhas/..%2ffinanceiro" em "/financeiro" JÁ APROVADO.
    expect(rotaPermitida("mentorado", "/trilhas/..%2ffinanceiro")).toBe(false);
    expect(rotaPermitida("comercial", "/trilhas/..%2ffinanceiro")).toBe(false);
    expect(rotaPermitida("mentorado", "/portal/..%2ffinanceiro")).toBe(false);
    // E a rota PÚBLICA não vira porta dos fundos: ser livre não suspende a
    // guarda (mesmo tratamento que /login/..%2ffinanceiro já recebia).
    expect(rotaPermitida("mentorado", "/certificado/..%2ffinanceiro")).toBe(false);
    expect(rotaPermitida("comercial", "/certificado/..%2f..%2fcrm")).toBe(false);
  });

  it("prefixo por segmento: /trilhas não libera /trilhasocultas, /certificado não libera /certificados", () => {
    expect(rotaPermitida("dono", "/trilhasocultas")).toBe(true); // dono abre tudo mesmo
    expect(rotaPermitida("mentorado", "/certificados")).toBe(false);
    expect(rotaPermitida("comercial", "/certificados/lista")).toBe(false);
  });
});

// Tarefa 36 — o feed é de gestão, como as trilhas.
describe("rotaPermitida — /feed (tarefa 36)", () => {
  it("comercial e mentorado não abrem; dono e gestor sim", () => {
    expect(rotaPermitida("comercial", "/feed")).toBe(false);
    expect(rotaPermitida("mentorado", "/feed")).toBe(false);
    expect(rotaPermitida("afiliado", "/feed")).toBe(false);
    expect(rotaPermitida("aluno", "/feed")).toBe(false);
    expect(rotaPermitida("dono", "/feed")).toBe(true);
    expect(rotaPermitida("gestor", "/feed")).toBe(true);
  });

  it("o mentorado continua abrindo /portal, que é onde os avisos aparecem para ele", () => {
    expect(rotaPermitida("mentorado", "/portal")).toBe(true);
  });

  it("a guarda de travessia vale aqui também", () => {
    expect(rotaPermitida("mentorado", "/feed/..%2ffinanceiro")).toBe(false);
    expect(rotaPermitida("comercial", "/feed/..%2fcrm")).toBe(false);
  });

  it("prefixo por segmento: /feed não libera /feedback", () => {
    expect(rotaPermitida("mentorado", "/feedback")).toBe(false);
    expect(rotaPermitida("comercial", "/feedback")).toBe(false);
  });
});

// Tarefa 40 — o roteiro de entrada é de gestão, como o feed e as trilhas.
describe("rotaPermitida — /onboarding (tarefa 40)", () => {
  it("comercial e mentorado não abrem; dono e gestor sim", () => {
    for (const papel of ["comercial", "mentorado", "afiliado", "aluno"] as const) {
      expect([papel, rotaPermitida(papel, "/onboarding")]).toEqual([papel, false]);
    }
    expect(rotaPermitida("dono", "/onboarding")).toBe(true);
    expect(rotaPermitida("gestor", "/onboarding")).toBe(true);
  });

  it("a guarda de travessia e o prefixo por segmento valem aqui também", () => {
    expect(rotaPermitida("mentorado", "/onboarding/..%2ffinanceiro")).toBe(false);
    expect(rotaPermitida("mentorado", "/onboardings")).toBe(false);
  });

  it("as três rotas de gestão do Bloco 5 ao 7 seguem a MESMA regra", () => {
    // Escrito junto de propósito: se um dia uma delas destoar, é porque
    // alguém decidiu — não porque passou despercebido.
    for (const rota of ["/trilhas", "/feed", "/onboarding"]) {
      expect([rota, rotaPermitida("mentorado", rota)]).toEqual([rota, false]);
      expect([rota, rotaPermitida("comercial", rota)]).toEqual([rota, false]);
      expect([rota, rotaPermitida("dono", rota)]).toEqual([rota, true]);
    }
  });
});
