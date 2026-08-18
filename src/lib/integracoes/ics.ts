// Leitor E ESCRITOR de iCalendar (RFC 5545) — módulo NEUTRO, sem dependência
// externa.
//
// POR QUE UM PARSER PRÓPRIO, E POR QUE ICS EM VEZ DE OAUTH
// --------------------------------------------------------
// Ler a agenda pela API do Google exige um projeto no Google Cloud, tela de
// consentimento, escopos e um refresh token — o mesmo caminho de permissão que
// custou dias no Apps Script. O Google Agenda publica, para cada calendário,
// um "endereço secreto em formato iCal": uma URL longa e privada que devolve o
// arquivo .ics inteiro por GET simples, sem autenticação. Uma URL para colar,
// zero tela de autorização.
//
// ESTE ARQUIVO DEIXOU DE SER SOMENTE LEITURA NA TAREFA 16 — o comentário
// antigo dizia "o preço é ser SOMENTE LEITURA — deste arquivo, não do
// produto", e isso parou de ser verdade quando `montarIcs` (ao final deste
// arquivo) passou a existir: `mentoria/acoes-calendario.ts` usa esta função
// para o CAMINHO DEGRADADO (Google não conectado / app não configurado) —
// um convite `.ics` para a pessoa baixar e importar na mão. Comentário que
// vira mentira é pior que nenhum (mesma lição já registrada em
// `google-agenda.ts`).
//
// POR QUE O ESCRITOR MORA AQUI, E NÃO NUM ARQUIVO PRÓPRIO — decisão
// corrigida depois de reprovação em revisão independente: a primeira versão
// deste escritor vivia dentro de `acoes-calendario.ts`, um segundo domicílio
// para o MESMO formato (RFC 5545) que este arquivo já lê, sem nenhum
// contrato entre os dois lados — e foi exatamente essa divisão que deixou a
// dobra de linha (RFC 5545 §3.1) implementada só do lado da leitura
// (`desdobrar`, abaixo) e esquecida do lado da escrita. Ler e escrever o
// MESMO formato no mesmo arquivo é o que permite testar o ida-e-volta
// (`montarIcs` -> `analisarICS` -> mesmo texto de volta) dentro de uma única
// suíte, em vez de confiar que dois arquivos separados concordam sobre o que
// é uma linha válida.
//
// Escrever evento pela API do Google (quando ela responde) continua nos
// caminhos OAuth: ./calendar.ts (conta fixa do negócio, por variável de
// ambiente) e ./google-agenda-escrita.ts (conta conectada por cookie). O
// `.ics` deste arquivo é o caminho SEM API nenhuma — leitura por endereço
// secreto, escrita por arquivo para importar na mão.
//
// A URL de leitura é secreta: quem a tem lê a agenda inteira. Ela mora em
// variável de ambiente de SERVIDOR (nunca NEXT_PUBLIC_), nunca aparece em
// tela, em log ou em mensagem de erro.
//
// O QUE ESTE ARQUIVO COBRE, E O QUE NÃO COBRE (LEITURA)
// -------------------------------------------------------
// Cobre: desdobramento de linhas, escapes de texto, VEVENT, evento de dia
// inteiro, DTSTART/DTEND com TZID ou em UTC, repetição (RRULE) nas frequências
// diária, semanal, mensal e anual com INTERVAL/COUNT/UNTIL/BYDAY, datas
// excluídas (EXDATE) e ocorrência alterada individualmente (RECURRENCE-ID).
//
// NÃO cobre: BYMONTHDAY/BYSETPOS/BYMONTH combinados, VTODO, VALARME, anexos.
// Uma repetição que use essas regras cai no caso base — a série aparece na
// data original e as repetições exóticas ficam de fora. É uma limitação
// declarada, não um silêncio: `analisarICS` devolve `naoExpandidos` com a
// contagem, para a tela poder avisar em vez de fingir que a agenda está
// completa.
//
// O QUE A ESCRITA (`montarIcs`, ao final do arquivo) GARANTE
// -------------------------------------------------------------
// Dobra de linha a 75 OCTETOS (não caracteres — acento/emoji ocupam mais de
// um octeto em UTF-8, e cortar no meio de um caractere multibyte corrompe o
// arquivo), escape de texto simétrico ao `desescapar` da leitura — com UMA
// normalização declarada e testada em tabela: CR e CRLF viram o mesmo `\n`
// escapado que o LF, porque o RFC 5545 §3.3.11 não tem escape para CR
// isolado e a leitura normaliza CR para LF de qualquer forma (deixar o CR
// cru era um buraco de injeção, ver `escaparValorIcs`) — e
// e-mail de convidado VALIDADO (fail-closed), nunca sanitizado: um valor de
// `mentorado.email` com `\r`/`\n`/`;`/`:` embutido (coluna `text` sem CHECK
// no banco) é descartado da lista de convidados, não escapado — porque
// escapar um ATTENDEE ainda deixaria a estrutura de linhas do arquivo à
// mercê do que estivesse gravado naquela coluna, e é exatamente essa
// estrutura que um e-mail hostil tentaria quebrar para injetar propriedades
// (`SUMMARY`, `LOCATION`, `BEGIN:VEVENT` de outro evento) que o dono do
// produto nunca escreveu.

