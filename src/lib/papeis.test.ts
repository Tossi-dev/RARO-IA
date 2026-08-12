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
    const permitidas = ["/", "/inicio", "/comecar", "/tour", "/conteudo", "/agenda"];
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
  it("manda dono e gestor para a raiz, comercial para /crm, e o resto para /inicio", () => {
    expect(primeiraRotaDe("dono")).toBe("/");
    expect(primeiraRotaDe("gestor")).toBe("/");
    expect(primeiraRotaDe("comercial")).toBe("/crm");
    expect(primeiraRotaDe("mentorado")).toBe("/inicio");
    expect(primeiraRotaDe("afiliado")).toBe("/inicio");
    expect(primeiraRotaDe("aluno")).toBe("/inicio");
  });

  it("a rota devolvida para cada papel é sempre permitida para o próprio papel — sem isso, laço de redirecionamento", () => {
    for (const papel of TODOS_OS_PAPEIS) {
      expect(rotaPermitida(papel, primeiraRotaDe(papel))).toBe(true);
    }
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

  it("primeiraRotaDe nunca devolve undefined para papel desconhecido, e manda para /inicio como PAPEL_PADRAO", () => {
    for (const entrada of entradasDesconhecidas) {
      const papel = entrada as unknown as Papel;
      expect(() => primeiraRotaDe(papel)).not.toThrow();
      expect(primeiraRotaDe(papel)).toBe("/inicio");
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
