// Montagem de evento de calendário a partir de uma sessão de mentoria —
// módulo PURO: nada de Next, nada de banco, nada de `Date.now()`. Mesmo
// espírito de `progresso.ts`: quem quer virar linha de `.ics` ou chamada à
// API do Google (`src/lib/integracoes/calendar.ts`, quando existir) recebe
// daqui um objeto pronto, e nunca formata data nem decide convidado na marra
// dentro de quem chama.
//
// POR QUE ISTO EXISTE COMO MÓDULO SEPARADO (não dentro de `dados.ts` nem de
// `acoes.ts`): evento de calendário sincroniza para o celular de QUEM FOI
// CONVIDADO — e, com apps de calendário compartilhado em família/empresa,
// frequentemente para o celular de mais alguém também. Um campo vazado aqui
// não fica preso na tela do mentor: ele viaja para fora do produto, sem
// controle de acesso nenhum do lado de cá. Por isso a REGRA DE OURO deste
// módulo é o VOCABULÁRIO FECHADO da descrição (ver `descricaoDaSessao`
// abaixo): nenhum campo de texto livre chega até lá — e ela é testada com o
// mesmo rigor que `progresso.ts` testa "nunca inventar número".
//
// REVISÃO (laudo do revisor independente, 5 defeitos corrigidos aqui):
//   D1 — `programa.nome` é texto livre sem CHECK no banco: um nome de
//        programa poluído com "@"/"R$"/link/telefone vazava para a
//        descrição do evento. A primeira correção tentou FILTRAR por regex
//        e foi reprovada (ver `descricaoDaSessao`): hoje a descrição é
//        montada por VOCABULÁRIO FECHADO, sem texto livre nenhum.
//   N1 — o módulo não aceitava de volta o que ele mesmo emitia: a regex de
//        `quando` não tinha grupo para fração de segundo, e `inicioIso`
//        (".000Z", saída de `toISOString`) reparseado dava `null`. Ver
//        `REGEX_QUANDO` e o teste de ROUND-TRIP.
//   D2 — (só afeta o teste, não este arquivo).
//   D3 — `Date.parse` de uma string ISO SEM offset é interpretada pelo
//        FUSO DO PROCESSO, não pelo fuso do negócio — a mesma classe de bug
//        que este arquivo dizia evitar, só que no PARSING em vez da
//        formatação. Ver `interpretarQuando` abaixo.
//   D4 — `duracaoMin` não-finito (NaN/Infinity) — e, no resíduo achado
//        depois, finito porém absurdo (1e15) — chegava direto em
//        `new Date(...)` e lançava `RangeError`. Ver `fimDe`.
//   D5 — data civil impossível ("2026-02-31") era aceita por `Date.parse`/
//        `Date.UTC`, que ROLAM em silêncio para o dia seguinte válido
//        (mesmo bug do `paraData` do Apps Script, já pago uma vez neste
//        projeto). Ver `dataCivilValida`.

import type { Mentorado, Programa, Sessao } from "./tipos";
import { paredeParaInstante } from "../integracoes/ics";

export interface EventoDeCalendario {
  titulo: string;
  descricao: string;
  /** ISO 8601 em UTC (saída de `Date#toISOString`) — pronto para virar `DTSTART`/campo do Google. */
  inicioIso: string;
  /** ISO 8601 em UTC; ver REGRA FIM sobre `duracaoMin === 0`. */
  fimIso: string;
  /**
   * E-mails a convidar. REGRA TURMA: sessão de turma (`turmaId` preenchido)
   * nunca aparece aqui — ver comentário em `convidadosDaSessao`.
   */
  convidados: string[];
}