export interface EventoAgenda {
  /** UID do evento; numa série repetida, todas as ocorrências compartilham. */
  uid: string;
  titulo: string;
  /** Instante de início, absoluto (UTC). */
  inicio: Date;
  /** Instante de fim, absoluto (UTC). */
  fim: Date;
  /** Evento de dia inteiro: sem hora, ocupa o dia. */
  diaInteiro: boolean;
  local: string;
  descricao: string;
  /** true quando esta ocorrência veio de uma RRULE. */
  repetido: boolean;
  cancelado: boolean;
}

export interface AgendaLida {
  eventos: EventoAgenda[];
  /** Nome do calendário, quando o arquivo declara X-WR-CALNAME. */
  nome: string;
  /** Séries cuja regra de repetição este leitor não sabe expandir. */
  naoExpandidos: number;
}

// ---------------------------------------------------------------- fuso

/**
 * Deslocamento do fuso, em milissegundos, para um INSTANTE específico.
 *
 * O truque: formatar o instante NAQUELE fuso e ler os campos de volta como se
 * fossem UTC. A diferença entre os dois é o deslocamento vigente naquele dia —
 * o que faz o cálculo respeitar horário de verão sem tabela própria.
 */
function deslocamentoMs(fuso: string, instante: Date): number {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: fuso,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const parte of f.formatToParts(instante)) p[parte.type] = parte.value;
  const comoUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour) % 24,
    Number(p.minute),
    Number(p.second)
  );
  return comoUtc - instante.getTime();
}

/**
 * Hora de parede num fuso → instante absoluto.
 *
 * Duas passadas porque o deslocamento depende do próprio instante que estamos
 * calculando: a primeira chuta, a segunda corrige. É o que acerta a virada do
 * horário de verão.
 */
export function paredeParaInstante(
  ano: number,
  mes: number,
  dia: number,
  hora: number,
  minuto: number,
  segundo: number,
  fuso: string
): Date {
  const alvo = Date.UTC(ano, mes - 1, dia, hora, minuto, segundo);
  let chute = alvo;
  for (let i = 0; i < 2; i++) {
    chute = alvo - deslocamentoMs(fuso, new Date(chute));
  }
  return new Date(chute);
}

// ------------------------------------------------------- desdobramento

/**
 * Desdobra as linhas (RFC 5545 §3.1): linha que começa com espaço ou TAB é
 * continuação da anterior. Sem isto, todo título com mais de 75 bytes chega
 * cortado no meio.
 */
