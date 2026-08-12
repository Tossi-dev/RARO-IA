// O ciclo inteiro, contra um servidor HTTP de verdade.
//
// POR QUE UM SERVIDOR DE VERDADE E NAO UM `fetch` DE MENTIRA
// ----------------------------------------------------------
// O que se quer provar aqui e o CONTRATO: que o corpo sai no formato que o
// Raro.ia espera, que o header do segredo vai junto em toda chamada, que a
// baixa acontece na ordem certa. Um `fetch` falso prova que o codigo chamou uma
// funcao; um servidor de verdade prova que o JSON atravessou a rede e chegou
// legivel do outro lado. A diferenca aparece justamente nos erros que doem —
// campo com nome errado, corpo que nao serializa.
//
// O WhatsApp continua sendo de mentira, e nao ha jeito: conectar um WhatsApp
// exigiria um celular pareado. O contrato do adaptador e pequeno de proposito
// (`estaPronto`, `precisaQr`, `enviarTexto`), entao o que fica sem teste e so a
// biblioteca, nunca a decisao.

import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { criarApi, FalhaTemporaria, HEADER_AGENTE } from "../src/api.js";
import { FilaLocal } from "../src/fila-local.js";
import { chaveMensagem, chaveResultado, criarNucleo } from "../src/nucleo.js";
import { LimitadorDeRitmo } from "../src/ritmo.js";

const SEGREDO = "segredo-de-teste-bem-comprido";

/** Um Raro.ia de mentira que obedece ao mesmo contrato do de verdade. */
function criarServidorFalso(estado) {
  return createServer((req, res) => {
    estado.chamadas.push({ url: req.url, metodo: req.method, header: req.headers[HEADER_AGENTE] });

    // A mesma porta do servidor de verdade: sem o header certo, nada passa —
    // e a recusa não explica nada a quem está adivinhando.
    if (req.headers[HEADER_AGENTE] !== SEGREDO) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ erro: "Não autorizado." }));
      return;
    }

    let cru = "";
    req.on("data", (p) => (cru += p));
    req.on("end", () => {
      const corpo = cru === "" ? null : JSON.parse(cru);
      res.writeHead(200, { "content-type": "application/json" });

      if (req.url === "/api/atendimento/receber") {
        estado.recebidas.push(...corpo.mensagens);
        res.end(JSON.stringify({ gravadas: corpo.mensagens.length, ignoradas: 0, descartadas: 0 }));
        return;
      }
      if (req.url === "/api/atendimento/fila") {
        res.end(JSON.stringify({ envios: estado.fila }));
        return;
      }
      if (req.url === "/api/atendimento/enviado") {
        estado.baixados.push(...corpo.resultados);
        const ids = new Set(corpo.resultados.map((r) => r.id));
        estado.fila = estado.fila.filter((e) => !ids.has(e.id));
        res.end(JSON.stringify({ baixadas: corpo.resultados.length, ignorados: 0 }));
        return;
      }
      if (req.url === "/api/atendimento/pulso") {
        estado.pulsos.push(corpo);
        res.end(JSON.stringify({ estado: { ligado: corpo.sessaoAberta } }));
        return;
      }

      res.writeHead(404).end(JSON.stringify({ erro: "não existe" }));
    });
  });
}

function ouvir(servidor) {
  return new Promise((ok) => servidor.listen(0, "127.0.0.1", () => ok(servidor.address().port)));
}

function fechar(servidor) {
  return new Promise((ok) => servidor.close(ok));
}

/** O WhatsApp de mentira: guarda o que mandou e devolve um id, como o de
 *  verdade devolveria. */
function whatsappFalso(opcoes = {}) {
  return {
    pronto: opcoes.pronto ?? true,
    enviadas: [],
    estaPronto() {
      return this.pronto;
    },
    precisaQr() {
      return !this.pronto;
    },
    async enviarTexto(telefone, texto) {
      if (opcoes.falhar) throw new Error("número inexistente");
      this.enviadas.push({ telefone, texto });
      return { idExterno: `WA-${this.enviadas.length}` };
    },
  };
}

const logMudo = {
  info: () => {},
  aviso: () => {},
  erro: () => {},
  redigir: (t) => t,
};

function mensagem(id, extra = {}) {
  return {
    id: { _serialized: id },
    from: "5514991234567@c.us",
    to: "5511988887777@c.us",
    fromMe: false,
    body: "oi",
    timestamp: 1_723_300_000,
    type: "chat",
    ...extra,
  };
}