/** Fuso fixo, mesmo motivo documentado em `textos.ts` (`FUSO_BRASIL`): a
 *  mentoria é um produto brasileiro, e "20/08 às 23:00" não pode virar
 *  "21/08" só porque o processo que monta o evento roda em UTC (caso do
 *  container de CI) ou em outro fuso (a máquina do dono do produto). Não
 *  importamos de `src/app/(app)/mentoria/textos.ts` de propósito: `lib/`
 *  é a camada de baixo, `app/` é a de cima — importar dali para cá inverteria
 *  a direção de dependência do projeto (ver cabeçalho de `tipos.ts` sobre
 *  módulo puro). A pequena duplicação de formatação é o preço aceito por
 *  manter a direção certa. Já `src/lib/integracoes/ics.ts` é a MESMA camada
 *  (`lib/`) — importar `paredeParaInstante` de lá (ver `interpretarQuando`)
 *  não inverte nada, e evita reescrever, pior, uma segunda versão da
 *  conversão hora-de-parede-para-instante com consciência de horário de
 *  verão (D3). */
const FUSO_BRASIL = "America/Sao_Paulo";

/**
 * ISO datetime -> "20/08 23:00", no fuso de São Paulo. Só para o TÍTULO do
 * evento (não é `dataHoraBr` de `textos.ts`: aquela devolve data completa
 * com ano, esta é a versão curta que cabe num título de calendário).
 * Assume que `data` já é um instante válido — quem chama (`eventoDaSessao`)
 * garante isso antes, via `interpretarQuando`.
 */
