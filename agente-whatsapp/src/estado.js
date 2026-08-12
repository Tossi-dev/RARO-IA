// O pouco que o agente precisa lembrar entre uma execucao e a proxima.
//
// POR QUE GUARDAR ATE ONDE JA VARREU
// ----------------------------------
// Toda reconexao o agente olha o historico recente, porque enquanto o notebook
// estava fechado o cliente continuou mandando mensagem. Sem memoria, "recente"
// seria sempre os ultimos 7 dias — e o dono que abre o notebook cinco vezes por
// dia mandaria a mesma semana de conversa cinco vezes por dia. O servidor
// deduplica e nada quebraria, mas seria trafego, bateria e tempo de funcao na
// Vercel gastos para nao dizer nada de novo.
//
// POR QUE GUARDAR OS ENVIOS RECENTES
// ----------------------------------
// O teto por hora precisa atravessar o reinicio. Se ele zerasse ao subir, o
// jeito mais facil de furar o limite seria fechar e abrir a tampa — que e o que
// acontece o dia inteiro nesta maquina.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/** Margem de segurança na retomada, em minutos.
 *
 *  O relógio do Mac e o do WhatsApp não são o mesmo relógio, e mensagem que
 *  chega durante o desligamento pode ficar datada logo antes do último ponto
 *  varrido. Voltar alguns minutos custa algumas mensagens repetidas, que o
 *  servidor descarta pelo `idExterno`; não voltar custa mensagem perdida, que
 *  ninguém recupera. */
export const MARGEM_RETOMADA_MIN = 10;

export async function lerEstado(caminho) {
  try {
    const cru = await readFile(caminho, "utf8");
    const lido = JSON.parse(cru);
    return lido && typeof lido === "object" ? lido : {};
  } catch {
    // Primeira execução, ou arquivo corrompido: em ambos os casos começar do
    // zero só significa varrer o histórico inteiro uma vez a mais.
    return {};
  }
}

export async function gravarEstado(caminho, estado) {
  await mkdir(dirname(caminho), { recursive: true });
  const temporario = `${caminho}.tmp`;
  await writeFile(temporario, JSON.stringify(estado), "utf8");
  await rename(temporario, caminho);
}

/**
 * A partir de que instante varrer o histórico agora.
 *
 * É o mais RECENTE entre "onde parei da última vez" e "hoje menos N dias". O
 * teto de N dias é o que impede que um notebook parado um mês inteiro acorde
 * despejando um mês de conversa de uma vez — o que trava o WhatsApp Web dentro
 * do navegador embutido e faz o programa parecer pendurado.
 */
export function inicioDaVarredura(estado, agora, dias) {
  const limiteDias = agora - Math.max(0, dias) * 24 * 60 * 60 * 1000;

  const ultima = Date.parse(String(estado?.ultimaVarredura ?? ""));
  if (!Number.isFinite(ultima)) return limiteDias;

  const comMargem = ultima - MARGEM_RETOMADA_MIN * 60 * 1000;
  // Relógio adiantado no passado (ou arquivo mexido à mão) poderia gravar uma
  // data no futuro e fazer o agente nunca mais varrer nada. O teto de `agora`
  // impede que a memória se torne uma armadilha permanente.
  return Math.min(Math.max(comMargem, limiteDias), agora);
}