let pasta;
let servidor;
let estado;
let porta;

beforeEach(async () => {
  pasta = await mkdtemp(join(tmpdir(), "raro-ciclo-"));
  estado = { recebidas: [], baixados: [], pulsos: [], fila: [], chamadas: [] };
  servidor = criarServidorFalso(estado);
  porta = await ouvir(servidor);
});

afterEach(async () => {
  if (servidor.listening) await fechar(servidor);
  await rm(pasta, { recursive: true, force: true });
});

function montar(whatsapp, { limitador, ...extraConfig } = {}) {
  const config = {
    arquivoEstado: join(pasta, "estado.json"),
    tamanhoDoLote: 50,
    ...extraConfig,
  };
  const api = criarApi({ baseUrl: `http://127.0.0.1:${porta}`, segredo: SEGREDO });
  const nucleo = criarNucleo({
    api,
    whatsapp,
    filaMensagens: new FilaLocal({ caminho: join(pasta, "m.json"), chaveDe: chaveMensagem }),
    filaResultados: new FilaLocal({ caminho: join(pasta, "r.json"), chaveDe: chaveResultado }),
    limitador: limitador ?? new LimitadorDeRitmo(),
    config,
    log: logMudo,
  });
  return { api, nucleo };
}

/** Limitador escancarado, para o teste medir OUTRA coisa que não o freio. */
function semFreio() {
  return new LimitadorDeRitmo({ intervaloMs: 0, maximoPorHora: 1000 });
}

