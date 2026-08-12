// O agente do WhatsApp do Raro.ia — ponto de entrada.
//
// O QUE ESTE PROGRAMA E, EM UMA FRASE
// -----------------------------------
// Um braco mecanico que roda no MacBook do dono: escuta o WhatsApp dele, manda
// as conversas para o CRM e envia de volta apenas o que uma PESSOA aprovou lá.
//
// POR QUE ELE NAO PRECISA DE SERVIDOR
// -----------------------------------
// Todo contato com o CRM parte daqui: subir mensagem, perguntar a fila, dar
// baixa, bater pulso. Nada nunca entra na maquina do dono, entao nao existe
// tunel, porta aberta nem IP fixo para manter. O preco combinado e explicito: o
// WhatsApp so funciona com o notebook aberto — e o pulso existe justamente para
// a tela do CRM contar essa verdade em vez de fingir conexao.
//
// POR QUE O ARQUIVO DE ENTRADA SO MONTA E LIGA
// --------------------------------------------
// Nada de regra aqui. Este arquivo escolhe as implementacoes de verdade (rede
// de verdade, WhatsApp de verdade, disco de verdade) e as entrega ao nucleo. E
// o que permite os testes entregarem outras implementacoes ao MESMO nucleo.

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { criarApi } from "./src/api.js";
import { Recuo } from "./src/backoff.js";
import { lerEnv, montarConfig } from "./src/config.js";
import { inicioDaVarredura } from "./src/estado.js";
import { FilaLocal } from "./src/fila-local.js";
import { criarLog } from "./src/log.js";
import { chaveMensagem, chaveResultado, criarNucleo, VERSAO_AGENTE } from "./src/nucleo.js";
import { LimitadorDeRitmo } from "./src/ritmo.js";
import { criarWhatsapp } from "./src/whatsapp.js";

const AQUI = dirname(fileURLToPath(import.meta.url));

async function lerArquivoEnv() {
  try {
    return lerEnv(await readFile(join(AQUI, ".env"), "utf8"));
  } catch {
    // Sem `.env` ainda dá para rodar com variáveis do ambiente — é como o
    // launchd pode ser configurado um dia, sem arquivo nenhum.
    return {};
  }
}

/**
 * Um laço que se reagenda sozinho.
 *
 * Reagendar depois de terminar (e não `setInterval`) porque uma rodada lenta —
 * subir mil mensagens atrasadas com internet ruim — encavalaria com a próxima e
 * as duas mandariam o mesmo lote ao mesmo tempo.
 */
/**
 * `intervaloMs` pode ser um NÚMERO ou uma FUNÇÃO.
 *
 * A função existe por causa do QR: parado, o pulso de minuto em minuto basta
 * para a tela dizer se o WhatsApp está de pé. Enquanto há um QR esperando
 * leitura, não basta — o WhatsApp troca o código a cada vinte e poucos
 * segundos, e um código vencido desenhado no CRM faz a pessoa apontar o
 * celular, nada acontecer, e concluir que o sistema está quebrado.
 */
/** Cadência do pulso enquanto há QR na tela. Três segundos é abaixo da troca
 *  do WhatsApp (uns 20s) com folga, e é uma requisição minúscula que só
 *  acontece nos poucos minutos de uma conexão. */
const SEGUNDOS_ENTRE_PULSOS_COM_QR = 3;

function laco({ nome, intervaloMs, tarefa, log }) {
  const recuo = new Recuo();
  let vivo = true;
  const proximoIntervalo = () =>
    typeof intervaloMs === "function" ? Math.max(1000, Number(intervaloMs()) || 0) : intervaloMs;

  async function rodada() {
    if (!vivo) return;
    let espera = proximoIntervalo();
    try {
      await tarefa();
      recuo.zerar();
    } catch (erro) {
      espera = recuo.falhou();
      // Log de falha em um nível só (aviso) mesmo repetindo: o dono não precisa
      // de um alarme vermelho por cada piscada de wi-fi. O `erro` mesmo fica
      // reservado para o que ele tem que consertar (segredo, URL).
      if (erro?.configuracao === true) log.erro(`[${nome}] ${erro.message}`);
      else log.aviso(`[${nome}] ${erro instanceof Error ? erro.message : "falhou"}. Tento de novo em ${Math.round(espera / 1000)}s.`);
    }
    // O timer NÃO é `unref`: são estes laços que mantêm o processo vivo. Com
    // eles soltos, um tropeço na subida do WhatsApp faria o programa terminar
    // em silêncio — e o launchd o traria de volta para terminar de novo.
    if (vivo) setTimeout(rodada, espera);
  }

  return {
    comecar: () => setTimeout(rodada, 0),
    parar: () => {
      vivo = false;
    },
  };
}

