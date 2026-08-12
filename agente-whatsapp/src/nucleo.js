// O miolo: o que o agente faz, sem saber quem e o WhatsApp nem quem e a rede.
//
// POR QUE TUDO ENTRA POR PARAMETRO
// --------------------------------
// Aqui moram as decisoes que doem quando erram: quando tirar mensagem da fila,
// o que fazer com falha, quando parar de enviar. Nenhuma delas pode depender de
// ter um WhatsApp de verdade conectado para ser verificada — e conectar um
// WhatsApp de verdade e exatamente o que ninguem consegue fazer num teste. Com
// as dependencias entrando por parametro, o ciclo inteiro roda contra um
// servidor de mentira e um WhatsApp de mentira, e sobra so a biblioteca como
// parte nao testada.
//
// A ORDEM DAS OPERACOES E A PARTE QUE IMPORTA
// -------------------------------------------
// Item so sai da fila local DEPOIS que o servidor confirmou. O contrario —
// tirar antes e mandar — perde a mensagem exatamente no caso em que a rede cai,
// que e o caso que a fila existe para atender. O preco e o oposto: uma
// confirmacao perdida faz a mensagem subir duas vezes. Esse e o erro barato,
// porque o servidor deduplica por `idExterno`.

import { FalhaPermanente } from "./api.js";
import { loteParaContrato } from "./conversao.js";
import { gravarEstado, lerEstado } from "./estado.js";

/** Versão relatada no pulso; aparece na tela do CRM ao lado do "conectado". */
export const VERSAO_AGENTE = "1.0.0";

/** Chave de deduplicação de mensagem na fila local. `idExterno` sozinho não
 *  serve: o WhatsApp reaproveita id entre a cópia recebida e a enviada em
 *  conversa consigo mesmo, e as duas direções são interações diferentes. */
export function chaveMensagem(m) {
  return `${m?.idExterno ?? ""}|${m?.direcao ?? ""}`;
}

export function chaveResultado(r) {
  return String(r?.id ?? "");
}