function desdobrar(texto: string): string[] {
  const linhas = texto.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const saida: string[] = [];
  for (const linha of linhas) {
    if ((linha.startsWith(" ") || linha.startsWith("\t")) && saida.length > 0) {
      saida[saida.length - 1] += linha.slice(1);
    } else {
      saida.push(linha);
    }
  }
  return saida;
}

interface Propriedade {
  nome: string;
  params: Record<string, string>;
  valor: string;
}

/** `DTSTART;TZID=America/Sao_Paulo:20260806T090000` → nome, params e valor. */
function lerPropriedade(linha: string): Propriedade | null {
  // O primeiro ":" fora de aspas separa cabeçalho de valor.
  let dentroDeAspas = false;
  let corte = -1;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') dentroDeAspas = !dentroDeAspas;
    else if (c === ":" && !dentroDeAspas) {
      corte = i;
      break;
    }
  }
  if (corte < 0) return null;

  const cabecalho = linha.slice(0, corte);
  const valor = linha.slice(corte + 1);
  const pedacos = cabecalho.split(";");
  const nome = (pedacos.shift() ?? "").toUpperCase();
  const params: Record<string, string> = {};
  for (const p of pedacos) {
    const eq = p.indexOf("=");
    if (eq < 0) continue;
    params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { nome, params, valor };
}

/**
 * Escapes de valor TEXT (RFC 5545 §3.3.11) — direção LER, par simétrico de
 * `escaparValorIcs` (escrita, no fim do arquivo).
 *
 * UMA passada só, com `\\` (a barra) consumida junto do caractere que ela
 * escapa. A versão anterior encadeava quatro `.replace()` — e quatro passadas
 * quebram a simetria num caso real: um backslash literal seguido da letra
 * "n" (`c:\nova`) sai da escrita como `c:\\nova`, e a passada que procura
 * `\n` ANTES da que procura `\\` lê aquele par como quebra de linha,
 * devolvendo `c:\` + LF + `ova`. Com uma passada da esquerda para a direita,
 * `\\` casa primeiro e o "n" seguinte fica sendo o que sempre foi: uma letra.
 *
 * `\N` maiúsculo é o mesmo que `\n` (o RFC aceita os dois). Uma sequência
 * desconhecida (`\q`) é devolvida intacta — inventar um significado para ela
 * seria pior do que repassar o que estava escrito.
 *
 * Exportada porque a simetria com `escaparValorIcs` é testada em tabela de
 * ida-e-volta (`ics.test.ts`): as duas funções são um PAR, e um par se prova
 * junto ou não se prova.
 */
export function desescapar(v: string): string {
  return v.replace(/\\([\\;,nN])/g, (_tudo: string, caractere: string) =>
    caractere === "n" || caractere === "N" ? "\n" : caractere
  );
}

interface DataICS {
  instante: Date;
  diaInteiro: boolean;
  /** Componentes da hora de parede, guardados para a expansão da RRULE. */
  parede: { ano: number; mes: number; dia: number; hora: number; minuto: number; segundo: number };
  fuso: string;
}

/**
 * Três formas legítimas de data no ICS:
 *   VALUE=DATE:20260806            → dia inteiro
 *   ...:20260806T120000Z           → instante em UTC
 *   TZID=America/Sao_Paulo:2026... → hora de parede naquele fuso
 * Sem TZID e sem Z, a hora é "flutuante": usamos o fuso do calendário.
 */
