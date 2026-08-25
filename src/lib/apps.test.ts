// Testes do catálogo de apps da tela inicial — vitest.

import { describe, expect, it } from "vitest";
import { rotaPermitida, type Papel } from "@/lib/papeis";
import {
  acharAppPorRota,
  appsDoPapel,
  badgeValido,
  CATALOGO_APPS,
  CATALOGO_SISTEMA,
  contarAppsComBadge,
  ordenarApps,
  type AppCatalogo,
} from "./apps";

describe("CATALOGO_APPS — não inventa rota", () => {
  it("todo href de app e de sub-app começa com barra", () => {
    for (const app of CATALOGO_APPS) {
      expect(app.href.startsWith("/")).toBe(true);
      for (const sub of app.subApps ?? []) {
        expect(sub.href.startsWith("/")).toBe(true);
      }
    }
  });

  it("Financeiro, Conteúdo e Central de Clientes têm sub-apps; os demais não", () => {
    // O CRM entrou na lista na tarefa 47: `/comercial` virou sub-app dele em
    // vez de um décimo primeiro tile, porque a paleta do primeiro nível foi
    // declarada saturada na tarefa 29 e um tile novo exigiria cor nova.
    const comPasta = CATALOGO_APPS.filter((a) => (a.subApps?.length ?? 0) > 0).map((a) => a.id);
    expect(comPasta.sort()).toEqual(["conteudo", "crm", "financeiro"].sort());
  });

  it("Central de Clientes tem as duas telas do lado comercial", () => {
    const crm = CATALOGO_APPS.find((a) => a.id === "crm")!;
    expect(crm.subApps?.map((s) => s.href)).toEqual(["/crm", "/comercial"]);
    // O dourado do cliente vale para as duas: são perguntas diferentes sobre
    // as mesmas pessoas.
    expect(new Set(crm.subApps?.map((s) => s.cor))).toEqual(new Set([crm.cor]));
  });

  it("mentorado não recebe o sub-app de negociações", () => {
    // `oportunidade` carrega valor negociado, probabilidade e motivo de
    // perda — e a pessoa de quem se fala é exatamente quem não pode ler.
    const crm = appsDoPapel("mentorado").find((a) => a.id === "crm");
    expect(crm).toBeUndefined();
    for (const papel of ["afiliado", "aluno"] as const) {
      const apps = appsDoPapel(papel);
      expect(apps.flatMap((a) => a.subApps ?? []).map((s) => s.href)).not.toContain("/comercial");
    }
  });

  it("comercial recebe as duas telas da Central de Clientes", () => {
    const crm = appsDoPapel("comercial").find((a) => a.id === "crm")!;
    expect(crm.subApps?.map((s) => s.href)).toEqual(["/crm", "/comercial"]);
  });

  it("Financeiro tem exatamente as telas de fin-rotas.ts, na mesma ordem", () => {
    // Capital de giro e Comissões saíram na virada para mentoria (rotas removidas).
    const financeiro = CATALOGO_APPS.find((a) => a.id === "financeiro")!;
    expect(financeiro.subApps?.map((s) => s.href)).toEqual([
      "/financeiro",
      "/financeiro/caixa",
      "/financeiro/projecao",
      "/financeiro/dre",
      "/financeiro/reembolsos",
      "/financeiro/cobrancas",
      "/financeiro/contratos",
      "/financeiro/recorrencia",
    ]);
  });

  it("não expõe as novas telas financeiras para comercial ou mentorado", () => {
    const novas = ["/financeiro/cobrancas", "/financeiro/contratos", "/financeiro/recorrencia"];
    for (const papel of ["comercial", "mentorado"] as const) {
      const serializado = JSON.stringify(appsDoPapel(papel));
      for (const href of novas) expect(serializado).not.toContain(href);
    }
  });

  it("nenhum id de app ou sub-app se repete", () => {
    const ids = CATALOGO_APPS.flatMap((a) => [a.id, ...(a.subApps ?? []).map((s) => s.id)]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("acharAppPorRota", () => {
  it("a raiz não é app nenhum — é a própria tela inicial", () => {
    // "/" deixou de ser o Dashboard: virou a área de trabalho com os ícones,
    // e o Dashboard passou a morar em "/painel" como mais um aplicativo. A
    // raiz não pode resolver para app nenhum, senão a topbar anunciaria um
    // lugar aberto justamente na tela que serve para escolher o lugar.
    expect(acharAppPorRota("/")).toBeNull();
    expect(acharAppPorRota("/painel")?.app.id).toBe("dashboard");
    // "/" não é prefixo de tudo — "/agenda" não pode cair no Dashboard
    expect(acharAppPorRota("/agenda")?.app.id).toBe("agenda");
  });

  it("acha o sub-app certo dentro de Financeiro por rota filha", () => {
    const achado = acharAppPorRota("/financeiro/dre");
    expect(achado?.app.id).toBe("financeiro");
    expect(achado?.subApp?.id).toBe("financeiro-dre");
  });

  it("uma rota mais funda que qualquer sub-app ainda resolve para o app-pai, sem sub-app", () => {
    const achado = acharAppPorRota("/financeiro/reembolsos/detalhe/xyz");
    expect(achado?.app.id).toBe("financeiro");
    expect(achado?.subApp?.id).toBe("financeiro-reembolsos");
  });

  it("em empate (a rota do app É a rota de um sub-app), o app-nível vence", () => {
    const achado = acharAppPorRota("/financeiro");
    expect(achado?.app.id).toBe("financeiro");
    expect(achado?.subApp).toBeNull();
  });

  it("rota que não bate com nada devolve null", () => {
    expect(acharAppPorRota("/rota-que-nao-existe")).toBeNull();
  });

  it("não confunde prefixo textual sem barra (\"/agenda\" não é pai de \"/agendamento\")", () => {
    expect(acharAppPorRota("/agendamento")).toBeNull();
  });
});

describe("badgeValido", () => {
  it("número inteiro positivo passa", () => {
    expect(badgeValido(3)).toBe(3);
  });

  it("trunca fração (contagem é sempre inteira)", () => {
    expect(badgeValido(2.9)).toBe(2);
  });

  it("zero, negativo, NaN, null e undefined não viram badge", () => {
    expect(badgeValido(0)).toBeUndefined();
    expect(badgeValido(-1)).toBeUndefined();
    expect(badgeValido(NaN)).toBeUndefined();
    expect(badgeValido(Infinity)).toBeUndefined();
    expect(badgeValido(null)).toBeUndefined();
    expect(badgeValido(undefined)).toBeUndefined();
  });
});

describe("contarAppsComBadge", () => {
  it("conta só os apps com badge de verdade", () => {
    const total = contarAppsComBadge(CATALOGO_APPS, {
      agenda: 3,
      financeiro: 0, // zero não conta
      crm: undefined,
      dashboard: -5, // negativo não conta
    });
    expect(total).toBe(1);
  });

  it("sem nenhum badge, conta zero", () => {
    expect(contarAppsComBadge(CATALOGO_APPS, {})).toBe(0);
  });
});

describe("appsDoPapel — B2.7, a navegação passa a respeitar o papel", () => {
  const TODOS_PAPEIS: readonly Papel[] = [
    "dono",
    "gestor",
    "comercial",
    "mentorado",
    "afiliado",
    "aluno",
  ];

  it.each(["dono", "gestor"] as const)(
    "%s recebe o catálogo inteiro, com todos os subApps",
    (papel) => {
      expect(appsDoPapel(papel)).toEqual(CATALOGO_APPS);
      // subApps de Financeiro e Conteúdo continuam inteiros, não só o app-pai.
      const financeiro = appsDoPapel(papel).find((a) => a.id === "financeiro")!;
      expect(financeiro.subApps?.length).toBe(
        CATALOGO_APPS.find((a) => a.id === "financeiro")!.subApps!.length
      );
    }
  );

  it("mentorado não recebe Mentoria, Financeiro, Dashboard nem Central de Clientes", () => {
    const nomes = appsDoPapel("mentorado").map((a) => a.nome);
    expect(nomes).not.toContain("Mentoria");
    expect(nomes).not.toContain("Financeiro");
    expect(nomes).not.toContain("Dashboard");
    expect(nomes).not.toContain("Central de Clientes");
  });

  it("mentorado não recebe Extrato nem Integrações (catálogo Sistema)", () => {
    const nomes = appsDoPapel("mentorado", CATALOGO_SISTEMA).map((a) => a.nome);
    expect(nomes).not.toContain("Importar extrato");
    expect(nomes).not.toContain("Integrações");
  });

  it("comercial não recebe Mentoria nem Financeiro, mas recebe Central de Clientes e Agenda", () => {
    const nomes = appsDoPapel("comercial").map((a) => a.nome);
    expect(nomes).not.toContain("Mentoria");
    expect(nomes).not.toContain("Financeiro");
    expect(nomes).toContain("Central de Clientes");
    expect(nomes).toContain("Agenda");
  });

  it("um app com href negado some inteiro — com subApps e tudo", () => {
    // Financeiro: href "/financeiro" é negado para mentorado, então o app
    // inteiro (inclusive os cinco subApps) fica fora da lista devolvida.
    const financeiro = appsDoPapel("mentorado").find((a) => a.id === "financeiro");
    expect(financeiro).toBeUndefined();
  });

  it("um app com href permitido mas subApps todos negados continua aparecendo, com subApps vazio", () => {
    // Cenário sintético: um app cujo href-pai é liberado para o papel mas
    // cujos dois subApps não são — o app não pode sumir, só a lista de
    // sub-apps fica vazia. Usa "/agenda" (permitido a mentorado) como
    // href-pai e sub-apps inventados sob prefixo negado ("/financeiro/...").
    const catalogoSintetico: AppCatalogo[] = [
      {
        id: "sintetico",
        nome: "Sintético",
        href: "/agenda",
        icone: "CalendarDays",
        cor: "#000000",
        frase: "",
        subApps: [
          { id: "s1", nome: "S1", href: "/financeiro/s1", icone: "Wallet", cor: "#000", frase: "" },
          { id: "s2", nome: "S2", href: "/financeiro/s2", icone: "Wallet", cor: "#000", frase: "" },
        ],
      },
    ];
    const resultado = appsDoPapel("mentorado", catalogoSintetico);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].subApps).toEqual([]);
  });

  it.each(TODOS_PAPEIS)(
    "papel %s: todo app devolvido tem href permitido, e todo subApp devolvido também",
    (papel) => {
      for (const catalogo of [CATALOGO_APPS, CATALOGO_SISTEMA]) {
        for (const app of appsDoPapel(papel, catalogo)) {
          expect(rotaPermitida(papel, app.href)).toBe(true);
          for (const sub of app.subApps ?? []) {
            expect(rotaPermitida(papel, sub.href)).toBe(true);
          }
        }
      }
    }
  );

  it("CATALOGO_APPS e CATALOGO_SISTEMA estão congelados", () => {
    expect(Object.isFrozen(CATALOGO_APPS)).toBe(true);
    expect(Object.isFrozen(CATALOGO_APPS[0])).toBe(true);
    expect(Object.isFrozen(CATALOGO_SISTEMA)).toBe(true);
    const financeiro = CATALOGO_APPS.find((a) => a.id === "financeiro")!;
    expect(Object.isFrozen(financeiro.subApps)).toBe(true);
    expect(Object.isFrozen(financeiro.subApps![0])).toBe(true);
  });

  it("appsDoPapel não muta CATALOGO_APPS (chamar para todo papel e comparar antes/depois)", () => {
    const antes = JSON.parse(JSON.stringify(CATALOGO_APPS));
    for (const papel of TODOS_PAPEIS) appsDoPapel(papel);
    expect(CATALOGO_APPS).toEqual(antes);
  });

  it("chamar appsDoPapel duas vezes, com o mesmo papel, devolve o mesmo conteúdo", () => {
    expect(appsDoPapel("comercial")).toEqual(appsDoPapel("comercial"));
    expect(appsDoPapel("mentorado", CATALOGO_SISTEMA)).toEqual(
      appsDoPapel("mentorado", CATALOGO_SISTEMA)
    );
  });
});

describe("ordenarApps", () => {
  it("ordena por nome, alfabeto pt-BR", () => {
    const itens: AppCatalogo[] = [
      { id: "b", nome: "Conteúdo", href: "/b", icone: "Film", cor: "#000", frase: "" },
      { id: "a", nome: "Agenda", href: "/a", icone: "CalendarDays", cor: "#000", frase: "" },
      { id: "c", nome: "Éter", href: "/c", icone: "Trophy", cor: "#000", frase: "" },
    ];
    expect(ordenarApps(itens).map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("não muta a lista original", () => {
    const itens = CATALOGO_APPS.slice();
    const copia = [...itens];
    ordenarApps(itens);
    expect(itens).toEqual(copia);
  });

  it("função genérica: funciona com sub-apps também", () => {
    const financeiro = CATALOGO_APPS.find((a) => a.id === "financeiro")!;
    const ordenado = ordenarApps(financeiro.subApps ?? []);
    const nomes = ordenado.map((s) => s.nome);
    expect(nomes).toEqual([...nomes].sort((a, b) => a.localeCompare(b, "pt-BR")));
  });
});

// ---------------------------------------------------------------------------
// Tarefa 29 — o tile de Trilhas
// ---------------------------------------------------------------------------
describe("CATALOGO_APPS — Trilhas (tarefa 29)", () => {
  const trilhas = () => CATALOGO_APPS.find((a) => a.id === "trilhas");

  it("existe, aponta para /trilhas e não é pasta (não tem subApps)", () => {
    const app = trilhas();
    expect(app).toBeDefined();
    expect(app!.href).toBe("/trilhas");
    expect(app!.subApps).toBeUndefined();
  });

  it("nenhuma cor de primeiro nível se repete no catálogo", () => {
    // O critério escrito no comentário de paleta de apps.ts: os tiles
    // precisam ficar DISTINGUÍVEIS entre si, senão o usuário erra o clique.
    // Duas cores iguais é o caso mais fácil de detectar — e o mais fácil de
    // introduzir sem perceber, copiando a linha do app de cima.
    const cores = CATALOGO_APPS.map((a) => a.cor);
    expect(new Set(cores).size).toBe(cores.length);
  });

  it("nenhum ícone de primeiro nível se repete no catálogo", () => {
    const icones = CATALOGO_APPS.map((a) => a.icone);
    expect(new Set(icones).size).toBe(icones.length);
  });

  it("dono e gestor recebem o tile; mais ninguém", () => {
    for (const papel of ["dono", "gestor"] as const) {
      expect(appsDoPapel(papel).map((a) => a.id)).toContain("trilhas");
    }
    for (const papel of ["comercial", "mentorado", "afiliado", "aluno"] as const) {
      expect(appsDoPapel(papel).map((a) => a.id)).not.toContain("trilhas");
    }
  });

  it("para quem não pode abrir, o tile não vaza nem a EXISTÊNCIA do módulo", () => {
    // B2.7 de novo: o que `appsDoPapel` devolve vira JSON no navegador. Um
    // tile filtrado "na hora de desenhar" já teria contado que existe uma
    // área de trilhas — o vazamento que aquela tarefa fechou.
    for (const papel of ["comercial", "mentorado", "afiliado", "aluno"] as const) {
      const serializado = JSON.stringify(appsDoPapel(papel));
      expect(serializado).not.toContain("/trilhas");
      expect(serializado).not.toContain("Trilhas");
    }
  });

  it("todo href de todo app devolvido é uma rota que aquele papel abre de verdade", () => {
    // Vale para app e sub-app, nos seis papéis: nenhum tile pode levar para
    // /sem-acesso. É a mesma pergunta do teste da gaveta, do outro lado.
    const TODOS: readonly Papel[] = ["dono", "gestor", "comercial", "mentorado", "afiliado", "aluno"];
    for (const papel of TODOS) {
      for (const catalogo of [CATALOGO_APPS, CATALOGO_SISTEMA]) {
        for (const app of appsDoPapel(papel, catalogo as AppCatalogo[])) {
          expect([papel, app.href, rotaPermitida(papel, app.href)]).toEqual([papel, app.href, true]);
          for (const sub of app.subApps ?? []) {
            expect([papel, sub.href, rotaPermitida(papel, sub.href)]).toEqual([
              papel,
              sub.href,
              true,
            ]);
          }
        }
      }
    }
  });
});