function dataHoraCurtaSp(data: Date): string {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO_BRASIL,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23", // "h23" em vez de hour12:false: evita o "24:00" de meia-noite que hour12:false produz em alguns motores ICU (mesma nota de `textos.ts`)
  }).formatToParts(data);

  const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${parte("day")}/${parte("month")} ${parte("hour")}:${parte("minute")}`;
}

// ============================================================
// D5 — validação de data civil (calendário, não instante). `Date.UTC` e
// `Date.parse` ROLAM data impossível para o próximo dia válido em silêncio
// ("2026-02-31" vira "2026-03-03") em vez de recusar — é assim que uma
// digitação errada de mês vira um evento aparecendo 3 dias depois na
// agenda de alguém, sem erro nenhum no caminho. `dataCivilValida` recusa
// ANTES de qualquer conversão para instante.
// ============================================================

/** Último dia do mês (1-indexado), respeitando ano bissexto. O truque —
 *  `Date.UTC(ano, mes, 0)` — usa o PRÓPRIO comportamento de rollover do
 *  `Date` a favor: "dia 0 do mês seguinte" é sempre "o último dia deste
 *  mês", com `mes` já 1-indexado batendo certinho com "mês seguinte
 *  0-indexado" (fev=2 1-indexado == março 0-indexado == mês seguinte a
 *  fev). Isto SÓ é seguro porque `mes` já foi validado como 1..12 por
 *  quem chama — nunca usado para validar o próprio mês. */
function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/** `ano`/`mes`/`dia` batem com uma data real do calendário — não com o que
 *  `Date` decidiria "corrigir" sozinho. */
function dataCivilValida(ano: number, mes: number, dia: number): boolean {
  if (mes < 1 || mes > 12) return false;
  if (dia < 1) return false;
  return dia <= ultimoDiaDoMes(ano, mes);
}

// ============================================================
// D3 — `interpretarQuando`: string ISO -> instante absoluto, SEM depender
// do fuso do processo que roda o código.
//
// `sessao.quando` chega em três formas legítimas:
//   "2026-08-20"                    -> só data, sem hora nem fuso
//   "2026-08-20T23:00:00"           -> data+hora, SEM offset ("flutuante")
//   "2026-08-20T23:00:00Z"/"...+02:00" -> data+hora COM offset explícito
//
// Para as duas primeiras, `new Date(texto)`/`Date.parse(texto)` usa o fuso
// do PROCESSO que roda o código para decidir o que "23:00" significa — a
// mesma sessão gera quatro instantes diferentes em quatro máquinas (o
// laudo do revisor mediu isso). Este é um produto brasileiro, pt-BR: uma
// string SEM fuso indicado É a hora de parede de São Paulo, sempre — nunca
// a do container que por acaso está rodando o código naquele momento.
//
// DECISÃO CONSCIENTE sobre o deslocamento de São Paulo: em vez de fixar
// "-03:00" na marra (o que estaria ERRADO para qualquer data anterior a
// 2019, quando o Brasil ainda observava horário de verão e o deslocamento
// virava -02:00 em parte do ano), reaproveitamos `paredeParaInstante` de
// `integracoes/ics.ts` — ela pergunta ao ICU (via `Intl.DateTimeFormat`
// com `timeZone: "America/Sao_Paulo"`) qual era o deslocamento VIGENTE
// naquele dia específico, olhando a tabela de fuso real, não um número
// fixo. O resultado é correto tanto para uma sessão de 2026 (-03:00, sem
// DST desde 2019) quanto para uma sessão antiga de antes de 2019 que
// eventualmente precise ser lida por este módulo.
//
// Quando a string TEM offset explícito (Z ou ±HH:MM), o texto já diz o
// instante absoluto — não há fuso nenhum para adivinhar, só somar o
// offset à hora informada.
// ============================================================

// ------------------------------------------------------------
// N1 — a regressão que faltava cobrir: o módulo precisa aceitar de volta o
// que ele mesmo emite, e o que o banco de fato devolve.
//
// `sessao.quando` é `timestamptz` SEM precisão declarada
// (`0006_mentoros_mentoria.sql:156`), ou seja, resolução de MICROSSEGUNDOS.
// Na prática chegam aqui, todas legítimas:
//   "2026-08-20T15:00:00.000Z"           <- o próprio `inicioIso` deste
//                                           módulo (`Date#toISOString`)
//   "2026-08-20T15:00:00.123456+00:00"   <- o que o PostgREST devolve
//   "2026-08-20 15:00:00+00"             <- o `to_char`/dump do Postgres:
//                                           separador ESPAÇO e offset de
//                                           2 dígitos
//   "2026-08-20T15:00:00z"               <- "z" minúsculo (ISO 8601 e
//                                           RFC 3339 aceitam os dois casos)
// A regex anterior não tinha grupo para fração de segundo, exigia "T" e
// exigia offset de 4 dígitos — todas essas viravam `null`. E `null` aqui é
// SILENCIOSO: é o mesmo retorno de "não tenho dado", então o evento
// simplesmente não nascia, sem erro em lugar nenhum.
//
// Pior ainda era a DISCORDÂNCIA ENTRE IRMÃOS: `progresso.ts:52`
// (`quandoValido`) e `dados.ts:317` (`quandoOuLimite`) usam `Date.parse`,
// que aceita fração sem reclamar. Para a MESMA linha do banco, `progressoDe`
// contava a sessão e `eventoDaSessao` dizia que a data era inválida.
//
// O que NÃO muda: continuamos mais restritos que `Date.parse` de propósito
// — data civil impossível ("2026-02-31") segue `null` (D5), porque a
// leniência do `Date` nesse ponto é rollover silencioso, não tolerância.
// ------------------------------------------------------------

const REGEX_QUANDO =
  /^(\d{4})-(\d{2})-(\d{2})(?:[Tt ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d+))?)?(Z|z|[+-]\d{2}(?::?\d{2})?)?)?$/;

/** Fração de segundo do texto ("123", "123456", "5") -> milissegundos.
 *  TRUNCA em 3 casas em vez de arredondar: 1 ms é a resolução máxima de
 *  `Date` em JS, e arredondar ".9996" para cima empurraria o instante para
 *  o segundo seguinte — mudando o segundo que aparece na agenda de alguém
 *  para "consertar" 0,4 ms. Truncar mantém o instante dentro do segundo que
 *  o banco gravou; a perda é sub-milissegundo, e é declarada, não acidental. */
function fracaoParaMs(fracaoTxt: string | undefined): number {
  if (!fracaoTxt) return 0;
  return Number(`${fracaoTxt}000`.slice(0, 3));
}