function lerData(p: Propriedade, fusoPadrao: string): DataICS | null {
  const v = p.valor.trim();
  const soData = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (soData) {
    const [, a, m, d] = soData;
    const parede = {
      ano: +a,
      mes: +m,
      dia: +d,
      hora: 0,
      minuto: 0,
      segundo: 0,
    };
    return {
      instante: paredeParaInstante(+a, +m, +d, 0, 0, 0, fusoPadrao),
      diaInteiro: true,
      parede,
      fuso: fusoPadrao,
    };
  }

  const comHora = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(v);
  if (!comHora) return null;
  const [, a, m, d, h, mi, s, z] = comHora;
  const parede = { ano: +a, mes: +m, dia: +d, hora: +h, minuto: +mi, segundo: +s };

  if (z === "Z") {
    return {
      instante: new Date(Date.UTC(+a, +m - 1, +d, +h, +mi, +s)),
      diaInteiro: false,
      parede,
      fuso: "UTC",
    };
  }

  const fuso = p.params.TZID || fusoPadrao;
  return {
    instante: paredeParaInstante(+a, +m, +d, +h, +mi, +s, fuso),
    diaInteiro: false,
    parede,
    fuso,
  };
}

// ------------------------------------------------------------- RRULE

const DIAS_SEMANA: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

interface Regra {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  intervalo: number;
  conta: number | null;
  ate: Date | null;
  porDia: number[]; // 0=domingo
  /** true quando a regra usa algo que este leitor não sabe expandir. */
  desconhecida: boolean;
}

function lerRegra(valor: string): Regra | null {
  const campos: Record<string, string> = {};
  for (const parte of valor.split(";")) {
    const eq = parte.indexOf("=");
    if (eq > 0) campos[parte.slice(0, eq).toUpperCase()] = parte.slice(eq + 1);
  }
  const freq = (campos.FREQ || "").toUpperCase();
  if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY" && freq !== "YEARLY") {
    return null;
  }

  let ate: Date | null = null;
  if (campos.UNTIL) {
    const p = lerData({ nome: "UNTIL", params: {}, valor: campos.UNTIL }, "UTC");
    ate = p?.instante ?? null;
  }

  const porDia = (campos.BYDAY || "")
    .split(",")
    .map((d) => DIAS_SEMANA[d.trim().slice(-2).toUpperCase()])
    .filter((n) => n !== undefined);

  // BYSETPOS e BYMONTHDAY mudam quais ocorrências valem; expandir sem eles
  // devolveria datas erradas, e data errada é pior que data faltando.
  const desconhecida = Boolean(campos.BYSETPOS || campos.BYMONTHDAY || campos.BYYEARDAY);

  return {
    freq,
    intervalo: Math.max(1, Number(campos.INTERVAL || 1)),
    conta: campos.COUNT ? Number(campos.COUNT) : null,
    ate,
    porDia,
    desconhecida,
  };
}

/** Soma dias a uma data de parede, normalizando o mês. */
function somarDiasParede(p: DataICS["parede"], dias: number): DataICS["parede"] {
  const base = new Date(Date.UTC(p.ano, p.mes - 1, p.dia + dias));
  return {
    ano: base.getUTCFullYear(),
    mes: base.getUTCMonth() + 1,
    dia: base.getUTCDate(),
    hora: p.hora,
    minuto: p.minuto,
    segundo: p.segundo,
  };
}

/**
 * Expande a série DENTRO da janela pedida.
 *
 * A expansão anda na HORA DE PAREDE e só depois converte para instante, e não
 * ao contrário: somar 7×24h a um instante erra uma hora na semana da virada do
 * horário de verão, e a reunião das 9h apareceria às 8h.
 */
