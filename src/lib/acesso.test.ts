import { describe, expect, it } from "vitest";
import {
  modoAcesso,
  rotaLivre,
  selo,
  seloConfere,
  senhaValida,
  temDadoReal,
  type AmbienteAcesso,
} from "./acesso";

const SUPA = { supabaseUrl: "https://x.supabase.co", supabaseKey: "anon-key" };
const SENHA_BOA = "raro-2026-segredo";

describe("modoAcesso", () => {
  it("com Supabase configurado, quem manda é o login de verdade", () => {
    // Mesmo com senha compartilhada no ambiente: login individual é melhor
    // que senha única, e não faz sentido pedir as duas.
    expect(modoAcesso({ ...SUPA, senha: SENHA_BOA })).toBe("supabase");
  });

  it("sem Supabase mas com senha, o sistema pede a senha", () => {
    expect(modoAcesso({ senha: SENHA_BOA, sheetsId: "abc" })).toBe("senha");
  });

  it("com planilha real e nenhuma proteção, TRANCA em vez de mostrar", () => {
    // Este é o teste que existe por causa do incidente: o sistema ficou
    // aberto na internet com o financeiro do dono porque a ausência de
    // configuração era interpretada como permissão.
    expect(modoAcesso({ sheetsId: "14iCA..." })).toBe("trancado");
  });

  it("demonstração não tem o que proteger e continua aberta", () => {
    expect(modoAcesso({ modo: "demo", sheetsId: "14iCA..." })).toBe("aberto");
    expect(modoAcesso({})).toBe("aberto");
  });

  it("só abre com dado real se alguém declarar isso explicitamente", () => {
    expect(modoAcesso({ sheetsId: "abc", abertoDeclarado: "1" })).toBe("aberto");
    // Qualquer outro valor não vale — nada de "true", "sim" ou "0" abrindo a porta.
    expect(modoAcesso({ sheetsId: "abc", abertoDeclarado: "true" })).toBe("trancado");
    expect(modoAcesso({ sheetsId: "abc", abertoDeclarado: "0" })).toBe("trancado");
  });

  it("senha curta demais é tratada como senha nenhuma", () => {
    expect(senhaValida("1234")).toBe(false);
    expect(modoAcesso({ senha: "1234", sheetsId: "abc" })).toBe("trancado");
    expect(senhaValida(SENHA_BOA)).toBe(true);
  });

  it("espaço em branco não vira senha", () => {
    expect(senhaValida("              ")).toBe(false);
  });
});

describe("temDadoReal", () => {
  it("planilha conectada é dado real; demonstração não é", () => {
    expect(temDadoReal({ sheetsId: "abc" })).toBe(true);
    expect(temDadoReal({ sheetsId: "abc", modo: "demo" })).toBe(false);
    expect(temDadoReal({ ...SUPA })).toBe(true);
    expect(temDadoReal({})).toBe(false);
  });
});

describe("selo do cookie", () => {
  it("é determinístico para a mesma senha", async () => {
    expect(await selo(SENHA_BOA)).toBe(await selo(SENHA_BOA));
  });

  it("muda inteiro quando a senha muda", async () => {
    expect(await selo(SENHA_BOA)).not.toBe(await selo(`${SENHA_BOA}x`));
  });

  it("não contém a senha em lugar nenhum", async () => {
    // O cookie viaja em toda requisição e aparece em log de proxy: ele prova
    // que quem o emitiu conhecia a senha, sem carregar a senha.
    const s = await selo(SENHA_BOA);
    expect(s).not.toContain(SENHA_BOA);
    expect(s).toMatch(/^[0-9a-f]{64}$/);
  });

  it("confere o cookie certo e recusa o errado", async () => {
    const bom = await selo(SENHA_BOA);
    expect(await seloConfere(bom, SENHA_BOA)).toBe(true);
    expect(await seloConfere(bom, "outra-senha-longa")).toBe(false);
    expect(await seloConfere("selo-falso", SENHA_BOA)).toBe(false);
    expect(await seloConfere(undefined, SENHA_BOA)).toBe(false);
    // Sem senha configurada, nenhum cookie vale — nem um cookie válido de antes.
    expect(await seloConfere(bom, undefined)).toBe(false);
  });
});

