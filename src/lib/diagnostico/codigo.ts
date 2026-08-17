// O código do diagnóstico — módulo puro, sem I/O e sem banco.
//
// O QUE ESTE CÓDIGO É
// -------------------
// A landing faz cinco perguntas e devolve à pessoa uma mensagem de WhatsApp
// pronta, com uma etiqueta no fim:
//
//     [JR-B1-T5-3-K7QM]
//      │  ││  │  │  └── sufixo sorteado: identidade
//      │  ││  │  └───── quantas coisas ela começou e não terminou (0 a 3)
//      │  ││  └──────── a trava que ela declarou (T1..T7)
//      │  │└─────────── quando quer começar (1 = essa semana .. 4 = pesquisando)
//      │  └──────────── faixa de faturamento (A, B, C)
//      └─────────────── prefixo fixo do projeto
//
// POR QUE SEGMENTO E IDENTIDADE VIAJAM JUNTOS, E POR QUE ISSO QUASE DEU ERRADO
// ---------------------------------------------------------------------------
// A primeira versão do código era só o segmento: `JR-B1-T5-3`. Ele é legível
// no celular, que era o objetivo — o Jefson lê o perfil antes de abrir o
// sistema. Mas segmento não é identidade: dois donos diferentes que respondem
// as mesmas cinco perguntas produzem a MESMA etiqueta. Com o código como chave
// única do lado do servidor, o segundo lead seria descartado pelo
// `on conflict do nothing` — sem erro, sem log, sem ninguém notar. O sufixo de
// quatro caracteres separa as duas funções: o miolo continua legível, e a
// ponta garante que cada preenchimento é um registro.
//
// O alfabeto do sufixo não tem 0, O, 1 nem I. Este código é lido em voz alta
// e digitado à mão quando o sistema está fora do ar — é a rota de degradação
// inteira do funil, e ela não pode depender de distinguir zero de ó.
//
// POR QUE DETERMINÍSTICO, SEM IA
// ------------------------------
// A regra da porta e do quarto (abaixo) decide qual abordagem o Jefson usa.
// Feita por modelo de linguagem, ela varia entre um lead e outro e nenhuma
// conversão pode ser atribuída. Feita aqui, ela é a mesma todas as vezes:
// quando uma abordagem converter melhor, dá para saber qual foi, porque ela
// foi idêntica em todos os leads daquele segmento. Custo zero, resultado
// auditável, e um teste de unidade cobre o comportamento inteiro.

/** As sete travas da persona (`01-persona.md`), na ordem em que aparecem. */
export type Trava = "T1" | "T2" | "T3" | "T4" | "T5" | "T6" | "T7";

/** Faixa de faturamento de quem passa no critério. */
export type Faixa = "A" | "B" | "C";

/**
 * Por que alguém não passou. `F` fatura até R$ 1 milhão, `G` é diretor ou
 * gerente (não decide a compra), `N` ainda vai abrir a empresa.
 */
export type MotivoRecusa = "F" | "G" | "N";

/** Quando quer começar: 1 essa semana, 2 em 30 dias, 3 no trimestre, 4 pesquisando. */
export type Urgencia = 1 | 2 | 3 | 4;

/** Quantas coisas ficaram pela metade em 12 meses. */
export type Inacabados = 0 | 1 | 2 | 3;

export interface Segmento {
  faixa: Faixa;
  urgencia: Urgencia;
  /** A PORTA: o que ele disse que trava. É por aqui que a conversa começa. */
  travaDeclarada: Trava;
  /** O QUARTO: o que a mentoria resolve. Nem sempre é o mesmo. */
  travaDeTrabalho: Trava;
  inacabados: Inacabados;
  /** `true` quando a porta e o quarto são cômodos diferentes. */
  atravessar: boolean;
  /** A identidade do preenchimento, separada do segmento. */
  sufixo: string;
  /** O código inteiro, como veio. */
  codigo: string;
}