function expandir(
  inicio: DataICS,
  duracaoMs: number,
  regra: Regra,
  janelaDe: Date,
  janelaAte: Date
): Array<{ inicio: Date; fim: Date }> {
  const saida: Array<{ inicio: Date; fim: Date }> = [];
  const LIMITE = 2000; // trava de segurança: regra maluca não trava a página

  let parede = { ...inicio.parede };
  let geradas = 0;

  for (let passo = 0; passo < LIMITE; passo++) {
    // candidatas deste passo: uma só, ou uma por dia da semana marcado
    const candidatas: DataICS["parede"][] = [];
    if (regra.freq === "WEEKLY" && regra.porDia.length > 0) {
      const refUtc = new Date(Date.UTC(parede.ano, parede.mes - 1, parede.dia));
      const diaDaSemana = refUtc.getUTCDay();
      for (const alvo of regra.porDia) {
        candidatas.push(somarDiasParede(parede, (alvo - diaDaSemana + 7) % 7));
      }
    } else {
      candidatas.push(parede);
    }

    for (const c of candidatas) {
      const inst = paredeParaInstante(c.ano, c.mes, c.dia, c.hora, c.minuto, c.segundo, inicio.fuso);
      if (inst.getTime() < inicio.instante.getTime()) continue;
      if (regra.ate && inst.getTime() > regra.ate.getTime()) return saida;
      geradas++;
      if (regra.conta !== null && geradas > regra.conta) return saida;
      if (inst.getTime() <= janelaAte.getTime() && inst.getTime() + duracaoMs >= janelaDe.getTime()) {
        saida.push({ inicio: inst, fim: new Date(inst.getTime() + duracaoMs) });
      }
      if (inst.getTime() > janelaAte.getTime()) return saida;
    }

    // avança um período
    if (regra.freq === "DAILY") parede = somarDiasParede(parede, regra.intervalo);
    else if (regra.freq === "WEEKLY") parede = somarDiasParede(parede, 7 * regra.intervalo);
    else if (regra.freq === "MONTHLY") {
      const d = new Date(Date.UTC(parede.ano, parede.mes - 1 + regra.intervalo, parede.dia));
      parede = { ...parede, ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate() };
    } else {
      parede = { ...parede, ano: parede.ano + regra.intervalo };
    }
  }
  return saida;
}

// ------------------------------------------------------------ o leitor

/**
 * Lê um arquivo .ics e devolve as ocorrências que tocam a janela pedida.
 *
 * A janela é obrigatória: um calendário com reunião semanal desde 2019 tem
 * milhares de ocorrências, e expandir todas para mostrar uma semana seria
 * gastar memória para jogar fora.
 */
