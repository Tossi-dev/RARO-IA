// Temperatura do lead e nota de confiança — a CAMADA DE LEITURA.
//
// POR QUE ESTE ARQUIVO EXISTE, DEPOIS DE EU TER DITO QUE NÃO EXISTIRIA
// -------------------------------------------------------------------
// O cliente pediu para preservar temperatura e nota de confiança, e ele está
// certo: quem vende precisa saber para quem ligar primeiro. O que eu tinha
// dito, e continua valendo, é outra coisa — o problema nunca foi INTERPRETAR,
// foi MISTURAR interpretação com fato.
//
// Então a interpretação existe, e mora aqui, sozinha, com três regras que a
// mantêm honesta:
//
//   1. É SEMPRE DERIVADA, NUNCA GRAVADA. Nada aqui vira coluna editável na
//      ficha do cliente. A temperatura é recalculada dos fatos toda vez que
//      alguém olha. Ninguém "marca" um lead como quente na mão e esquece —
//      lead quente de três meses atrás é a mentira mais comum de CRM.
//
//   2. TODA LEITURA CARREGA O PORQUÊ. Cada resposta vem com a lista de fatos
//      observados que a produziram, com data. Se o dono discordar, ele vê
//      exatamente em cima de que a conta foi feita, em vez de discutir com
//      uma bolinha vermelha.
//
//   3. AUSÊNCIA DE DADO NÃO É FRIO. Quem nunca trocou uma mensagem não é um
//      lead frio: é um lead sobre o qual não se sabe nada. Frio é um veredito
//      (falou e esfriou); "sem sinal" é a confissão de que não há base. Tratar
//      os dois como a mesma coisa faz o dono desistir de gente que ele nunca
//      abordou.
//
// SOBRE A NOTA DE CONFIANÇA, E O QUE ELA NÃO É
// --------------------------------------------
// Ela NÃO é a confiança de um modelo de linguagem no próprio palpite — esse
// número não significa nada e o CRM que estudamos recusa por isso. Aqui a
// nota mede QUANTA EVIDÊNCIA sustenta a leitura: quantos fatos, de quão perto
// no tempo. Um único contato de dois meses atrás dá uma leitura de confiança
// baixa, e a tela precisa dizer isso — não porque o algoritmo é inseguro, mas
// porque a base é pequena mesmo.

/** A escala. `null` é "sem sinal" e nunca é confundido com frio. */
export type Temperatura = "quente" | "morno" | "frio" | "dormindo";

export interface LeituraDoLead {
  /** `null` quando não há nenhum fato observado — ausência não é veredito. */
  temperatura: Temperatura | null;
  /** 0–100: quanta evidência sustenta a leitura. `null` junto com temperatura nula. */
  confianca: number | null;
  /** Rótulo curto da confiança, para a tela não ter que interpretar número. */
  rotuloConfianca: "alta" | "média" | "baixa" | null;
  /** Os fatos que produziram a leitura, em linguagem de dono, já datados. */
  porque: string[];
  /** O que fazer com isso — sempre uma frase, nunca um comando automático. */
  sugestao: string;
  /** Dias desde o último sinal de vida, quando houve algum. */
  diasSemContato: number | null;
  /** O cliente falou por último e ninguém respondeu? É o sinal mais urgente. */
  esperandoResposta: boolean;
}

/**
 * O fato mínimo que esta camada precisa ler. Vem das interações do CRM.
 *
 * A terceira direção, "evento", existe por um motivo concreto: uma COMPRA não
 * é mensagem de ninguém. Registrá-la como "recebida" faria o cliente furar a
 * fila como se estivesse esperando resposta; como "enviada", a leitura diria
 * "última mensagem foi nossa" apontando para uma venda — uma frase falsa dita
 * com a mesma segurança das verdadeiras. Evento conta como sinal de vida e
 * sustenta confiança, mas nunca vira dívida de resposta nem se apresenta como
 * conversa.
 */
