import { describe, expect, it } from "vitest";
import type { Papel } from "@/lib/papeis";
import { decidirAcesso, decidirAcessoSupabase, rotaSegura } from "./portao";

describe("decidirAcesso", () => {
  it("rota livre passa em qualquer modo, mesmo trancado", () => {
    for (const modo of ["aberto", "trancado", "senha", "supabase"] as const) {
      expect(decidirAcesso({ pathname: "/acesso", modo, seloOk: false })).toEqual({
        tipo: "passa",
      });
    }
  });

  it("modo aberto passa direto", () => {
    expect(decidirAcesso({ pathname: "/painel", modo: "aberto", seloOk: false })).toEqual({
      tipo: "passa",
    });
  });

  it("modo trancado manda para /acesso, sem detalhe na URL", () => {
    expect(decidirAcesso({ pathname: "/financeiro/caixa", modo: "trancado", seloOk: false })).toEqual(
      { tipo: "redireciona", para: "/acesso" }
    );
  });

  it("modo senha sem selo conferido manda para /acesso com a rota de origem", () => {
    expect(decidirAcesso({ pathname: "/crm/aluno-1", modo: "senha", seloOk: false })).toEqual({
      tipo: "redireciona",
      para: "/acesso?de=%2Fcrm%2Faluno-1",
    });
  });

  it("modo senha com selo conferido passa", () => {
    expect(decidirAcesso({ pathname: "/painel", modo: "senha", seloOk: true })).toEqual({
      tipo: "passa",
    });
  });

  it("modo supabase nunca deveria chegar aqui, mas se chegar tranca", () => {
    expect(decidirAcesso({ pathname: "/painel", modo: "supabase", seloOk: true })).toEqual({
      tipo: "redireciona",
      para: "/acesso",
    });
  });
});

describe("rotaSegura", () => {
  it("aceita caminho interno normal", () => {
    expect(rotaSegura("/financeiro/caixa")).toBe("/financeiro/caixa");
  });

  it("recusa URL relativa a protocolo (redirecionamento aberto)", () => {
    expect(rotaSegura("//evil.com/phishing")).toBe("/");
  });

  it("recusa URL absoluta de outro site", () => {
    expect(rotaSegura("https://evil.com")).toBe("/");
  });

  it("recusa vazio, nulo ou indefinido", () => {
    expect(rotaSegura("")).toBe("/");
    expect(rotaSegura(null)).toBe("/");
    expect(rotaSegura(undefined)).toBe("/");
  });
});

const TODOS_OS_PAPEIS: Papel[] = ["dono", "gestor", "comercial", "mentorado", "afiliado", "aluno"];

function usuario(papel: Papel) {
  return { papel };
}