export function analisarICS(texto: string, janelaDe: Date, janelaAte: Date): AgendaLida {
  const linhas = desdobrar(texto);
  const eventos: EventoAgenda[] = [];
  let nome = "";
  let fusoCalendario = "America/Sao_Paulo";
  let naoExpandidos = 0;

  // Primeira passada só para achar o fuso e o nome do calendário: eles podem
  // vir DEPOIS do primeiro VEVENT, e a data precisa deles para ser lida.
  for (const linha of linhas) {
    const p = lerPropriedade(linha);
    if (!p) continue;
    if (p.nome === "X-WR-CALNAME") nome = desescapar(p.valor);
    if (p.nome === "X-WR-TIMEZONE") fusoCalendario = p.valor.trim();
  }

  interface Bruto {
    uid: string;
    titulo: string;
    local: string;
    descricao: string;
    inicio: DataICS | null;
    fim: DataICS | null;
    regra: Regra | null;
    regraCrua: string;
    excluidas: number[];
    recorrenciaId: Date | null;
    cancelado: boolean;
  }

  const brutos: Bruto[] = [];
  let atual: Bruto | null = null;

  for (const linha of linhas) {
    const p = lerPropriedade(linha);
    if (!p) continue;

    if (p.nome === "BEGIN" && p.valor.trim().toUpperCase() === "VEVENT") {
      atual = {
        uid: "",
        titulo: "(sem título)",
        local: "",
        descricao: "",
        inicio: null,
        fim: null,
        regra: null,
        regraCrua: "",
        excluidas: [],
        recorrenciaId: null,
        cancelado: false,
      };
      continue;
    }
    if (p.nome === "END" && p.valor.trim().toUpperCase() === "VEVENT") {
      if (atual && atual.inicio) brutos.push(atual);
      atual = null;
      continue;
    }
    if (!atual) continue;

    switch (p.nome) {
      case "UID":
        atual.uid = p.valor.trim();
        break;
      case "SUMMARY":
        atual.titulo = desescapar(p.valor).trim() || "(sem título)";
        break;
      case "LOCATION":
        atual.local = desescapar(p.valor).trim();
        break;
      case "DESCRIPTION":
        atual.descricao = desescapar(p.valor).trim();
        break;
      case "STATUS":
        atual.cancelado = p.valor.trim().toUpperCase() === "CANCELLED";
        break;
      case "DTSTART":
        atual.inicio = lerData(p, fusoCalendario);
        break;
      case "DTEND":
        atual.fim = lerData(p, fusoCalendario);
        break;
      case "RRULE":
        atual.regraCrua = p.valor;
        atual.regra = lerRegra(p.valor);
        break;
      case "EXDATE":
        for (const pedaco of p.valor.split(",")) {
          const d = lerData({ ...p, valor: pedaco }, fusoCalendario);
          if (d) atual.excluidas.push(d.instante.getTime());
        }
        break;
      case "RECURRENCE-ID": {
        const d = lerData(p, fusoCalendario);
        atual.recorrenciaId = d?.instante ?? null;
        break;
      }
      default:
        break;
    }
  }

  // Ocorrências alteradas individualmente: substituem a data original da série.
  const substituidas = new Set(
    brutos
      .filter((b) => b.recorrenciaId)
      .map((b) => `${b.uid}@${b.recorrenciaId!.getTime()}`)
  );

  for (const b of brutos) {
    if (!b.inicio) continue;
    const duracao = b.fim
      ? Math.max(0, b.fim.instante.getTime() - b.inicio.instante.getTime())
      : b.inicio.diaInteiro
        ? 24 * 3600_000
        : 3600_000;

    const base = {
      uid: b.uid,
      titulo: b.titulo,
      local: b.local,
      descricao: b.descricao,
      diaInteiro: b.inicio.diaInteiro,
      cancelado: b.cancelado,
    };

    // Regra que este leitor não sabe expandir: entra só na data original, e a
    // tela é avisada pela contagem. Melhor faltar do que inventar data.
    if (b.regraCrua && (!b.regra || b.regra.desconhecida)) {
      naoExpandidos++;
      const fim = new Date(b.inicio.instante.getTime() + duracao);
      if (b.inicio.instante <= janelaAte && fim >= janelaDe) {
        eventos.push({ ...base, inicio: b.inicio.instante, fim, repetido: true });
      }
      continue;
    }

    if (b.regra) {
      for (const oc of expandir(b.inicio, duracao, b.regra, janelaDe, janelaAte)) {
        if (b.excluidas.includes(oc.inicio.getTime())) continue;
        if (substituidas.has(`${b.uid}@${oc.inicio.getTime()}`)) continue;
        eventos.push({ ...base, inicio: oc.inicio, fim: oc.fim, repetido: true });
      }
      continue;
    }

    const fim = new Date(b.inicio.instante.getTime() + duracao);
    if (b.inicio.instante <= janelaAte && fim >= janelaDe) {
      eventos.push({ ...base, inicio: b.inicio.instante, fim, repetido: Boolean(b.recorrenciaId) });
    }
  }

  eventos.sort((a, z) => a.inicio.getTime() - z.inicio.getTime());
  return { eventos, nome, naoExpandidos };
}

// ============================================================================
// ESCRITA — `montarIcs` (Tarefa 16). Ver o cabeçalho do arquivo para o
// porquê de morar aqui.
// ============================================================================

/**
 * Formato mínimo que `montarIcs` precisa — cópia ESTRUTURAL de
 * `EventoDeCalendario` (`mentoria/calendario.ts`), não um import: este
 * arquivo é a camada de baixo (`integracoes/`), e `mentoria/calendario.ts`
 * já importa DAQUI (`paredeParaInstante`) — importar de volta inverteria a
 * direção de dependência do projeto. Mesmo raciocínio documentado para
 * `EventoParaGoogle` em `./google-agenda-escrita.ts`. TypeScript aceita
 * passar um `EventoDeCalendario` aqui sem conversão nenhuma, porque a forma
 * é idêntica.
 */
