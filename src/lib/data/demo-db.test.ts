// Teste de ponta a ponta da trilha OFICIAL de importação de extrato
// (DataProvider.importarExtrato) contra o provider de demonstração.
//
// Por que este teste existe: até esta obra a tela de importação (/extrato)
// tinha sua PRÓPRIA Server Action, que nunca chamava `importarExtrato` — o
// contrato oficial (este arquivo testa) era código morto. Sem um teste
// batendo na trilha real, a unificação das duas trilhas podia "passar" com
// `importarExtrato` quebrado e ninguém perceber até produção.
//
// As duas garantias que mais importam aqui (ver extrato.ts e provider.ts):
// (1) reenviar o MESMO extrato é uso normal do cliente e tem que gravar zero
// na segunda vez, sem duplicar dinheiro no caixa; (2) a categoria que o dono
// escolheu no passo de conferência tem que chegar no MovimentoCaixa gravado
// — nunca fixa em "outros" (bug que existia em demo-db/supabase-db/sheets-db
// antes desta obra).

import { describe, expect, it } from "vitest";
import { demoProvider, demoProvider as db } from "./demo-db";
import { lerExtrato } from "../extrato/extrato";
import type { MensagemRecebida } from "../atendimento/contrato";
import { ESCADA_JORNADA } from "../crm/jornada";

// Conta já cadastrada no seed de demonstração (ver contasBancarias em demo-db.ts).
const CONTA_DEMO = "cb-itau";

describe("demoProvider.importarExtrato — ponta a ponta", () => {
  it("reimportar o MESMO extrato grava 0 na segunda vez e conta certo as duplicadas", async () => {
    const extrato = [
      "Data;Descricao;Valor;Documento",
      "05/01/2026;Pix recebido Hotmart;500,00;DEMO-TEST-A1",
      "06/01/2026;Facebook Ads campanha;-150,00;DEMO-TEST-A2",
    ].join("\n");

    const primeiraLeitura = lerExtrato(extrato, "csv");
    const primeiraImportacao = await demoProvider.importarExtrato(
      primeiraLeitura.linhas,
      CONTA_DEMO,
      "csv"
    );
    expect(primeiraImportacao.gravadas).toBe(2);
    expect(primeiraImportacao.ignoradas).toBe(0);

    // dono reenvia o mesmo extrato — cenário normal (exportou de novo por
    // engano, ou reenviou um período que já tinha mandado antes).
    const segundaLeitura = lerExtrato(extrato, "csv");
    const segundaImportacao = await demoProvider.importarExtrato(
      segundaLeitura.linhas,
      CONTA_DEMO,
      "csv"
    );
    expect(segundaImportacao.gravadas).toBe(0);
    expect(segundaImportacao.ignoradas).toBe(2);
    expect(segundaImportacao.digitaisIgnoradas).toHaveLength(2);

    // o livro-razão de procedência registrou as duas linhas uma única vez.
    const importacoes = await demoProvider.listImportacoes();
    const digitaisDesteExtrato = importacoes.filter((i) =>
      ["DEMO-TEST-A1", "DEMO-TEST-A2"].includes(i.documento)
    );
    expect(digitaisDesteExtrato).toHaveLength(2);
  });

  it("grava no MovimentoCaixa a categoria que o dono escolheu, não uma fixa", async () => {
    const extrato = ["Data;Descricao;Valor;Documento", "10/01/2026;Compra qualquer;-80,00;DEMO-TEST-B1"].join(
      "\n"
    );
    const leitura = lerExtrato(extrato, "csv");

    // sem palavra-chave reconhecida, a sugestão automática cai em "outros" —
    // o dono reclassifica no passo de conferência, e é essa escolha (não a
    // sugestão, não um valor fixo) que precisa chegar no movimento gravado.
    expect(leitura.linhas[0].categoria).toBe("outros");
    const linhasConferidas = leitura.linhas.map((l) => ({ ...l, categoria: "saas_ferramentas" as const }));

    await demoProvider.importarExtrato(linhasConferidas, CONTA_DEMO, "csv");

    const movimentos = await demoProvider.listMovimentosCaixa();
    const gravado = movimentos.find((m) => m.descricao === "Compra qualquer");
    expect(gravado).toBeDefined();
    expect(gravado?.categoria).toBe("saas_ferramentas");
  });
});

// ============================================================
// Atendimento: a conversa de WhatsApp virando ficha do cliente.
//
// A garantia que mais importa aqui e a mesma de `importarExtrato`, por uma
// razao parecida: o agente local REENVIA o historico quando reconecta (o
// notebook do dono fica fechado por horas), entao a mesma mensagem chega de
// novo por desenho. Duas interacoes para a mesma mensagem inflariam a contagem
// de contatos e envenenariam a temperatura do lead.
// ============================================================

function mensagem(over: Partial<MensagemRecebida> = {}): MensagemRecebida {
  return {
    idExterno: "WA-TESTE-1",
    canal: "whatsapp",
    direcao: "recebida",
    telefone: "5514997770001",
    nomeExibicao: "Joana da Padaria",
    texto: "Bom dia, ainda tem vaga?",
    quando: "2026-03-01T13:45:00.000Z",
    tipoMidia: "",
    ...over,
  };
}