/** "Z" | "z" | "+02:00" | "-0300" | "+00" -> deslocamento em ms a leste de
 *  UTC. `null` quando o texto não é um offset reconhecido — inclusive
 *  quando os números estão fora de faixa (hora > 23 ou minuto > 59): um
 *  offset impossível é dado corrompido, não um fuso exótico. */
function offsetParaMs(offsetTxt: string | undefined): number | null {
  if (!offsetTxt) return null;
  if (offsetTxt === "Z" || offsetTxt === "z") return 0;
  // Minutos opcionais: "+00" é o que o Postgres imprime quando o offset é
  // redondo, e vale "+00:00".
  const m = /^([+-])(\d{2})(?::?(\d{2}))?$/.exec(offsetTxt);
  if (!m) return null;
  const sinal = m[1] === "-" ? -1 : 1;
  const horas = Number(m[2]);
  const minutos = m[3] !== undefined ? Number(m[3]) : 0;
  if (horas > 23 || minutos > 59) return null;
  return sinal * (horas * 60 + minutos) * 60_000;
}

/**
 * `sessao.quando` -> instante absoluto, ou `null` quando o texto não é uma
 * data ISO reconhecida OU quando a data civil é impossível (D5). Nunca
 * lança — a mesma disciplina de `quandoValido` em `progresso.ts`.
 */
function interpretarQuando(quando: string): Date | null {
  const texto = (quando || "").trim();
  if (texto === "") return null;

  const m = REGEX_QUANDO.exec(texto);
  if (!m) return null;

  const [, anoTxt, mesTxt, diaTxt, horaTxt, minutoTxt, segundoTxt, fracaoTxt, offsetTxt] = m;
  const ano = Number(anoTxt);
  const mes = Number(mesTxt);
  const dia = Number(diaTxt);
  if (!dataCivilValida(ano, mes, dia)) return null;

  const hora = horaTxt !== undefined ? Number(horaTxt) : 0;
  const minuto = minutoTxt !== undefined ? Number(minutoTxt) : 0;
  const segundo = segundoTxt !== undefined ? Number(segundoTxt) : 0;
  if (hora > 23 || minuto > 59 || segundo > 59) return null;
  const ms = fracaoParaMs(fracaoTxt);

  if (offsetTxt) {
    // Offset explícito: o texto já é um instante absoluto — só descontamos
    // o deslocamento informado da hora UTC "de fachada".
    const offsetMs = offsetParaMs(offsetTxt);
    if (offsetMs === null) return null;
    return new Date(Date.UTC(ano, mes - 1, dia, hora, minuto, segundo, ms) - offsetMs);
  }

  // Sem offset (só data, ou data+hora "flutuante"): hora de parede em São
  // Paulo — ver a decisão consciente no comentário acima desta função.
  // A fração é somada DEPOIS da conversão de fuso porque `paredeParaInstante`
  // trabalha em segundos: nenhum fuso do mundo tem deslocamento com fração de
  // segundo, então somar os ms ao instante já convertido dá exatamente o
  // mesmo resultado que convertê-los junto — e não obriga a mexer na
  // assinatura de uma função compartilhada com o leitor de ICS.
  const instante = paredeParaInstante(ano, mes, dia, hora, minuto, segundo, FUSO_BRASIL);
  return ms === 0 ? instante : new Date(instante.getTime() + ms);
}