export interface Recusa {
  motivo: MotivoRecusa;
  sufixo: string;
  codigo: string;
}

// O alfabeto exato da landing: 32 caracteres, sem 0, O, 1 nem I. Escrito como
// classe explícita porque `[A-Z2-9]` INCLUI o O e o I — e um sufixo com eles
// seria aceito aqui e impossível de ditar por telefone lá.
const SUFIXO = "[2-9A-HJ-NP-Z]{4}";
const QUALIFICADO = new RegExp(`^JR-([ABC])([1-4])-T([1-7])-([0-3])-(${SUFIXO})$`);
const RECUSADO = new RegExp(`^JR-([FGN])-(${SUFIXO})$`);

// No texto da mensagem o código vem entre colchetes. Só o formato qualificado
// aparece aqui de propósito: quem não passou no critério nunca recebe botão de
// WhatsApp, então um código de recusa dentro de uma mensagem é sinal de que
// alguém montou o texto à mão — e casar com ele daria ao lead recusado um
// atendimento que a landing acabou de dizer que ele não teria.
const NO_TEXTO = new RegExp(`\\[(JR-[ABC][1-4]-T[1-7]-[0-3]-${SUFIXO})\\]`);

/**
 * Extrai o código do diagnóstico de dentro do texto de uma mensagem.
 * `null` quando a mensagem não carrega nenhum — que é o caso da maioria
 * absoluta das mensagens que chegam no WhatsApp do Jefson.
 */
export function lerCodigo(texto: string): string | null {
  if (typeof texto !== "string") return null;
  const m = texto.toUpperCase().match(NO_TEXTO);
  return m ? m[1] : null;
}

/**
 * O segmento derivado do código, sem consultar o banco.
 *
 * É esta função que decide a porta e o quarto. `null` quando o código não é
 * de alguém qualificado (formato errado, ou código de recusa) — e nesse caso
 * quem chamou não deve inventar um segmento.
 */
export function lerSegmento(codigo: string): Segmento | null {
  if (typeof codigo !== "string") return null;
  const m = codigo.toUpperCase().match(QUALIFICADO);
  if (!m) return null;

  const faixa = m[1] as Faixa;
  const urgencia = Number(m[2]) as Urgencia;
  const declarada = `T${m[3]}` as Trava;
  const inacabados = Number(m[4]) as Inacabados;

  // A REGRA QUE MAIS IMPORTA NESTE ARQUIVO.
  //
  // A pergunta 4 mede a trava do posicionamento — o ciclo interrompido (T3) —
  // independente do que a pessoa declarou na pergunta 3. Quem deixou três ou
  // mais coisas pela metade tem esse ciclo rodando mesmo tendo apontado outra
  // coisa. O cara que diz "tudo passa por mim" (T1) e perdeu a conta de
  // quantas coisas começou JÁ TENTOU DELEGAR, provavelmente mais de uma vez:
  // vender solução de delegação para ele é vender a coisa que já falhou, e a
  // segunda falha é definitiva, porque aí ele conclui que o problema é ele.
  //
  // Então a conversa abre pela porta que ele apontou (senão ele não se sente
  // ouvido) e entrega pelo quarto (senão não funciona).
  const atravessar = inacabados >= 2 && declarada !== "T3";
  const travaDeTrabalho: Trava = atravessar ? "T3" : declarada;

  return {
    faixa,
    urgencia,
    travaDeclarada: declarada,
    travaDeTrabalho,
    inacabados,
    atravessar,
    sufixo: m[5],
    codigo: m[0],
  };
}

/** O código de quem não passou no critério, ou `null` se não for um. */
export function lerRecusa(codigo: string): Recusa | null {
  if (typeof codigo !== "string") return null;
  const m = codigo.toUpperCase().match(RECUSADO);
  if (!m) return null;
  return { motivo: m[1] as MotivoRecusa, sufixo: m[2], codigo: m[0] };
}