describe("demoProvider.registrarInteracoes", () => {
  it("numero desconhecido cria UM lead com origem whatsapp, e o reenvio nao duplica nada", async () => {
    const primeira = await db.registrarInteracoes([
      mensagem({ idExterno: "WA-A1" }),
      mensagem({ idExterno: "WA-A2", texto: "consigo pagar em duas vezes?" }),
    ]);
    expect(primeira.gravadas).toBe(2);
    expect(primeira.leadsCriados).toBe(1);

    const alunos = await db.listAlunos();
    const lead = alunos.find((a) => a.nome === "Joana da Padaria");
    expect(lead).toBeDefined();
    // Criacao automatica marcada como tal: sem isso o dono nao separa o que
    // ele cadastrou do que o sistema criou sozinho.
    expect(lead?.origem).toBe("whatsapp");
    expect(lead?.statusFunil).toBe("potencial");

    // o agente reconectou e mandou o mesmo lote de novo
    const segunda = await db.registrarInteracoes([
      mensagem({ idExterno: "WA-A1" }),
      mensagem({ idExterno: "WA-A2", texto: "consigo pagar em duas vezes?" }),
    ]);
    expect(segunda.gravadas).toBe(0);
    expect(segunda.ignoradas).toBe(2);
    expect(segunda.leadsCriados).toBe(0);

    const interacoes = await db.listInteracoes(lead!.id);
    expect(interacoes).toHaveLength(2);
  });

  it("numero ja cadastrado cai na ficha existente, mesmo escrito de outro jeito", async () => {
    const alunos = await db.listAlunos();
    const existente = alunos.find((a) => a.telefone !== "")!;
    // O cadastro do demo guarda o numero sem DDI; o WhatsApp entrega com "55".
    await db.registrarInteracoes([
      mensagem({ idExterno: "WA-B1", telefone: `55${existente.telefone}`, nomeExibicao: "Outro nome" }),
    ]);
    const interacoes = await db.listInteracoes(existente.id);
    expect(interacoes.some((i) => i.idExterno === "WA-B1")).toBe(true);
    // e o nome do cadastro nao foi sobrescrito pelo nome de exibicao do WhatsApp
    expect((await db.listAlunos()).find((a) => a.id === existente.id)?.nome).toBe(existente.nome);
  });

  it("mensagem de grupo e descartada e nunca vira interacao de ninguem", async () => {
    const antes = (await db.listInteracoes()).length;
    const r = await db.registrarInteracoes([
      mensagem({ idExterno: "WA-G1", telefone: "5514997770001-1600000000@g.us" }),
    ]);
    expect(r.gravadas).toBe(0);
    expect(r.descartadas).toBe(1);
    expect(r.leadsCriados).toBe(0);
    expect((await db.listInteracoes()).length).toBe(antes);
  });
});

describe("demoProvider — fila de envio", () => {
  it("so entrega o que uma pessoa aprovou, e a baixa tira da fila", async () => {
    const id = await db.aprovarEnvio({
      alunoId: "al-1",
      telefone: "5514997770002",
      texto: "Oi! Temos vaga sim.",
      autorizadoPor: "Tossi",
    });

    const fila = await db.listEnviosPendentes();
    const meu = fila.find((e) => e.id === id);
    expect(meu).toBeDefined();
    // Envio nunca e anonimo: quem autorizou viaja junto ate o agente local.
    expect(meu?.autorizadoPor).toBe("Tossi");

    expect(await db.registrarResultadoEnvio([{ id, enviado: true, idExterno: "WA-OUT-1" }])).toBe(1);
    expect((await db.listEnviosPendentes()).some((e) => e.id === id)).toBe(false);

    // Confirmacao repetida do agente nao reabre nem reescreve a linha.
    expect(await db.registrarResultadoEnvio([{ id, enviado: true, idExterno: "WA-OUT-1" }])).toBe(0);
  });
});

// A base de demonstração é o que o produto mostra quando não há Supabase
// configurado (`getDB()` cai em `demoProvider`, src/lib/data/index.ts). Ela
// tem de se comportar como um workspace JÁ MIGRADO pela 0014 — senão a regra
// da escada (`src/lib/crm/jornada.ts`) fica inalcançável justo no modo em que
// a maioria das pessoas vê o produto pela primeira vez.
describe("demoProvider.listEstagios — a escada da 0014 também vale na demo", () => {
  it("tem os sete degraus da escada canônica, alumni e prospect inclusive", async () => {
    const chaves = (await db.listEstagios()).map((e) => e.chave);

    // Sem `alumni` não existe transição proibida, e sem `prospect` não existe
    // o destino que a trava recusa: a regra inteira ficaria sem como acontecer.
    for (const degrau of ESCADA_JORNADA) expect(chaves).toContain(degrau);
  });

  it("continua com o `inativo` de fora da escada: a 0014 acrescenta degrau, não apaga estágio", async () => {
    const chaves = (await db.listEstagios()).map((e) => e.chave);

    expect(chaves).toContain("inativo");
  });

  it("nenhuma chave repetida — no banco quem garante isso é o índice único da 0014", async () => {
    const chaves = (await db.listEstagios()).map((e) => e.chave);

    expect(chaves).toHaveLength(new Set(chaves).size);
  });
});