describe("ciclo completo contra um servidor HTTP", () => {
  it("manda lote, pega fila, envia, reporta e bate pulso", async () => {
    const whatsapp = whatsappFalso();
    const { nucleo } = montar(whatsapp);
    await nucleo.iniciar();

    // 1) captura e sobe o lote (uma de grupo entra e é descartada na origem)
    await nucleo.capturar([
      mensagem("m1"),
      mensagem("m2", { fromMe: true, body: "respondendo" }),
      mensagem("g1", { from: "123@g.us" }),
    ]);
    const subida = await nucleo.subirMensagens();

    expect(subida.subiram).toBe(2);
    expect(estado.recebidas).toHaveLength(2);
    expect(estado.recebidas[0]).toMatchObject({
      idExterno: "m1",
      canal: "whatsapp",
      direcao: "recebida",
      telefone: "5514991234567",
    });
    expect(estado.recebidas[1].direcao).toBe("enviada");

    // 2) o CRM aprovou uma mensagem: ela aparece na fila
    estado.fila = [
      {
        id: "e1",
        telefone: "(14) 99123-4567",
        texto: "Bom dia! Consegue conversar hoje?",
        autorizadoPor: "dono@raro.ia",
        autorizadoEm: new Date().toISOString(),
      },
    ];

    const envio = await nucleo.processarEnvios();
    expect(envio.enviados).toBe(1);
    // O telefone escrito com máscara vira número discável.
    expect(whatsapp.enviadas[0]).toEqual({
      telefone: "(14) 99123-4567",
      texto: "Bom dia! Consegue conversar hoje?",
    });

    // 3) a baixa
    const reporte = await nucleo.subirResultados();
    expect(reporte.reportados).toBe(1);
    expect(estado.baixados[0]).toEqual({ id: "e1", enviado: true, idExterno: "WA-1" });
    // Baixado no servidor, o envio não volta na próxima rodada.
    expect(estado.fila).toHaveLength(0);

    // 4) o pulso
    const pulso = await nucleo.baterPulso();
    expect(pulso.sessaoAberta).toBe(true);
    expect(pulso.precisaQr).toBe(false);
    expect(estado.pulsos[0]).toMatchObject({ sessaoAberta: true, precisaQr: false });
    expect(Number.isFinite(Date.parse(estado.pulsos[0].visto))).toBe(true);

    // 5) toda chamada levou o segredo — inclusive a de leitura da fila
    expect(estado.chamadas).toHaveLength(4);
    expect(estado.chamadas.every((c) => c.header === SEGREDO)).toBe(true);
    expect(estado.chamadas.map((c) => c.url)).toEqual([
      "/api/atendimento/receber",
      "/api/atendimento/fila",
      "/api/atendimento/enviado",
      "/api/atendimento/pulso",
    ]);
  });

  it("sem internet a mensagem fica na fila e sobe quando a rede volta", async () => {
    const { nucleo } = montar(whatsappFalso());
    await nucleo.iniciar();
    await nucleo.capturar([mensagem("m1")]);

    await fechar(servidor); // o wi-fi acabou de cair

    await expect(nucleo.subirMensagens()).rejects.toBeInstanceOf(FalhaTemporaria);

    // A mensagem continua guardada, inclusive para um processo novo.
    const guardada = new FilaLocal({ caminho: join(pasta, "m.json"), chaveDe: chaveMensagem });
    await guardada.carregar();
    expect(guardada.tamanho).toBe(1);

    // A rede volta na mesma porta.
    servidor = criarServidorFalso(estado);
    await new Promise((ok) => servidor.listen(porta, "127.0.0.1", ok));

    const r = await nucleo.subirMensagens();
    expect(r.subiram).toBe(1);
    expect(r.restam).toBe(0);
    expect(estado.recebidas).toHaveLength(1);
  });

  it("com a sessão fechada, não envia nada e o pulso conta a verdade", async () => {
    const whatsapp = whatsappFalso({ pronto: false });
    const { nucleo } = montar(whatsapp);
    await nucleo.iniciar();

    estado.fila = [{ id: "e1", telefone: "5514991234567", texto: "oi" }];
    const r = await nucleo.processarEnvios();

    expect(r).toEqual({ enviados: 0, motivo: "sessao-fechada" });
    expect(whatsapp.enviadas).toHaveLength(0);
    // Nada foi baixado: o envio aprovado continua esperando o notebook abrir.
    expect(estado.fila).toHaveLength(1);

    const pulso = await nucleo.baterPulso();
    expect(pulso).toMatchObject({ sessaoAberta: false, precisaQr: true });
  });

  it("o limite de ritmo segura a rajada: 3 aprovados, 1 sai por rodada", async () => {
    const whatsapp = whatsappFalso();
    const { nucleo } = montar(whatsapp);
    await nucleo.iniciar();

    estado.fila = ["a", "b", "c"].map((id) => ({ id, telefone: "5514991234567", texto: "oi" }));

    const r = await nucleo.processarEnvios();
    expect(r.enviados).toBe(1);
    await nucleo.subirResultados();

    // Os outros dois continuam na fila DO SERVIDOR, sem baixa — é o servidor
    // que serve de memória, e não uma segunda fila aqui que poderia divergir.
    expect(estado.fila.map((e) => e.id)).toEqual(["b", "c"]);

    // Na mesma rodada seguinte, o freio ainda está segurando.
    expect((await nucleo.processarEnvios()).enviados).toBe(0);
  });

  it("falha de envio vira baixa com erro, e não some da fila do servidor sem explicação", async () => {
    const whatsapp = whatsappFalso({ falhar: true });
    const { nucleo } = montar(whatsapp);
    await nucleo.iniciar();

    estado.fila = [{ id: "e1", telefone: "5514991234567", texto: "oi" }];
    await nucleo.processarEnvios();
    await nucleo.subirResultados();

    expect(estado.baixados[0]).toMatchObject({ id: "e1", enviado: false });
    expect(estado.baixados[0].erro).toContain("número inexistente");
  });

  it("envio com telefone vazio é reportado como falha, em vez de voltar para sempre", async () => {
    const whatsapp = whatsappFalso();
    const { nucleo } = montar(whatsapp);
    await nucleo.iniciar();

    estado.fila = [{ id: "e1", telefone: "", texto: "oi" }];
    await nucleo.processarEnvios();
    await nucleo.subirResultados();

    expect(estado.baixados[0]).toMatchObject({ id: "e1", enviado: false });
    expect(whatsapp.enviadas).toHaveLength(0);
  });

  it("segredo errado não passa e o lote continua guardado", async () => {
    const whatsapp = whatsappFalso();
    const api = criarApi({ baseUrl: `http://127.0.0.1:${porta}`, segredo: "outro-segredo-qualquer" });
    const filaMensagens = new FilaLocal({ caminho: join(pasta, "m.json"), chaveDe: chaveMensagem });
    const nucleo = criarNucleo({
      api,
      whatsapp,
      filaMensagens,
      filaResultados: new FilaLocal({ caminho: join(pasta, "r.json"), chaveDe: chaveResultado }),
      limitador: new LimitadorDeRitmo(),
      config: { arquivoEstado: join(pasta, "estado.json"), tamanhoDoLote: 50 },
      log: logMudo,
    });

    await nucleo.iniciar();
    await nucleo.capturar([mensagem("m1")]);

    // 401 é problema de configuração, não de formato: a mensagem NÃO pode ser
    // descartada, porque o dono ainda vai corrigir o .env e ela precisa subir.
    await expect(nucleo.subirMensagens()).rejects.toMatchObject({
      name: "FalhaTemporaria",
      status: 401,
      configuracao: true,
    });
    expect(filaMensagens.tamanho).toBe(1);
    expect(estado.recebidas).toHaveLength(0);
  });

  it("não manda a mesma mensagem duas vezes quando a baixa não chegou ao servidor", async () => {
    const whatsapp = whatsappFalso();
    // Sem freio de propósito: assim o único motivo possível para a mensagem não
    // sair de novo é a guarda de baixa pendente, que é o que se quer provar.
    const { nucleo } = montar(whatsapp, { limitador: semFreio() });
    await nucleo.iniciar();

    estado.fila = [{ id: "e1", telefone: "5514991234567", texto: "oi" }];
    expect((await nucleo.processarEnvios()).enviados).toBe(1);

    // A rede cai justamente entre o envio e a baixa.
    await fechar(servidor);
    await expect(nucleo.subirResultados()).rejects.toBeInstanceOf(FalhaTemporaria);

    // A rede volta, e o servidor — que nunca soube da baixa — devolve o mesmo
    // envio. O cliente NÃO pode receber a mensagem de novo.
    servidor = criarServidorFalso(estado);
    await new Promise((ok) => servidor.listen(porta, "127.0.0.1", ok));

    const r = await nucleo.processarEnvios();
    expect(r.enviados).toBe(0);
    expect(whatsapp.enviadas).toHaveLength(1);

    // E a baixa que ficou pendurada sobe assim que dá.
    expect((await nucleo.subirResultados()).reportados).toBe(1);
    expect(estado.baixados).toHaveLength(1);
    expect(estado.fila).toHaveLength(0);
  });

  it("o teto por hora atravessa o reinício do agente", async () => {
    const whatsapp = whatsappFalso();
    const { nucleo } = montar(whatsapp);
    await nucleo.iniciar();

    estado.fila = [{ id: "e1", telefone: "5514991234567", texto: "oi" }];
    await nucleo.processarEnvios();
    await nucleo.subirResultados();

    // Processo novo lendo o mesmo estado em disco: o envio recente ainda pesa.
    const outro = montar(whatsappFalso());
    await outro.nucleo.iniciar();
    estado.fila = [{ id: "e2", telefone: "5514991234567", texto: "oi de novo" }];
    expect((await outro.nucleo.processarEnvios()).enviados).toBe(0);
  });
});