/**
 * D4 — `duracaoMin` não-finito (`NaN`, `Infinity`, `-Infinity`) chegando em
 * `new Date(inicio + duracaoMs)` produz `Invalid Date`, e `.toISOString()`
 * de um `Invalid Date` LANÇA `RangeError` — contradizendo a promessa deste
 * módulo de nunca lançar. Um valor não-finito não é "uma duração muito
 * longa", é ausência de duração utilizável (dado corrompido, coluna
 * numérica que por algum caminho recebeu um cálculo que dividiu por zero
 * antes de chegar aqui) — tratado como 0, mesmo espírito de
 * `previstasValida` em `progresso.ts`: dado ruim vira o valor neutro, não
 * lança e não inventa um número diferente de zero.
 *
 * D4 RESIDUAL — não bastava exigir `Number.isFinite`: `duracaoMin = 1e15`
 * é finito e ainda assim joga o fim para fora da faixa representável de
 * `Date` (ECMA-262 limita o valor de tempo a ±8,64e15 ms, ~100 milhões de
 * dias a partir da época). O `Date` resultante é inválido e `.toISOString()`
 * volta a lançar `RangeError` — exatamente o que o comentário acima promete
 * que não acontece. Por isso a checagem é feita sobre o INSTANTE DE FIM
 * calculado, não sobre a duração de entrada: é o fim que precisa caber em
 * `Date`, e um teto arbitrário em minutos ("no máximo 24h") inventaria uma
 * regra de negócio que ninguém pediu. Fim fora da faixa cai no mesmo valor
 * neutro dos não-finitos: duração zero.
 */
const LIMITE_TEMPO_DATE = 8.64e15;

function fimDe(inicio: Date, duracaoMin: number): Date {
  const inicioMs = inicio.getTime();
  if (!Number.isFinite(duracaoMin)) return new Date(inicioMs);

  const fimMs = inicioMs + Math.max(0, duracaoMin) * 60_000;
  if (!Number.isFinite(fimMs) || Math.abs(fimMs) > LIMITE_TEMPO_DATE) return new Date(inicioMs);
  return new Date(fimMs);
}

/**
 * Primeiro nome de `mentorado.nome` — mesma regra já usada em
 * `src/lib/whatsapp.ts` (`mensagemReativacao`): o resto do produto já
 * trata "primeiro nome" como "o que vem antes do primeiro espaço", sem
 * lista de exceção (não filtra "de"/"da" etc.) porque não existe base
 * confiável para separar sobrenome de nome do meio em texto livre.
 * `nome` vazio (dado ruim) devolve "" — quem monta o título decide o que
 * fazer com "" (ver `tituloDaSessao`), nunca inventa um nome.
 */
function primeiroNomeDe(nome: string): string {
  return (nome || "").trim().split(/\s+/)[0] ?? "";
}

/**
 * DECISÃO DE PROJETO — como o título fica quando `numero` é `null`:
 * `Sessao.numero` é anulável no tipo (ver comentário em `tipos.ts`: sessão
 * avulsa, ainda sem número comunicado pelo mentor, ou dado antigo sem essa
 * coluna preenchida). Em vez de imprimir "sessão null" ou inventar um
 * número, o título simplesmente OMITE o trecho "sessão N" — o primeiro
 * nome e o horário (que já identificam o evento de forma única na agenda)
 * seguem aparecendo, mesma disciplina de "nunca inventar número" de
 * `progresso.ts`.
 */
function tituloDaSessao(sessao: Sessao, mentorado: Mentorado, inicio: Date): string {
  const primeiroNome = primeiroNomeDe(mentorado.nome) || "Mentoria";
  const quando = dataHoraCurtaSp(inicio);
  // Mesmo guarda de `descricaoDaSessao`: número só entra no texto se for
  // inteiro de verdade (ver `numeroImprimivel`).
  const numero = numeroImprimivel(sessao);

  return numero === null
    ? `${primeiroNome} — ${quando}`
    : `${primeiroNome} — sessão ${numero} — ${quando}`;
}

