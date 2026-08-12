// A configuracao, lida de um `.env` ao lado do programa.
//
// POR QUE UM PARSER PROPRIO EM VEZ DE `dotenv`
// --------------------------------------------
// Sao trinta linhas contra uma dependencia a mais numa instalacao que o dono vai
// fazer sozinho, num Mac, sem saber o que e npm. Cada pacote a mais e uma chance
// a mais de o `npm install` falhar na cozinha da casa dele — e quando falhar,
// nao tem ninguem por perto para consertar.
//
// POR QUE A VALIDACAO E RIGIDA E O PROGRAMA SE RECUSA A SUBIR
// -----------------------------------------------------------
// Sem BASE_URL certa, o agente captura conversa a noite inteira e empilha tudo
// numa fila que nunca sobe. O dono descobre em uma semana, quando abrir o CRM e
// achar que o WhatsApp "nao funciona". Melhor recusar na hora, com o motivo na
// tela, do que fingir que esta trabalhando.

import { homedir } from "node:os";
import { join } from "node:path";

/** Mesmo piso do servidor (`src/lib/atendimento/segredo.ts`): abaixo disso a
 *  integração é tratada como não configurada, dos dois lados. */
export const TAMANHO_MINIMO_SEGREDO = 12;

/** Padrão de histórico na reconexão, em dias. */
export const DIAS_HISTORICO_PADRAO = 7;

/** Teto do histórico. Varrer meses de conversa trava o WhatsApp Web dentro do
 *  navegador embutido e o dono só vê o programa "pendurado". */
export const DIAS_HISTORICO_MAXIMO = 30;

/**
 * Lê o formato `.env`. Aceita `#` de comentário, `export ` na frente e aspas em
 * volta do valor — as três coisas que aparecem quando alguém copia e cola de um
 * tutorial, que é exatamente como este arquivo vai ser preenchido.
 */
export function lerEnv(texto) {
  const saida = {};
  for (const linhaBruta of String(texto ?? "").split(/\r?\n/)) {
    const linha = linhaBruta.trim();
    if (linha === "" || linha.startsWith("#")) continue;

    const semExport = linha.startsWith("export ") ? linha.slice(7).trim() : linha;
    const igual = semExport.indexOf("=");
    if (igual <= 0) continue;

    const chave = semExport.slice(0, igual).trim();
    let valor = semExport.slice(igual + 1).trim();

    const aspas = valor[0];
    if ((aspas === '"' || aspas === "'") && valor.endsWith(aspas) && valor.length >= 2) {
      valor = valor.slice(1, -1);
    }
    saida[chave] = valor;
  }
  return saida;
}

function inteiro(valor, padrao, minimo, maximo) {
  const n = Number.parseInt(String(valor ?? "").trim(), 10);
  if (!Number.isFinite(n)) return padrao;
  return Math.min(maximo, Math.max(minimo, n));
}

/**
 * Monta a configuração final e devolve também a lista de problemas.
 *
 * Devolve os erros em vez de lançar porque quem chama precisa mostrar TODOS de
 * uma vez: fazer o dono descobrir um problema por execução é o jeito mais lento
 * possível de configurar duas variáveis.
 */
export function montarConfig(vars = {}, opcoes = {}) {
  const erros = [];
  const casa = opcoes.home ?? homedir();

  const baseUrl = String(vars.BASE_URL ?? "").trim().replace(/\/+$/, "");
  if (baseUrl === "") {
    erros.push("BASE_URL não está preenchida (ex.: https://seu-crm.vercel.app).");
  } else if (!/^https?:\/\//i.test(baseUrl)) {
    erros.push("BASE_URL precisa começar com https:// (ou http:// só em teste local).");
  } else if (/^http:\/\//i.test(baseUrl) && !/^http:\/\/(localhost|127\.0\.0\.1)/i.test(baseUrl)) {
    // O segredo viaja em header a cada minuto. Em http:// aberto, qualquer
    // rede de café lê o segredo e passa a escrever no CRM do dono.
    erros.push("BASE_URL em http:// só é aceita para localhost — na internet tem que ser https://.");
  }

  const segredo = String(vars.RARO_AGENTE_SEGREDO ?? "").trim();
  if (segredo.length < TAMANHO_MINIMO_SEGREDO) {
    // A mensagem fala do TAMANHO exigido e nunca do valor lido, nem do que foi
    // encontrado: erro que descreve o segredo é erro que vaza o segredo.
    erros.push(
      `RARO_AGENTE_SEGREDO precisa ter pelo menos ${TAMANHO_MINIMO_SEGREDO} caracteres e ser igual ao configurado no servidor.`
    );
  }

  const pastaDados =
    String(vars.PASTA_DADOS ?? "").trim() ||
    // O lugar que o macOS reserva para dado de aplicativo. Fora do Desktop e
    // fora de qualquer pasta sincronizada: sessão do WhatsApp dentro do iCloud
    // Drive corrompe sozinha quando dois computadores mexem no mesmo arquivo.
    join(casa, "Library", "Application Support", "RaroAgenteWhatsApp");

  return {
    erros,
    config: {
      baseUrl,
      segredo,
      pastaDados,
      pastaSessao: join(pastaDados, "sessao"),
      arquivoMensagens: join(pastaDados, "fila-mensagens.json"),
      arquivoResultados: join(pastaDados, "fila-resultados.json"),
      arquivoEstado: join(pastaDados, "estado.json"),
      arquivoLog: join(pastaDados, "agente.log"),
      diasHistorico: inteiro(vars.DIAS_HISTORICO, DIAS_HISTORICO_PADRAO, 0, DIAS_HISTORICO_MAXIMO),
      // Piso de 5s em todos os intervalos: com valor menor o agente vira um
      // laço apertado batendo na Vercel, e a conta de function invocations do
      // dono cresce sem ele entender por quê.
      segundosEntreLotes: inteiro(vars.SEGUNDOS_ENTRE_LOTES, 15, 5, 3600),
      segundosEntreFila: inteiro(vars.SEGUNDOS_ENTRE_FILA, 20, 5, 3600),
      segundosEntrePulsos: inteiro(vars.SEGUNDOS_ENTRE_PULSOS, 60, 15, 3600),
      // Teto de mensagens por requisição: lote gigante estoura o limite de
      // corpo da Vercel e o histórico inteiro passa a falhar de uma vez.
      tamanhoDoLote: inteiro(vars.TAMANHO_DO_LOTE, 50, 1, 200),
      versao: String(opcoes.versao ?? "").trim(),
    },
  };
}