export interface FatoObservado {
  /** ISO datetime. */
  quando: string;
  /** "recebida" = o cliente falou; "enviada" = a empresa falou; "evento" = aconteceu algo que não é mensagem (compra, matrícula). */
  direcao: "recebida" | "enviada" | "evento";
  /** Compra registrada naquele momento, quando for o caso. */
  compra?: boolean;
}

// ---------------------------------------------------------------------------
// Os cortes. Ficam nomeados e num lugar só porque são decisão de NEGÓCIO, não
// de código: o dono pode discordar de "trinta dias é dormindo" e trocar, e a
// troca tem que ser numa linha, não caçada no meio de um if.
// ---------------------------------------------------------------------------
export const CORTES = {
  /** Falou com a gente há até tantos dias: está quente. */
  quenteAteDias: 3,
  /** Até tantos dias: morno. */
  mornoAteDias: 15,
  /** Até tantos dias: frio. Depois disso, dormindo. */
  frioAteDias: 60,
  /** Cliente esperando resposta há mais que isto vira urgência declarada. */
  esperaUrgenteHoras: 12,
} as const;

const DIA = 24 * 60 * 60 * 1000;

function dias(entre: number, e: number): number {
  return Math.floor((e - entre) / DIA);
}

function dataBR(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Lê a temperatura de um lead a partir dos fatos observados.
 *
 * `agora` entra por parâmetro (e não `new Date()` aqui dentro) para a função
 * ser determinística: o mesmo conjunto de fatos tem que dar a mesma leitura
 * hoje, no teste e daqui a um ano ao reprocessar histórico.
 */
export function lerTemperatura(fatos: FatoObservado[], agora: Date): LeituraDoLead {
  const validos = fatos
    .filter((f) => Number.isFinite(Date.parse(f.quando)))
    .sort((a, b) => Date.parse(a.quando) - Date.parse(b.quando));

  if (validos.length === 0) {
    return {
      temperatura: null,
      confianca: null,
      rotuloConfianca: null,
      porque: ["Nenhuma conversa registrada com esta pessoa."],
      sugestao: "Ainda não há base para dizer nada. O primeiro contato é que vai dizer.",
      diasSemContato: null,
      esperandoResposta: false,
    };
  }

  const t = agora.getTime();
  const ultimo = validos[validos.length - 1];
  const diasDesdeUltimo = dias(Date.parse(ultimo.quando), t);
  const horasDesdeUltimo = (t - Date.parse(ultimo.quando)) / (60 * 60 * 1000);
  const esperandoResposta = ultimo.direcao === "recebida";

  const ultimos30 = validos.filter((f) => dias(Date.parse(f.quando), t) <= 30);
  const recebidas30 = ultimos30.filter((f) => f.direcao === "recebida").length;
  const comprou = validos.some((f) => f.compra);

  const porque: string[] = [];
  const quandoTexto = diasDesdeUltimo === 0 ? "hoje" : `há ${diasDesdeUltimo} dia(s)`;
  porque.push(
    ultimo.direcao === "recebida"
      ? `Última mensagem foi dele, em ${dataBR(ultimo.quando)} — ${quandoTexto}.`
      : ultimo.direcao === "enviada"
        ? `Última mensagem foi nossa, em ${dataBR(ultimo.quando)} — ${quandoTexto}.`
        : `Último registro foi ${ultimo.compra ? "uma compra" : "um evento"}, em ${dataBR(ultimo.quando)} — ${quandoTexto}.`
  );
  if (recebidas30 > 0) porque.push(`${recebidas30} mensagem(ns) dele nos últimos 30 dias.`);
  if (comprou) porque.push("Já comprou pelo menos uma vez.");

  // ---- temperatura, por evento observado ----
  let temperatura: Temperatura;
  if (esperandoResposta && diasDesdeUltimo <= CORTES.frioAteDias) {
    // Cliente falou e ninguém respondeu. Isso é quente por definição, e
    // continua quente enquanto a bola estiver com a gente — é dívida nossa,
    // não desinteresse dele.
    temperatura = "quente";
    porque.push("A bola está com a gente: ele falou e ainda não teve resposta.");
  } else if (diasDesdeUltimo <= CORTES.quenteAteDias) temperatura = "quente";
  else if (diasDesdeUltimo <= CORTES.mornoAteDias) temperatura = "morno";
  else if (diasDesdeUltimo <= CORTES.frioAteDias) temperatura = "frio";
  else temperatura = "dormindo";

  // ---- confiança: quanta evidência sustenta a leitura ----
  //
  // Começa no volume de fatos e é PODADA pela idade do mais recente. Um único
  // contato antigo não pode produzir leitura confiante, por mais categórico
  // que o veredito pareça.
  let confianca = Math.min(65, validos.length * 15);
  if (recebidas30 >= 2) confianca += 20; // conversa de mão dupla e recente
  if (comprou) confianca += 15; // relação comprovada, não suposta
  if (diasDesdeUltimo > CORTES.frioAteDias) confianca -= 25; // sinal velho
  else if (diasDesdeUltimo > CORTES.mornoAteDias) confianca -= 10;
  if (validos.length === 1) confianca = Math.min(confianca, 40); // um fato só nunca é muita coisa
  confianca = Math.max(5, Math.min(100, Math.round(confianca)));

  const rotuloConfianca = confianca >= 70 ? "alta" : confianca >= 40 ? "média" : "baixa";

  // ---- sugestão: uma frase, nunca uma ação automática ----
  let sugestao: string;
  if (esperandoResposta && horasDesdeUltimo >= CORTES.esperaUrgenteHoras) {
    sugestao = "Responder hoje. Ele falou e está esperando há mais de meio dia.";
  } else if (esperandoResposta) {
    sugestao = "Responder — a última palavra foi dele.";
  } else if (temperatura === "quente" || temperatura === "morno") {
    sugestao = "Conversa em andamento. Só continue quando tiver algo a dizer.";
  } else if (temperatura === "frio") {
    sugestao = `Sem falar há ${diasDesdeUltimo} dias. Vale uma retomada com motivo, não um "oi, sumido".`;
  } else {
    sugestao = comprou
      ? "Cliente antigo parado. Retomada de quem já comprou costuma valer mais que lead novo."
      : "Parado há muito tempo. Decida se ainda faz sentido insistir.";
  }

  return {
    temperatura,
    confianca,
    rotuloConfianca,
    porque,
    sugestao,
    diasSemContato: diasDesdeUltimo,
    esperandoResposta,
  };
}

/** Rótulo e cor de cada temperatura, para a tela não inventar os seus. */
export const TEMPERATURA_ROTULO: Record<Temperatura, string> = {
  quente: "Quente",
  morno: "Morno",
  frio: "Frio",
  dormindo: "Dormindo",
};

/**
 * Ordem de atenção: quem aparece primeiro na fila do dia.
 *
 * Quente antes de morno é óbvio. O que não é óbvio, e é de propósito: quem
 * está ESPERANDO RESPOSTA fura a fila de qualquer temperatura. Deixar cliente
 * falando sozinho é o único erro deste sistema que o cliente final percebe.
 */
export function pesoDeAtencao(l: LeituraDoLead): number {
  // Quem espera HÁ MAIS TEMPO vem primeiro: a soma é com o tempo de espera,
  // não a subtração. Escrever ao contrário colocaria quem falou agora na
  // frente de quem está sem resposta há uma semana — exatamente o inverso do
  // que a regra existe para evitar.
  if (l.esperandoResposta) return 1000 + Math.min(999, l.diasSemContato ?? 0);
  const base: Record<Temperatura, number> = { quente: 400, morno: 300, frio: 200, dormindo: 100 };
  if (l.temperatura === null) return 0;
  return base[l.temperatura] + (l.confianca ?? 0) / 10;
}