export interface EventoParaIcs {
  titulo: string;
  descricao: string;
  /** ISO 8601 em UTC (`Date#toISOString()`). */
  inicioIso: string;
  /** ISO 8601 em UTC. */
  fimIso: string;
  convidados: string[];
}

// ---------------------------------------------------------------- escapes

/**
 * Escapes de valor TEXT do RFC 5545 §3.3.11 — direção ESCREVER, par simétrico
 * de `desescapar` (leitura, acima).
 *
 * AS TRÊS FORMAS DE QUEBRA DE LINHA (CRLF, CR sozinho e LF) viram o MESMO
 * `\n` escapado. Tratar só o LF — como esta função fazia até a revisão que
 * pegou o defeito — deixava o octeto CR passar cru para dentro do arquivo, e
 * um CR cru É quebra de linha na volta: `desdobrar` (no topo deste arquivo)
 * converte CR em LF antes de separar as linhas. Ou seja, um `\r` no meio de
 * um SUMMARY não ficava sendo texto: virava uma LINHA nova de verdade, e a
 * primeira palavra depois dele virava uma PROPRIEDADE nova
 * (`SUMMARY:`, `LOCATION:`, até um `BEGIN:VEVENT`) no arquivo que a pessoa
 * baixa e importa na própria agenda. É a mesma classe de defeito do e-mail
 * de convidado hostil (ver `emailAttendeeValido`), pela porta do texto.
 *
 * Por que NORMALIZAR (CR -> LF) em vez de preservar o CR: o §3.3.11 só
 * define `\n` como escape de quebra de linha em valor TEXT — não existe
 * escape para um CR isolado. Preservá-lo exigiria sintaxe fora do padrão, e
 * a leitura o normalizaria para LF de qualquer jeito. Então o ida-e-volta é
 * idêntico para tudo, MENOS por esta normalização declarada — que é o que a
 * tabela de simetria em `ics.test.ts` afirma, caso a caso.
 */