/**
 * REGRA DO VOCABULÁRIO FECHADO — a descrição do evento NUNCA carrega:
 *   - e-mail de terceiro (`mentorado.email`, ou qualquer outro);
 *   - telefone (`mentorado.telefone`);
 *   - valor de contrato (`programa.preco`);
 *   - link de gravação (`sessao.linkGravacao`).
 *
 * PORTA FECHADA — NÃO REABRIR (histórico completo, porque sem ele alguém
 * "melhora" isto de volta em seis meses):
 *
 * 1ª versão: a descrição usava `programa.nome`, com o argumento de que nome
 * de produto não é dado sensível. Falso: `programa.nome` é TEXTO LIVRE sem
 * CHECK no banco (`0006`: `nome text not null`), e o mentor nomeia o
 * programa do jeito que fala — "Elite R$ 5.000", "Turma do
 * contato@raro.com", "Grupo 11987654321", ou com um link colado dentro.
 * Campo "seguro" que CONTÉM o dado perigoso vaza igual.
 *
 * 2ª versão: filtrar `programa.nome` por regex de lista negra
 * (`/@|r\$|https?:\/\/|\d{4,}/i`) e omitir a cláusula inteira quando
 * batesse. Reprovada — e o motivo é ESTRUTURAL, não um buraco a mais para
 * tapar. A única defesa numérica era `\d{4,}`, e MOEDA EM FORMATO
 * BRASILEIRO NUNCA TEM 4 DÍGITOS CONSECUTIVOS: o separador de milhar quebra
 * a sequência sempre. Passavam ilesos "Elite 5.000,00", "Elite 1.000.000,00",
 * "Elite 12x de 900 reais" (valor por extenso), "Elite R $ 5.000" (espaço
 * dentro do símbolo), e, do lado dos links, "drive.google.com/gravacao" e
 * "www.x.com/gravacao" — domínio sem esquema não casa com `https?://`,
 * embora todo app de calendário o transforme em link clicável no celular.
 * Num produto brasileiro, aquele filtro era praticamente inoperante contra
 * o primeiro item da lista. Cada rodada de revisão derrubava o filtro com
 * um exemplo novo: o problema é que "filtrar texto livre" é uma aposta
 * infinita contra a criatividade de quem digita.
 *
 * 3ª versão (esta): NÃO EXISTE CAMINHO DE TEXTO LIVRE ATÉ A DESCRIÇÃO. Ela
 * é montada só com (a) strings LITERAIS deste arquivo, (b) `sessao.numero`,
 * que é número e passa por `Number.isInteger` antes de virar texto, e
 * (c) `programa.formato`, que é uma união fechada de três valores
 * (`FormatoPrograma` em `tipos.ts`, espelhando `create type
 * formato_programa` do 0006) e aqui só serve de CHAVE para escolher um
 * rótulo literal — o valor recebido nunca é impresso. Nenhum campo de
 * texto livre de nenhuma entidade entra: nem `programa.nome`, nem
 * `mentorado.nome`, nem `resumo`, nem `transcricao`, nem `linkGravacao`.
 * A garantia deixa de ser um filtro que se prova errado com um exemplo novo
 * e passa a ser estrutural: para vazar, alguém teria que ACRESCENTAR um
 * campo de texto livre aqui — e aí o teste de igualdade exata da descrição
 * quebra na hora.
 *
 * O preço aceito: o nome do programa não aparece mais no evento. O mentor
 * já sabe qual programa é pelo título (primeiro nome + número da sessão) e
 * pelo próprio produto; o calendário sincroniza para fora, o produto não.
 */
const ROTULO_FORMATO: ReadonlyMap<string, string> = new Map([
  ["individual", "individual"],
  ["turma", "em turma"],
  ["online", "online"],
]);

/**
 * `sessao.numero` como número seguro de imprimir, ou `null`. O tipo já diz
 * `number | null`, mas esta camada não roda validação de schema em runtime
 * (mesmo raciocínio de `quandoValido` em `progresso.ts`): um JSON com
 * `numero: "8 — combinar R$ 5.000"` passaria pelo `!== null`. `Number.isInteger`
 * é o que garante que só um INTEIRO chega ao texto — é o que sustenta a
 * promessa de vocabulário fechado, não uma paranoia de tipo.
 */
function numeroImprimivel(sessao: Sessao): number | null {
  const numero = sessao.numero;
  return numero !== null && Number.isInteger(numero) ? numero : null;
}