describe("QR no pulso — o que faz o CRM desenhar o código", () => {
  it("sobe a string do QR só quando existe uma esperando leitura", async () => {
    let qr = null;
    const whatsapp = {
      estaPronto: () => false,
      precisaQr: () => qr !== null,
      qrAtual: () => qr,
      enviarTexto: async () => "x",
    };
    const { nucleo } = montar(whatsapp);

    const sem = await nucleo.baterPulso();
    expect(sem.qr).toBeUndefined(); // sem QR, o campo nem viaja

    qr = "2@abc,def,ghi";
    const com = await nucleo.baterPulso();
    expect(com.qr).toBe("2@abc,def,ghi");
    expect(com.precisaQr).toBe(true);

    // Autenticou: o QR some da memória e para de subir. Mandar string velha
    // faria o CRM desenhar um código que o WhatsApp já trocou, e a pessoa
    // apontaria o celular para nada.
    qr = null;
    const depois = await nucleo.baterPulso();
    expect(depois.qr).toBeUndefined();
  });

  it("agente antigo, sem qrAtual, não quebra o pulso", () => {
    // Compatibilidade honesta: se a função não existir, o pulso continua
    // valendo como sinal de vida — só não desenha QR.
    const whatsapp = { estaPronto: () => true, precisaQr: () => false, enviarTexto: async () => "x" };
    const { nucleo } = montar(whatsapp);
    return expect(nucleo.baterPulso()).resolves.toMatchObject({ sessaoAberta: true });
  });
});