export function criarNucleo({
  api,
  whatsapp,
  filaMensagens,
  filaResultados,
  limitador,
  config,
  log,
  relogio = () => Date.now(),
}) {
  let estadoSalvo = {};

  async function persistirEstado(campos = {}) {
    estadoSalvo = {
      ...estadoSalvo,
      ...campos,
      enviosRecentes: limitador.paraGuardar(relogio()),
    };
    try {
      await gravarEstado(config.arquivoEstado, estadoSalvo);
    } catch (erro) {
      // Perder a memória entre execuções custa histórico repetido, e o servidor
      // deduplica. Não vale derrubar o agente por causa disso.
      log.aviso("Não consegui gravar o estado em disco.", erro);
    }
  }

  return {
    /** Recupera do disco o que a execução anterior deixou. */
    async iniciar() {
      estadoSalvo = await lerEstado(config.arquivoEstado);
      limitador.restaurar(estadoSalvo.enviosRecentes, relogio());
      await filaMensagens.carregar();
      await filaResultados.carregar();
      return estadoSalvo;
    },

    get estado() {
      return estadoSalvo;
    },

    /**
     * Converte mensagens da biblioteca e guarda na fila local.
     *
     * A gravação em disco vem ANTES de qualquer tentativa de rede, e é o ponto
     * exato em que a promessa "nunca perde mensagem" é cumprida: a partir daqui
     * a mensagem existe fora da memória deste processo.
     */
    async capturar(brutas, resolverNome) {
      const { mensagens, descartadas } = loteParaContrato(brutas, resolverNome);
      if (descartadas > 0) {
        // Descarte é normal (grupo, status, canal), mas silencioso demais ele
        // vira "sumiu mensagem" na boca do dono e ninguém sabe responder.
        log.info(`Ignorei ${descartadas} mensagem(ns) que não pertencem a um cliente.`);
      }
      if (mensagens.length === 0) return { guardadas: 0, descartadas };

      const { entraram, descartados } = await filaMensagens.adicionar(mensagens);
      if (descartados > 0) {
        log.aviso(
          `A fila local estourou o limite e ${descartados} mensagem(ns) antiga(s) foram descartadas. Confira se o servidor está respondendo.`
        );
      }
      return { guardadas: entraram, descartadas };
    },

    /**
     * Sobe o que está na fila local, um lote por vez.
     *
     * Um lote por chamada (e não a fila inteira em rajada) porque com o
     * histórico de uma semana parado a fila pode ter milhares de itens, e um
     * corpo desse tamanho estoura o limite da Vercel — falhando tudo de uma vez,
     * para sempre, sem nunca progredir.
     */
    async subirMensagens() {
      const lote = filaMensagens.espiar(config.tamanhoDoLote);
      if (lote.length === 0) return { subiram: 0, restam: 0 };

      try {
        const r = await api.enviarMensagens(lote);
        await filaMensagens.remover(lote);
        log.info(
          `Subi ${lote.length} mensagem(ns). O servidor gravou ${r?.gravadas ?? "?"}, já conhecia ${r?.ignoradas ?? "?"}.`
        );
        return { subiram: lote.length, restam: filaMensagens.tamanho, resposta: r };
      } catch (erro) {
        if (erro instanceof FalhaPermanente) {
          // Lote que o servidor nunca vai aceitar fica para sempre na frente
          // da fila e trava tudo que está atrás. Some com ele, mas deixa
          // registrado — é a única situação em que este programa perde
          // mensagem de propósito.
          await filaMensagens.remover(lote);
          log.erro(
            `O servidor recusou ${lote.length} mensagem(ns) e elas foram descartadas para não travar a fila.`,
            erro
          );
          return { subiram: 0, restam: filaMensagens.tamanho, descartadas: lote.length };
        }
        throw erro;
      }
    },

    /**
     * Envia o que uma PESSOA aprovou no CRM, no ritmo permitido.
     *
     * O que não couber no ritmo desta rodada simplesmente não é enviado e nem é
     * reportado: sem baixa, o servidor devolve o mesmo item na próxima rodada.
     * É a fila do servidor servindo de memória, em vez de este programa manter
     * uma segunda fila de saída que poderia divergir dela.
     */
    async processarEnvios() {
      if (!whatsapp.estaPronto()) return { enviados: 0, motivo: "sessao-fechada" };

      const pendentes = await api.lerFila();
      if (pendentes.length === 0) return { enviados: 0 };

      /**
       * O que já saiu mas ainda não teve baixa confirmada.
       *
       * Este conjunto é a proteção contra o pior erro possível deste programa:
       * a mensagem sair, a rede cair antes de reportar, e o servidor devolver o
       * MESMO envio na rodada seguinte — o cliente recebendo duas vezes a mesma
       * mensagem do dono. Enquanto o resultado estiver esperando aqui, o envio
       * não é repetido.
       */
      const aguardandoBaixa = new Set(
        filaResultados.espiar(Number.MAX_SAFE_INTEGER).map((r) => String(r?.id ?? ""))
      );

      const resultados = [];
      let enviados = 0;

      for (const pendente of pendentes) {
        const id = String(pendente?.id ?? "").trim();
        if (id === "") continue; // sem id não há linha para baixar depois
        if (aguardandoBaixa.has(id)) continue;

        const telefone = String(pendente?.telefone ?? "").trim();
        const texto = String(pendente?.texto ?? "");
        if (telefone === "" || texto.trim() === "") {
          // Reportado como falha, e não ignorado: item inválido ignorado volta
          // na próxima rodada e volta para sempre.
          resultados.push({ id, enviado: false, erro: "Telefone ou texto vazio." });
          continue;
        }

        if (!limitador.podeEnviar(relogio())) {
          // Para aqui de propósito, sem reportar nada: o resto volta na próxima
          // rodada. Este `break` é o freio que protege o número do dono.
          break;
        }

        try {
          const { idExterno } = await whatsapp.enviarTexto(telefone, texto);
          // O limitador conta a TENTATIVA, não o sucesso: o que faz o WhatsApp
          // desconfiar é o número tentar falar muito, mesmo quando falha.
          limitador.registrar(relogio());
          resultados.push({ id, enviado: true, idExterno: String(idExterno ?? "") });
          enviados += 1;
        } catch (erro) {
          limitador.registrar(relogio());
          resultados.push({
            id,
            enviado: false,
            erro: log.redigir(erro instanceof Error ? erro.message : "Falha ao enviar.").slice(0, 500),
          });
        }
      }

      if (resultados.length > 0) {
        // Grava a baixa em disco ANTES de tentar reportar: se a rede cair entre
        // o envio e o report, o resultado sobrevive e o dono não corre o risco
        // de a mesma mensagem sair duas vezes para o cliente dele.
        await filaResultados.adicionar(resultados);
        await persistirEstado();
      }

      return { enviados, tentados: resultados.length };
    },

    /** Reporta ao servidor o que já foi enviado, dando baixa na fila dele. */
    async subirResultados() {
      const lote = filaResultados.espiar(config.tamanhoDoLote);
      if (lote.length === 0) return { reportados: 0 };

      try {
        const r = await api.reportarResultados(lote);
        await filaResultados.remover(lote);
        return { reportados: lote.length, resposta: r };
      } catch (erro) {
        if (erro instanceof FalhaPermanente) {
          await filaResultados.remover(lote);
          log.erro(`O servidor recusou ${lote.length} resultado(s) de envio.`, erro);
          return { reportados: 0, descartados: lote.length };
        }
        throw erro;
      }
    },

    /**
     * O sinal de vida. É o que permite a tela do CRM dizer a verdade: neste
     * desenho o WhatsApp só funciona com o notebook aberto, e uma tela que
     * finge conexão faz o dono aprovar mensagens que ficam paradas.
     */
    async baterPulso() {
      // O QR só viaja quando existe um DE VERDADE esperando leitura. Mandar
      // string velha faria a tela do CRM desenhar um código que o WhatsApp já
      // trocou, e a pessoa apontaria o celular para nada.
      const qr = typeof whatsapp.qrAtual === "function" ? whatsapp.qrAtual() : null;
      const pulso = {
        visto: new Date(relogio()).toISOString(),
        sessaoAberta: whatsapp.estaPronto() === true,
        precisaQr: whatsapp.precisaQr() === true,
        versao: VERSAO_AGENTE,
        ...(qr ? { qr } : {}),
      };
      await api.baterPulso(pulso);
      return pulso;
    },

    /** Marca até onde o histórico já foi varrido, para a próxima reconexão não
     *  repetir a semana inteira. */
    async marcarVarredura(instante = relogio()) {
      await persistirEstado({ ultimaVarredura: new Date(instante).toISOString() });
    },
  };
}