function descricaoDaSessao(sessao: Sessao, programa: Programa): string {
  const partes = ["Sessão de mentoria"];

  // `Map#get` (e não indexação de objeto) de propósito: chave desconhecida
  // devolve `undefined` sem esbarrar em `Object.prototype` — um `formato`
  // corrompido com "constructor" não tem como render texto vindo do
  // protótipo. Formato não reconhecido simplesmente OMITE o rótulo, em vez
  // de cair num padrão: dizer "individual" numa sessão que talvez não seja
  // é inventar dado (ver a regra em `progresso.ts`).
  const rotuloFormato = ROTULO_FORMATO.get(programa.formato);
  if (rotuloFormato !== undefined) partes.push(rotuloFormato);

  const numero = numeroImprimivel(sessao);
  if (numero !== null) partes.push(`(sessão ${numero})`);

  return partes.join(" ");
}

/**
 * REGRA TURMA — sessão de turma (`turmaId` preenchido, `matriculaId` nulo,
 * ver a CHECK `sessao_vinculo_unico` documentada em `tipos.ts`) NUNCA gera
 * convidado individual. Um evento de aula em grupo com a lista de e-mails
 * de TODA a turma no campo de convidados expõe a carteira inteira — cada
 * participante veria o e-mail de todos os colegas — para resolver um
 * problema que nem existe: convite de turma se resolve por outro caminho
 * (grupo de WhatsApp, link fixo), não por convidado individual no evento.
 * Por isso esta função nem recebe a lista de mentorados da turma — só o
 * `Mentorado` de UMA matrícula 1:1, e só usa o e-mail dele quando a sessão
 * é, de fato, 1:1.
 *
 * E-mail vazio/em branco (dado ruim: mentorado sem e-mail cadastrado ainda)
 * também não vira convidado — "" não é um endereço, e mandar convite para
 * "" não é hipótese, é erro silencioso de outra camada (ver "nunca
 * inventar número" — o mesmo vale para "nunca inventar destinatário").
 */
function convidadosDaSessao(sessao: Sessao, mentorado: Mentorado): string[] {
  if (sessao.turmaId !== null) return [];

  const email = mentorado.email.trim();
  return email === "" ? [] : [email];
}

/**
 * Evento de calendário pronto a partir de uma sessão — ver `EventoDeCalendario`
 * para o formato de saída.
 *
 * DECISÃO DE PROJETO — retorno `EventoDeCalendario | null`: `sessao.quando`
 * é `timestamptz not null` no banco, mas nada nesta camada garante isso em
 * runtime (mesmo raciocínio de `quandoValido` em `progresso.ts`) — uma data
 * vazia, não reconhecida, ou civilmente impossível (D5) não pode virar um
 * evento com `DTSTART` quebrado espalhado pela agenda de alguém. `null`
 * aqui é a mesma resposta honesta de "não tenho dado suficiente para
 * isto", não uma exceção: quem chama já teve que aprender essa convenção
 * com `proximaSessao`/`ultimaSessaoRealizada`.
 *
 * REGRA FIM — `fimIso` é sempre `quando + duracaoMin` minutos, incluindo o
 * caso `duracaoMin === 0` (ou não-finito, D4, tratado como 0): em vez de
 * cair num `Date` inválido ou inventar uma duração mínima que ninguém
 * informou, o evento nasce com início e fim no MESMO instante (evento de
 * duração zero é um caso real: sessão cancelada em cima da hora cujo
 * registro ainda quer marcar o horário na agenda, por exemplo) — nunca
 * lança, nunca produz `Invalid Date`.
 */
export function eventoDaSessao(
  sessao: Sessao,
  mentorado: Mentorado,
  programa: Programa,
): EventoDeCalendario | null {
  const inicio = interpretarQuando(sessao.quando);
  if (inicio === null) return null;

  const fim = fimDe(inicio, sessao.duracaoMin);

  return {
    titulo: tituloDaSessao(sessao, mentorado, inicio),
    descricao: descricaoDaSessao(sessao, programa),
    inicioIso: inicio.toISOString(),
    fimIso: fim.toISOString(),
    convidados: convidadosDaSessao(sessao, mentorado),
  };
}