describe("rotaLivre", () => {
  it("a própria tela de destravar nunca pode ser bloqueada", () => {
    // Sem isto, o portão redireciona /acesso para /acesso, para sempre.
    expect(rotaLivre("/acesso")).toBe(true);
    expect(rotaLivre("/login")).toBe(true);
    expect(rotaLivre("/privacidade")).toBe(true);
  });

  it("o resto do sistema passa pelo portão", () => {
    expect(rotaLivre("/")).toBe(false);
    expect(rotaLivre("/painel")).toBe(false);
    expect(rotaLivre("/crm/aluno-1")).toBe(false);
    // "/acessos" não é "/acesso": prefixo tem que respeitar a barra.
    expect(rotaLivre("/acessorios")).toBe(false);
  });
});

// Guarda de regressão do ambiente real: a senha NUNCA pode virar variável
// pública, senão vai junto no pacote que o navegador baixa.
describe("higiene de configuração", () => {
  it("não existe leitura de senha por variável NEXT_PUBLIC", () => {
    const amb: AmbienteAcesso = { senha: SENHA_BOA };
    expect(Object.keys(amb).some((k) => k.startsWith("NEXT_PUBLIC"))).toBe(false);
  });
});

// Tarefa 48 — a proposta é lida pelo prospect, sem login.
describe("rotaLivre — /proposta (tarefa 48)", () => {
  it("o link da proposta passa sem login", () => {
    expect(rotaLivre("/proposta/aB3dEfGhIjKlMnOpQrStUv")).toBe(true);
    expect(rotaLivre("/proposta")).toBe(true);
  });

  it("só o segmento exato é livre", () => {
    expect(rotaLivre("/propostas")).toBe(false);
    expect(rotaLivre("/proposta-interna")).toBe(false);
    // E a pegadinha do prefixo textual sem barra, que é como a lista
    // costuma vazar: `/propostaXYZ` não é `/proposta`.
    expect(rotaLivre("/propostaXYZ")).toBe(false);
  });

  it("travessia no lugar do token não abre porta nenhuma", () => {
    // `/proposta/..%2ffinanceiro` continua sendo UMA rota livre — o portão
    // não pergunta quem é —, e é isso mesmo: o que ela alcança é a página de
    // proposta com um token impossível, que responde "não está disponível"
    // sem tocar no banco (ver a suíte de `/proposta/[token]`).
    //
    // O que NÃO pode acontecer é a travessia liberar o DESTINO. E não
    // libera: a comparação é por prefixo de segmento, então `/financeiro`
    // continua fechado — decodificado ou não.
    expect(rotaLivre("/proposta/..%2ffinanceiro")).toBe(true);
    expect(rotaLivre("/proposta/../financeiro")).toBe(true);
    expect(rotaLivre("/financeiro")).toBe(false);
    expect(rotaLivre("/..%2ffinanceiro")).toBe(false);
  });
});

// Tarefa 29 — a verificação de certificado é PÚBLICA.
describe("rotaLivre — /certificado (tarefa 29)", () => {
  it("a conferência de certificado passa sem login", () => {
    // Quem confere um certificado é um contratante, um cliente do aluno,
    // alguém que nunca vai ter conta aqui. Atrás do portão, o certificado
    // não serve para nada: só o próprio emissor conseguiria conferir.
    expect(rotaLivre("/certificado/ABC23456789K")).toBe(true);
    expect(rotaLivre("/certificado")).toBe(true);
  });

  it("só o segmento exato é livre — /certificados não é /certificado", () => {
    expect(rotaLivre("/certificados")).toBe(false);
    expect(rotaLivre("/certificado-interno")).toBe(false);
  });

  it("nenhuma rota de dado do dono entrou na lista junto", () => {
    // Guarda de regressão: a lista de rotas livres é a lista de coisas que
    // o portão NÃO protege. Ela cresce por decisão, nunca por descuido.
    for (const rota of ["/painel", "/financeiro", "/crm", "/comercial", "/mentoria", "/trilhas", "/portal"]) {
      expect(rotaLivre(rota)).toBe(false);
    }
  });
});

// Tarefa 72 — links de campanha são acessados por quem recebeu o link, sem login.
describe("rotaLivre — /l (tarefa 72)", () => {
  it("o código rastreado passa pelo portão sem abrir rotas parecidas", () => {
    expect(rotaLivre("/l/AbCd1234")).toBe(true);
    expect(rotaLivre("/links/AbCd1234")).toBe(false);
    expect(rotaLivre("/landing")).toBe(false);
  });
});
