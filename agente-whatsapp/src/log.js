// O log que o dono vai ler quando alguma coisa parar.
//
// POR QUE O LOG PASSA POR UM FILTRO ANTES DE SAIR
// -----------------------------------------------
// O segredo do agente e a chave que escreve no CRM inteiro. Ele viaja em header
// a cada requisicao, e biblioteca de rede adora despejar a requisicao inteira
// dentro da mensagem de erro. Basta UMA vez: o log vai parar num print de
// WhatsApp mandado para o suporte, ou num arquivo dentro do iCloud. Por isso
// nada sai daqui sem passar pelo filtro — inclusive erro que veio de dentro de
// biblioteca de terceiro, que e justamente o que ninguem revisa.
//
// O LOG TAMBEM VAI PARA ARQUIVO
// -----------------------------
// Quando o agente sobe pelo launchd, no login, nao ha terminal aberto para ler
// nada. O arquivo e o unico jeito de descobrir, as 9h da manha, por que o
// WhatsApp caiu as 23h.

import { appendFile, mkdir, rename, stat } from "node:fs/promises";
import { dirname } from "node:path";

/** Teto do arquivo de log: 2 MB. Passou disso, vira `.1` e recomeça. Log que
 *  cresce sozinho no Mac de alguém é o mesmo que vazamento de disco. */
export const LIMITE_LOG_BYTES = 2 * 1024 * 1024;

/**
 * Tira do texto qualquer aparição do segredo.
 *
 * Segredo curto demais não é apagado de propósito: um valor de 3 caracteres
 * apareceria dentro de palavras comuns e transformaria o log em um borrão.
 * Segredo desse tamanho já é recusado na configuração, então o caso é só
 * defesa contra chamada com valor de teste.
 */
export function redigir(texto, segredo) {
  const t = typeof texto === "string" ? texto : String(texto ?? "");
  const s = typeof segredo === "string" ? segredo.trim() : "";
  if (s.length < 8) return t;
  return t.split(s).join("«segredo oculto»");
}

function agoraLegivel(data) {
  // Hora local, porque quem lê é o dono olhando para o relógio dele, e não um
  // sistema correlacionando eventos entre servidores.
  return data.toLocaleString("pt-BR");
}

export function criarLog({ segredo = "", arquivo = "", saida = console } = {}) {
  async function paraArquivo(linha) {
    if (!arquivo) return;
    try {
      await mkdir(dirname(arquivo), { recursive: true });
      try {
        const info = await stat(arquivo);
        if (info.size > LIMITE_LOG_BYTES) await rename(arquivo, `${arquivo}.1`);
      } catch {
        // Arquivo ainda não existe: é o caso normal da primeira linha.
      }
      await appendFile(arquivo, `${linha}\n`, "utf8");
    } catch {
      // Falha ao gravar log NUNCA derruba o agente: perder o registro do que
      // aconteceu é ruim; parar de capturar mensagem por causa disso é pior.
    }
  }

  function escrever(nivel, mensagem, extra) {
    const partes = [`[${agoraLegivel(new Date())}]`, nivel, redigir(mensagem, segredo)];
    if (extra !== undefined) {
      const cru = extra instanceof Error ? `${extra.message}` : JSON.stringify(extra);
      partes.push(redigir(cru, segredo));
    }
    const linha = partes.join(" ");
    if (nivel === "ERRO") saida.error(linha);
    else saida.log(linha);
    void paraArquivo(linha);
    return linha;
  }

  return {
    info: (m, e) => escrever("INFO", m, e),
    aviso: (m, e) => escrever("AVISO", m, e),
    erro: (m, e) => escrever("ERRO", m, e),
    redigir: (t) => redigir(t, segredo),
  };
}
