// Contrato da rota pública do diagnóstico.
//
// O que estes testes protegem não é o caminho feliz — é o conjunto de recusas.
// Uma rota pública de escrita é a superfície mais exposta do projeto, e cada
// caso abaixo corresponde a uma forma concreta de estragar o funil: entrar na
// fila sem responder nada, empurrar telefone para dentro de um sistema que
// promete não pedir, ou descobrir códigos alheios pela resposta.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { _zerar } from "@/lib/diagnostico/limite";

const gravar = vi.fn();
vi.mock("@/lib/diagnostico/registro", () => ({
  gravarDiagnostico: (...a: unknown[]) => gravar(...a),
}));

const { POST } = await import("./route");

const CORPO = {
  codigo: "JR-B1-T5-3-K7QM",
  faturamento: "B",
  papel: "D",
  trava: "T5",
  inacabados: 3,
  urgencia: 1,
  origem: "/diagnostico.html",
};

function post(corpo: unknown, ip = "1.2.3.4") {
  return POST(
    new Request("https://rarotreinamentos.com.br/api/diagnostico", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
    })
  );
}

beforeEach(() => {
  _zerar();
  gravar.mockReset();
  gravar.mockResolvedValue({ estado: "gravado" });
});

describe("o caminho normal", () => {
  it("aceita as cinco respostas e devolve 201", async () => {
    const r = await post(CORPO);
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ ok: true });
  });

  it("aceita o corpo de quem foi recusado na primeira pergunta", async () => {
    const r = await post({
      codigo: "JR-F-K7QM",
      faturamento: "F",
      papel: null,
      trava: null,
      inacabados: null,
      urgencia: null,
      origem: "/diagnostico.html",
    });
    expect(r.status).toBe(201);
  });

  it("repetido responde igual a gravado — a rota não conta o que ela sabe", async () => {
    // Diferenciar as duas respostas transformaria a rota em oráculo de
    // "este código já existe?", que é o começo de adivinhar código alheio.
    gravar.mockResolvedValue({ estado: "repetido" });
    const r = await post(CORPO);
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ ok: true });
  });
});

describe("o que a rota recusa", () => {
  it("corpo que não é JSON", async () => {
    expect((await post("{isto não é json")).status).toBe(400);
  });

  it("código fora do formato do projeto", async () => {
    expect((await post({ ...CORPO, codigo: "JR-B1-T5-3" })).status).toBe(400); // sem sufixo
    expect((await post({ ...CORPO, codigo: "qualquer-coisa" })).status).toBe(400);
  });

  it("resposta fora da escala", async () => {
    expect((await post({ ...CORPO, urgencia: 9 })).status).toBe(400);
    expect((await post({ ...CORPO, inacabados: -1 })).status).toBe(400);
    expect((await post({ ...CORPO, trava: "T9" })).status).toBe(400);
  });

  it("NÃO ACEITA TELEFONE, NOME NEM E-MAIL — nem ignorando", async () => {
    // A landing promete "não peço cadastro". Se esta rota aceitasse o campo e
    // apenas o ignorasse, a promessa cairia no dia em que alguém acrescentasse
    // "só um campinho" na landing — sem nenhum teste ficando vermelho.
    for (const campo of ["telefone", "nome", "email", "whatsapp"]) {
      const r = await post({ ...CORPO, [campo]: "11999999999" });
      expect(r.status, campo).toBe(400);
    }
    expect(gravar).not.toHaveBeenCalled();
  });

  it("não aceita `qualificado` vindo do browser", async () => {
    // O veredito é do servidor. Aceitar este campo deixaria qualquer pessoa
    // entrar na fila de atendimento com uma linha de curl.
    expect((await post({ ...CORPO, qualificado: true })).status).toBe(400);
  });
});

describe("limite por IP", () => {
  it("barra a partir da décima primeira do mesmo IP, com Retry-After", async () => {
    for (let i = 0; i < 10; i++) expect((await post(CORPO, "9.9.9.9")).status).toBe(201);
    const r = await post(CORPO, "9.9.9.9");
    expect(r.status).toBe(429);
    expect(Number(r.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("um IP estourado não barra o vizinho", async () => {
    for (let i = 0; i < 12; i++) await post(CORPO, "9.9.9.9");
    expect((await post(CORPO, "8.8.8.8")).status).toBe(201);
  });
});

describe("quando o servidor não está configurado", () => {
  it("responde 503 dizendo QUAL variável falta, e nunca o valor dela", async () => {
    gravar.mockResolvedValue({ estado: "sem-configuracao" });
    const r = await post(CORPO);
    expect(r.status).toBe(503);
    const corpo = await r.json();
    expect(corpo.proximo_passo).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(JSON.stringify(corpo)).not.toMatch(/eyJ/); // nenhum pedaço de chave
  });

  it("falha de banco vira 500 sem vazar a mensagem do Postgres", async () => {
    gravar.mockResolvedValue({ estado: "falhou", motivo: 'relation "diagnostico_lead" does not exist' });
    const r = await post(CORPO);
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toContain("diagnostico_lead");
  });
});