describe("decidirAcessoSupabase", () => {
  it("mentorado logado em /financeiro é barrado (o teste que C4.2 exige)", () => {
    expect(
      decidirAcessoSupabase({ pathname: "/financeiro", usuario: usuario("mentorado") })
    ).toEqual({ tipo: "redireciona", para: "/sem-acesso" });
  });

  it("mentorado logado é barrado em todas as rotas que não são dele", () => {
    const negadas = [
      "/financeiro/dre",
      "/crm",
      "/analise",
      "/extrato",
      "/integracoes",
      "/painel",
    ];
    for (const pathname of negadas) {
      expect(decidirAcessoSupabase({ pathname, usuario: usuario("mentorado") })).toEqual({
        tipo: "redireciona",
        para: "/sem-acesso",
      });
    }
  });

  it("mentorado logado passa nas rotas mínimas", () => {
    const permitidas = ["/inicio", "/conteudo/aula-1", "/agenda"];
    for (const pathname of permitidas) {
      expect(decidirAcessoSupabase({ pathname, usuario: usuario("mentorado") })).toEqual({
        tipo: "passa",
      });
    }
  });

  it("comercial passa em /crm e é barrado em /financeiro", () => {
    expect(
      decidirAcessoSupabase({ pathname: "/crm", usuario: usuario("comercial") })
    ).toEqual({ tipo: "passa" });
    expect(
      decidirAcessoSupabase({ pathname: "/financeiro", usuario: usuario("comercial") })
    ).toEqual({ tipo: "redireciona", para: "/sem-acesso" });
  });

  it("dono e gestor passam em /financeiro/dre", () => {
    for (const papel of ["dono", "gestor"] as const) {
      expect(
        decidirAcessoSupabase({ pathname: "/financeiro/dre", usuario: usuario(papel) })
      ).toEqual({ tipo: "passa" });
    }
  });

  it("sem usuário em /financeiro manda para /login", () => {
    expect(decidirAcessoSupabase({ pathname: "/financeiro", usuario: null })).toEqual({
      tipo: "redireciona",
      para: "/login",
    });
  });

  it("sem usuário em /login passa; sem usuário em /sem-acesso manda para /login", () => {
    expect(decidirAcessoSupabase({ pathname: "/login", usuario: null })).toEqual({
      tipo: "passa",
    });
    expect(decidirAcessoSupabase({ pathname: "/sem-acesso", usuario: null })).toEqual({
      tipo: "redireciona",
      para: "/login",
    });
  });

  it("usuário logado em /login vai para a primeira rota do próprio papel, nunca para '/' fixo", () => {
    expect(
      decidirAcessoSupabase({ pathname: "/login", usuario: usuario("mentorado") })
    ).toEqual({ tipo: "redireciona", para: "/inicio" });
    expect(decidirAcessoSupabase({ pathname: "/login", usuario: usuario("dono") })).toEqual({
      tipo: "redireciona",
      para: "/",
    });
    expect(
      decidirAcessoSupabase({ pathname: "/login", usuario: usuario("comercial") })
    ).toEqual({ tipo: "redireciona", para: "/crm" });
  });

  it("usuário logado em qualquer coisa sob /login/ também é mandado para a primeira rota do papel", () => {
    expect(
      decidirAcessoSupabase({ pathname: "/login/qualquer", usuario: usuario("dono") })
    ).toEqual({ tipo: "redireciona", para: "/" });
  });

  it("mentorado logado em /sem-acesso passa — prova de que não há laço", () => {
    expect(
      decidirAcessoSupabase({ pathname: "/sem-acesso", usuario: usuario("mentorado") })
    ).toEqual({ tipo: "passa" });
  });

  // ALTO 3 — `ehRotaOuSubrota` tem que respeitar fronteira de segmento, não
  // texto cru: um `startsWith("/login")` ingênuo casaria "/loginzinho" com a
  // rota livre "/login" por coincidência de caracteres. Sem estes testes, o
  // dia em que alguém criar "/login-parceiro" ou "/sem-acesso-legado" essa
  // rota nova herdaria, por acidente, o tratamento especial de /login ou
  // /sem-acesso — e passaria SEM SESSÃO, silenciosamente.
  describe("ehRotaOuSubrota — fronteira de segmento, não prefixo de texto", () => {
    const parecidasComLogin = ["/loginzinho", "/login-parceiro"];
    const parecidasComSemAcesso = ["/sem-acessos", "/sem-acesso-legado"];

    it("rotas parecidas com /login, mas que não são /login, são tratadas como rota comum: sem usuário vão para /login (não passam cego)", () => {
      for (const pathname of parecidasComLogin) {
        expect(decidirAcessoSupabase({ pathname, usuario: null })).toEqual({
          tipo: "redireciona",
          para: "/login",
        });
      }
    });

    it("rotas parecidas com /login: mentorado logado vai para /sem-acesso (rota comum negada, não a passagem franca de /login)", () => {
      for (const pathname of parecidasComLogin) {
        expect(decidirAcessoSupabase({ pathname, usuario: usuario("mentorado") })).toEqual({
          tipo: "redireciona",
          para: "/sem-acesso",
        });
      }
    });

    it("rotas parecidas com /sem-acesso, mas que não são /sem-acesso, são tratadas como rota comum: sem usuário vão para /login", () => {
      for (const pathname of parecidasComSemAcesso) {
        expect(decidirAcessoSupabase({ pathname, usuario: null })).toEqual({
          tipo: "redireciona",
          para: "/login",
        });
      }
    });

    it("rotas parecidas com /sem-acesso: mentorado logado vai para /sem-acesso de verdade (rota comum negada)", () => {
      for (const pathname of parecidasComSemAcesso) {
        expect(decidirAcessoSupabase({ pathname, usuario: usuario("mentorado") })).toEqual({
          tipo: "redireciona",
          para: "/sem-acesso",
        });
      }
    });

    it("/login/ (barra final) continua tratado como a própria rota /login", () => {
      expect(decidirAcessoSupabase({ pathname: "/login/", usuario: null })).toEqual({
        tipo: "passa",
      });
      expect(
        decidirAcessoSupabase({ pathname: "/login/", usuario: usuario("dono") })
      ).toEqual({ tipo: "redireciona", para: "/" });
    });

    it("/sem-acesso/ (barra final) continua tratado como a própria rota /sem-acesso", () => {
      expect(decidirAcessoSupabase({ pathname: "/sem-acesso/", usuario: null })).toEqual({
        tipo: "redireciona",
        para: "/login",
      });
      expect(
        decidirAcessoSupabase({ pathname: "/sem-acesso/", usuario: usuario("mentorado") })
      ).toEqual({ tipo: "passa" });
    });
  });

  // MÉDIO 1 — `rotaLivre` (src/lib/acesso.ts) declara /privacidade e /acesso
  // como as rotas que "o portão nunca pode bloquear". No modo supabase, antes
  // deste teste, só quem tinha sessão chegava lá — anônimo caía na regra 3
  // (sem usuário -> /login) antes de a rota livre ser considerada. Isso é uma
  // assimetria: a MESMA página fica pública para logado e trancada para
  // anônimo, o oposto do que a página de privacidade precisa ser.
  describe("MÉDIO 1 — rotaLivre entra ANTES de 'sem usuário -> /login'", () => {
    it("anônimo em /privacidade e /acesso passa, sem precisar logar", () => {
      expect(decidirAcessoSupabase({ pathname: "/privacidade", usuario: null })).toEqual({
        tipo: "passa",
      });
      expect(decidirAcessoSupabase({ pathname: "/acesso", usuario: null })).toEqual({
        tipo: "passa",
      });
    });

    it("mentorado logado também passa em /privacidade — mesma regra para os dois lados", () => {
      expect(
        decidirAcessoSupabase({ pathname: "/privacidade", usuario: usuario("mentorado") })
      ).toEqual({ tipo: "passa" });
    });

    it("a regra nova não pode regredir a regra de /login: anônimo em /login continua passando, e logado em /login continua indo para a primeira rota do papel — não para /login por ser 'rota livre'", () => {
      expect(decidirAcessoSupabase({ pathname: "/login", usuario: null })).toEqual({
        tipo: "passa",
      });
      expect(
        decidirAcessoSupabase({ pathname: "/login", usuario: usuario("mentorado") })
      ).toEqual({ tipo: "redireciona", para: "/inicio" });
    });
  });

  // BAIXO 4 — a raiz "/" renderiza o Springboard com o catálogo INTEIRO de
  // apps (Financeiro incluído). Os números não vazam (RLS zera), mas a
  // EXISTÊNCIA das áreas sim — exatamente o que /sem-acesso foi escrita para
  // não fazer. Papel cuja primeira rota não é "/" precisa ser tirado da raiz
  // antes de o Springboard renderizar.
  describe("BAIXO 4 — raiz '/' redireciona para a primeira rota de quem não é dono/gestor", () => {
    it("mentorado, afiliado e aluno em '/' vão para /inicio", () => {
      for (const papel of ["mentorado", "afiliado", "aluno"] as const) {
        expect(decidirAcessoSupabase({ pathname: "/", usuario: usuario(papel) })).toEqual({
          tipo: "redireciona",
          para: "/inicio",
        });
      }
    });

    it("comercial em '/' vai para /crm", () => {
      expect(decidirAcessoSupabase({ pathname: "/", usuario: usuario("comercial") })).toEqual({
        tipo: "redireciona",
        para: "/crm",
      });
    });

    it("dono e gestor em '/' passam — a comparação com primeiraRotaDe(papel) é o que evita o laço", () => {
      for (const papel of ["dono", "gestor"] as const) {
        expect(decidirAcessoSupabase({ pathname: "/", usuario: usuario(papel) })).toEqual({
          tipo: "passa",
        });
      }
    });
  });

  it("percorre os seis papéis: o destino de redirecionamento, quando existe, é sempre uma rota que a própria decisão libera para aquele papel — sem isso, laço", () => {
    const rotasParaChecar = [
      "/",
      "/inicio",
      "/painel",
      "/crm",
      "/financeiro",
      "/financeiro/dre",
      "/analise",
      "/extrato",
      "/integracoes",
      "/agenda",
      "/conteudo/aula-1",
      "/login",
      "/sem-acesso",
    ];

    for (const papel of TODOS_OS_PAPEIS) {
      for (const pathname of rotasParaChecar) {
        const decisao = decidirAcessoSupabase({ pathname, usuario: usuario(papel) });
        if (decisao.tipo === "redireciona") {
          const destino = decidirAcessoSupabase({ pathname: decisao.para, usuario: usuario(papel) });
          expect(destino).toEqual({ tipo: "passa" });
        }
      }
    }
  });
});