/** `true` para qualquer código que este projeto emite — qualificado ou não. */
export function codigoValido(codigo: string): boolean {
  return lerSegmento(codigo) !== null || lerRecusa(codigo) !== null;
}

export const FAIXA_TEXTO: Record<Faixa, string> = {
  A: "R$ 1 a 3 milhões/ano",
  B: "R$ 3 a 10 milhões/ano",
  C: "acima de R$ 10 milhões/ano",
};

export const RECUSA_TEXTO: Record<MotivoRecusa, string> = {
  F: "fatura até R$ 1 milhão/ano",
  G: "é diretor ou gerente, não decide a compra",
  N: "ainda vai abrir a empresa",
};

export const TRAVA_TEXTO: Record<Trava, string> = {
  T1: "O gargalo — tudo passa por ele",
  T2: "A culpa de prosperar — medo de cobrar mais caro",
  T3: "O ciclo interrompido — começa e não termina",
  T4: "A cegueira do número — fatura e não sabe o que sobra",
  T5: "O técnico disfarçado de dono — ainda faz o operacional",
  T6: "A solidão do dono — decide tudo sozinho",
  T7: "A agenda como fuga — operação ocupa o dia inteiro",
};

export const INACABADOS_TEXTO: Record<Inacabados, string> = {
  0: "não deixou nada pela metade",
  1: "deixou uma ou duas coisas pela metade",
  2: "deixou três ou quatro coisas pela metade",
  3: "perdeu a conta do que começou e não terminou",
};

export interface Fila {
  /** 1 responde primeiro. Menor é mais urgente. */
  prioridade: 1 | 2 | 3 | 4;
  prazo: string;
  temperatura: "quente" | "morno" | "frio";
  /** `false` para quem só está pesquisando: entra na lista, sem abordagem. */
  abordarAgora: boolean;
}

/**
 * A ordem da fila, derivada só da urgência.
 *
 * A FAIXA NÃO ENTRA AQUI, DE PROPÓSITO. Ela muda preço e formato no
 * fechamento; deixar o lead de R$ 10 milhões furar a fila do lead de R$ 2
 * milhões é o começo de um atendimento que trata pessoa por tamanho de
 * carteira — e o dono percebe isso na primeira resposta.
 */
export function lerFila(urgencia: Urgencia): Fila {
  switch (urgencia) {
    case 1:
      // Ele disse "já passou da hora". Duas horas depois, passou da vontade
      // também — é a única linha da fila com prazo medido em horas.
      return { prioridade: 1, prazo: "mesmo dia, até 2 horas", temperatura: "quente", abordarAgora: true };
    case 2:
      return { prioridade: 2, prazo: "mesmo dia", temperatura: "quente", abordarAgora: true };
    case 3:
      // Está planejando o trimestre. Resposta rápida demais parece desespero.
      return { prioridade: 3, prazo: "até 48 horas", temperatura: "morno", abordarAgora: true };
    default:
      // Abordagem comercial em quem está pesquisando queima o contato para
      // depois. Ele entra na lista e recebe conteúdo, não proposta.
      return { prioridade: 4, prazo: "entra na lista, sem abordagem comercial", temperatura: "frio", abordarAgora: false };
  }
}

/**
 * O segmento em uma linha, para quem vai ler no celular.
 * Ex.: `R$ 3 a 10 milhões/ano · T5 pela porta, T3 no quarto · essa semana`.
 */
export function resumirSegmento(s: Segmento): string {
  const quando = ["", "essa semana", "nos próximos 30 dias", "esse trimestre", "só pesquisando"][s.urgencia];
  const travas = s.atravessar
    ? `${s.travaDeclarada} pela porta, ${s.travaDeTrabalho} no quarto`
    : `${s.travaDeclarada}`;
  return `${FAIXA_TEXTO[s.faixa]} · ${travas} · ${quando}`;
}