export function escaparValorIcs(texto: string): string {
  return texto
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

// ------------------------------------------------------------- validação de convidado

// Fail-closed, não sanitização — ver o cabeçalho do arquivo. Qualquer
// caractere que pudesse quebrar a ESTRUTURA de linhas do arquivo (espaço,
// tab, CR, LF — todos cobertos por `\s` — além de `;` e `:`, que abrem
// parâmetro/valor de propriedade) reprova o endereço inteiro, mesma
// disciplina de `linkGravacaoValido` em `mentoria/validacao.ts`: não tenta
// consertar um valor perigoso, descarta.
const FORMATO_EMAIL_ATTENDEE = /^[^@\s;:]+@[^@\s;:]+\.[^@\s;:]+$/;

export function emailAttendeeValido(email: string): boolean {
  const v = (email || "").trim();
  if (v === "" || /[\s;:]/.test(v)) return false;
  return FORMATO_EMAIL_ATTENDEE.test(v);
}

// ------------------------------------------------------------- dobra de linha (RFC 5545 §3.1)

const LIMITE_OCTETOS_LINHA_ICS = 75;
const codificadorUtf8 = new TextEncoder();

function octetosDe(caractere: string): number {
  return codificadorUtf8.encode(caractere).length;
}

/**
 * Dobra uma linha de propriedade ICS: nenhuma linha física pode passar de
 * 75 OCTETOS (não caracteres — um acento ocupa 2 em UTF-8, um emoji pode
 * ocupar 4), e cada continuação entra numa linha nova que começa com um
 * único espaço (RFC 5545 §3.1) — é esse mesmo espaço que `desdobrar`
 * (leitura, no topo do arquivo) sabe remover ao juntar de volta.
 *
 * A unidade de corte é o CARACTERE completo (`Array.from`, que respeita
 * pares substitutos/emoji): um caractere multibyte nunca é partido no meio,
 * mesmo que isso deixe uma linha alguns octetos abaixo do teto — cortar no
 * meio de um caractere produziria bytes UTF-8 inválidos, o que corrompe o
 * arquivo inteiro, não só aquela linha.
 */
export function dobrarLinhaIcs(linha: string): string {
  const caracteres = Array.from(linha);
  const blocos: string[] = [];
  let atual = "";
  let usados = 0;
  // Primeira linha: até 75 octetos. Da segunda em diante, o espaço de
  // continuação consome 1 octeto do teto daquela linha.
  let limite = LIMITE_OCTETOS_LINHA_ICS;

  for (const c of caracteres) {
    const tam = octetosDe(c);
    if (atual !== "" && usados + tam > limite) {
      blocos.push(atual);
      atual = "";
      usados = 0;
      limite = LIMITE_OCTETOS_LINHA_ICS - 1;
    }
    atual += c;
    usados += tam;
  }
  blocos.push(atual);
  return blocos.join("\r\n ");
}

// ------------------------------------------------------------------ montarIcs

export interface OpcoesMontarIcs {
  /**
   * Estável por sessão (não aleatório) — reimportar o mesmo arquivo
   * substitui o evento anterior em vez de duplicar (RFC 5545 §3.8.4.7), em
   * qualquer app de calendário que respeite UID.
   */
  uid: string;
  evento: EventoParaIcs;
  /**
   * `true` monta um convite de CANCELAMENTO: `METHOD:CANCEL` no
   * calendário inteiro e `STATUS:CANCELLED` no evento, com o MESMO `uid` —
   * é assim que um app de calendário reconhece "isto substitui o evento
   * anterior por uma versão cancelada" em vez de tratar como um evento novo
   * e independente.
   */
  cancelado?: boolean;
  /** Quando o arquivo foi montado (`DTSTAMP`). Parâmetro, nunca `new Date()` aqui dentro — mesma regra de `agoraIso` em `mentoria/dados.ts`: quem sabe que horas são é quem chama. */
  agoraIso: string;
}

/** "2026-08-20T15:00:00.000Z" -> "20260820T150000Z" (RFC 5545 §3.3.5, forma UTC básica).
 *  `inicioIso`/`fimIso`/`agoraIso` são sempre saída de `Date#toISOString()`, então sempre têm o "Z" e a fração de milissegundo. */
function carimboIcs(iso: string): string {
  return iso.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function montarIcs(opcoes: OpcoesMontarIcs): string {
  const { uid, evento, agoraIso } = opcoes;
  const cancelado = opcoes.cancelado ?? false;

  // Descarta (não escapa) qualquer convidado que não passe no formato
  // fail-closed — ver `emailAttendeeValido` acima.
  const convidadosValidos = evento.convidados.filter(emailAttendeeValido);

  const linhas: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MentorOS//sincronizarSessaoNaAgenda//PT-BR",
    "CALSCALE:GREGORIAN",
  ];
  if (cancelado) linhas.push("METHOD:CANCEL");
  linhas.push(
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${carimboIcs(agoraIso)}`,
    `DTSTART:${carimboIcs(evento.inicioIso)}`,
    `DTEND:${carimboIcs(evento.fimIso)}`,
    `SUMMARY:${escaparValorIcs(evento.titulo)}`,
    `DESCRIPTION:${escaparValorIcs(evento.descricao)}`
  );
  if (cancelado) linhas.push("STATUS:CANCELLED");
  for (const email of convidadosValidos) linhas.push(`ATTENDEE;RSVP=TRUE:mailto:${email}`);
  linhas.push("END:VEVENT", "END:VCALENDAR");

  return linhas.map(dobrarLinhaIcs).join("\r\n");
}