async function principal() {
  const vars = { ...(await lerArquivoEnv()), ...process.env };
  const { erros, config } = montarConfig(vars, { versao: VERSAO_AGENTE });

  if (erros.length > 0) {
    // Sai com a lista inteira, e não com o primeiro problema: fazer o dono
    // descobrir um erro por execução é o jeito mais lento de configurar duas
    // linhas de arquivo.
    console.error("Não consigo subir com esta configuração:\n");
    for (const e of erros) console.error(`  · ${e}`);
    console.error("\nAbra o arquivo .env desta pasta e corrija. O LEIA-ME.md explica cada campo.");
    process.exit(1);
  }

  const log = criarLog({ segredo: config.segredo, arquivo: config.arquivoLog });
  log.info(`Agente ${VERSAO_AGENTE} subindo. Dados em ${config.pastaDados}`);

  const api = criarApi({ baseUrl: config.baseUrl, segredo: config.segredo });

  const filaMensagens = new FilaLocal({
    caminho: config.arquivoMensagens,
    chaveDe: chaveMensagem,
  });
  const filaResultados = new FilaLocal({
    caminho: config.arquivoResultados,
    chaveDe: chaveResultado,
  });

  const limitador = new LimitadorDeRitmo();

  let nucleo;

  const whatsapp = criarWhatsapp({
    config,
    log,
    aoCapturar: async (brutas) => {
      await nucleo.capturar(brutas, (m) => m?._nomeExibicao ?? "");
    },
    aoConectar: async () => {
      // A varredura acontece no `ready`, e não no início do programa: antes de
      // conectar não há histórico nenhum para ler.
      const desde = inicioDaVarredura(nucleo.estado, Date.now(), config.diasHistorico);
      log.info(`Varrendo o histórico desde ${new Date(desde).toLocaleString("pt-BR")}.`);
      const r = await whatsapp.varrerHistorico(desde);
      log.info(`Histórico: ${r.mensagens} mensagem(ns) em ${r.conversas} conversa(s).`);
      // A marca só é gravada DEPOIS da varredura: gravar antes e falhar no meio
      // deixaria um buraco no histórico que ninguém mais varreria.
      await nucleo.marcarVarredura();
    },
  });

  nucleo = criarNucleo({ api, whatsapp, filaMensagens, filaResultados, limitador, config, log });
  await nucleo.iniciar();

  const lacos = [
    laco({
      nome: "subir mensagens",
      intervaloMs: config.segundosEntreLotes * 1000,
      tarefa: () => nucleo.subirMensagens(),
      log,
    }),
    laco({
      nome: "fila de envio",
      intervaloMs: config.segundosEntreFila * 1000,
      // Enviar e reportar na MESMA rodada, nesta ordem: a baixa é o que impede
      // o servidor de devolver o mesmo envio na rodada seguinte e a mensagem
      // sair duas vezes para o cliente.
      tarefa: async () => {
        await nucleo.processarEnvios();
        await nucleo.subirResultados();
      },
      log,
    }),
    laco({
      nome: "pulso",
      // Esperando QR, bate muito mais rápido: é o único jeito de o código
      // desenhado na tela do CRM acompanhar a troca que o WhatsApp faz sozinho.
      intervaloMs: () =>
        whatsapp.precisaQr() ? SEGUNDOS_ENTRE_PULSOS_COM_QR * 1000 : config.segundosEntrePulsos * 1000,
      // O pulso já roda de minuto em minuto e já é a tarefa que existe para
      // dizer a verdade sobre a conexão. Vigiar aqui não custa laço novo, e
      // garante que "ligado" na tela do CRM signifique a mesma coisa que
      // "ligado" no WhatsApp de verdade.
      tarefa: async () => {
        await whatsapp.vigiar();
        await nucleo.baterPulso();
      },
      log,
    }),
  ];

  for (const l of lacos) l.comecar();

  async function encerrar(sinal) {
    log.info(`Recebi ${sinal}. Encerrando.`);
    for (const l of lacos) l.parar();
    await whatsapp.parar();
    process.exit(0);
  }

  process.on("SIGINT", () => void encerrar("SIGINT"));
  process.on("SIGTERM", () => void encerrar("SIGTERM"));

  // Erro solto derruba o processo em silêncio. Registrar antes de morrer é o
  // que dá ao dono alguma chance de entender o que houve às 23h.
  process.on("unhandledRejection", (motivo) => log.erro("Falha não tratada.", motivo));

  await whatsapp.iniciar();
}

principal().catch((erro) => {
  console.error("O agente não conseguiu subir:", erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
