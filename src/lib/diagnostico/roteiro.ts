// O roteiro de atendimento: o que a ficha do lead mostra, por trava, por faixa
// e por urgência.
//
// POR QUE ISTO É CÓDIGO, E NÃO CONTEÚDO GERADO NA HORA
// ----------------------------------------------------
// A tentação óbvia é pedir a um modelo de linguagem a primeira mensagem para
// cada lead. Três motivos para não fazer isso, e nenhum deles é custo:
//
//   1. Varia. Dois leads do mesmo segmento recebem abordagens diferentes, e
//      quando um fecha ninguém sabe se foi o segmento ou a redação daquele dia.
//   2. Não dá para revisar. Este texto vai sair no WhatsApp do Jefson, com o
//      nome dele embaixo. Texto que ninguém leu antes de existir é texto que
//      ele descobre junto com o cliente.
//   3. Não tem histórico. Aqui cada palavra tem commit, autor e data — e a
//      mudança de uma frase aparece no diff ao lado do resultado que veio
//      depois dela.
//
// POR QUE AQUI E NÃO EM UMA TABELA DO BANCO
// -----------------------------------------
// O desenho original previa uma tabela `abordagem` com sete linhas, populada
// por migração. Em TypeScript o mesmo texto continua versionado e revisado
// como código — que era o ponto — e ganha três coisas que a tabela não dava:
// tipo (uma trava faltando não compila), teste (o arquivo abaixo prova que os
// sete blocos existem inteiros) e leitura sem banco (a ficha renderiza mesmo
// em modo vazio). Quando existir tela de edição para o Jefson, a tabela entra
// e este arquivo vira o seed dela.
//
// FONTE: `Outputs/06-abordagem-e-oferta.md`, no vault. Quando os dois
// divergirem, o documento manda — ele é onde a decisão foi tomada.

import type { Faixa, Trava, Urgencia } from "./codigo";

export interface Abordagem {
  /** Como a trava se chama na persona. */
  titulo: string;
  /** A frase dele, do jeito que ele diria. */
  frase: string;
  /**
   * A primeira mensagem, para copiar e mandar.
   * Ela NUNCA vende, nunca faz pergunta de descoberta e nunca agradece o
   * contato: devolve, em uma frase, algo que ele não contou. É o diagnóstico
   * ao vivo, por escrito, em quinze segundos.
   */
  primeiraMensagem: string;
  /** A pergunta da segunda troca. */
  aprofundar: string;
  /** O que a resposta dele significa — a parte que não se improvisa. */
  ouvir: string;
  prova: string;
  /** Arquivo em `Ferramentas/`, no vault. */
  ferramenta: string;
  anguloDeFechamento: string;
  /** A frase que fecha a conversa. Vale mais que todas as outras juntas. */
  naoDizer: string;
}

export const ABORDAGEM: Record<Trava, Abordagem> = {
  T1: {
    titulo: "O gargalo",
    frase: "Tudo passa por mim. Ninguém decide nada sem me perguntar.",
    primeiraMensagem:
      "Pelo que você respondeu eu já consigo te dizer uma coisa: o teto do seu faturamento hoje " +
      "não é mercado, não é time e não é preço. É a sua agenda. A empresa cresce até onde uma " +
      "pessoa consegue decidir, e para ali.",
    aprofundar: "Quando você viaja três dias, o que acontece?",
    ouvir:
      "Se ele diz “para tudo”, é T1 puro. Se diz “roda, mas nada anda”, é T1 com T3 por baixo — " +
      "ninguém toma decisão nova porque decisão nova nunca chega ao fim.",
    prova: "A matriz de alçada. Mostre a folha e diga que o primeiro exercício é escrever o que ele já autoriza no automático.",
    ferramenta: "matriz-de-alcada.md",
    anguloDeFechamento:
      "Devolver semana. Não “crescer”: ele não acredita que vai crescer, ele acredita que vai morrer cansado.",
    naoDizer:
      "“Você precisa aprender a delegar.” Ele já ouviu, já tentou, e ouvir de novo confirma que você é igual aos outros.",
  },

  T2: {
    titulo: "A culpa de prosperar",
    frase: "Tenho medo de cobrar mais caro e perder cliente antigo.",
    primeiraMensagem:
      "Você marcou medo de cobrar mais e perder cliente antigo. Faz uma conta rápida antes da " +
      "gente conversar: quanto tempo faz que o seu preço está parado, e quantos dissídios teve " +
      "nesse meio tempo. O número costuma assustar mais que a conversa de reajuste.",
    aprofundar: "Seu pai tinha negócio próprio?",
    ouvir:
      "Essa pergunta abre rápido demais se for feita cedo — guarde para a terceira ou quarta troca. " +
      "Se a resposta for “tinha e quebrou”, você achou o contrato invisível e a conversa muda de patamar.",
    prova: "O caso do reajuste: 9% de aumento, dois clientes perdidos de quarenta, R$ 210 mil a mais no semestre.",
    ferramenta: "roteiro-conversa-de-reajuste.md",
    anguloDeFechamento:
      "Permissão com método. Ele não precisa de coragem, precisa de um roteiro e de alguém que já viu isso dar certo.",
    naoDizer: "“Você se desvaloriza.” Soa a diagnóstico de palco e ele fecha.",
  },

  T3: {
    titulo: "O ciclo interrompido",
    frase: "Eu começo as coisas com tudo e não termino.",
    primeiraMensagem:
      "Você foi direto no que quase ninguém admite. E eu vou te dizer uma coisa que você já sabe " +
      "e nunca ouviu de fora: não foi falta de disciplina nenhuma dessas vezes. Foi sempre a " +
      "mesma coisa acontecendo, e ela tem nome.",
    aprofundar: "Me conta a última que parou. Em que ponto foi?",
    ouvir:
      "O ponto é quase sempre o mesmo em todas as histórias dele. Nomear esse padrão na frente " +
      "dele é o momento de virada da conversa inteira.",
    prova: "O caso dos sete meses: mesmo projeto parado, entregue em 90 dias, e não foi por força de vontade.",
    ferramenta: "encerramento-de-projeto.md + tarefa-dos-7-dias.md",
    anguloDeFechamento:
      "Terminar uma coisa. Uma só, com data. NÃO prometa transformação — promessa grande é " +
      "exatamente o que ele já comprou e não terminou. A oferta tem que ser menor do que ele " +
      "espera, e é isso que a torna crível.",
    naoDizer:
      "Qualquer promessa que dependa de ele sustentar um hábito novo por mais de sete dias sem acompanhamento.",
  },

  T4: {
    titulo: "A cegueira do número",
    frase: "Faturo bem e não sei quanto realmente sobra.",
    primeiraMensagem:
      "Te faço uma pergunta antes de qualquer coisa: você olha o extrato ou olha o DRE? Se for o " +
      "extrato — e quase sempre é —, você está pilotando no retrovisor. Saldo em conta é o " +
      "dinheiro que ainda não foi embora, não o dinheiro que sobrou.",
    aprofundar: "Qual dos seus serviços dá mais margem? Não o que mais vende.",
    ouvir: "Se ele hesita, você achou. É o gancho para mandar a planilha ainda na conversa.",
    prova: "O serviço mais vendido era o do prejuízo, e ele descobriu no quarto ano.",
    ferramenta: "margem-por-servico.xlsx + dre-de-uma-pagina.md — MANDE NA HORA, dentro da conversa",
    anguloDeFechamento: "Decidir com número. Ele não quer relatório, quer parar de decidir no escuro.",
    naoDizer: "“Seu contador deveria.” Ele vai se defender do contador em vez de olhar o próprio número.",
  },

  T5: {
    titulo: "O técnico disfarçado de dono",
    frase: "Ainda faço o trabalho técnico que devia estar delegando.",
    primeiraMensagem:
      "O que você marcou tem um custo que quase ninguém calcula: a hora mais cara da sua empresa " +
      "está executando a tarefa mais barata. E o pior nem é o dinheiro — é que enquanto você " +
      "fizer, ninguém ao seu lado aprende a fazer.",
    aprofundar: "Qual cliente só confia em você?",
    ouvir:
      "Ele vai dar o nome na hora. Depois pergunte quanto esse cliente representa: quase sempre é " +
      "o de menor margem da carteira, e ele nunca fez essa conta.",
    prova: "“Eu segurei o atendimento dos clientes difíceis por dois anos e isso me custou o melhor técnico que eu tinha.”",
    ferramenta: "transferencia-de-cliente.md",
    anguloDeFechamento:
      "Virar dono de verdade. É identidade, não processo — e por isso a resistência é maior do que parece.",
    naoDizer:
      "“Você é o gargalo.” Verdadeiro, e soa como acusação para quem construiu a própria identidade em cima de ser bom com a mão.",
  },

  T6: {
    titulo: "A solidão do dono",
    frase: "Decido tudo sozinho. Não tenho com quem falar de número.",
    primeiraMensagem:
      "Você marcou que decide sozinho. Então te pergunto: quando foi a última vez que você falou " +
      "o número real do seu caixa em voz alta para alguém? Não o número que você fala nas " +
      "reuniões. O real.",
    aprofundar: "Sua esposa sabe o tamanho da dívida?",
    ouvir:
      "Só na segunda conversa, nunca na primeira. Se a resposta for não, essa é a conversa inteira, " +
      "e ela não termina em uma sessão.",
    prova:
      "Os catorze minutos: o dono que fatura R$ 6 milhões e levou catorze minutos para conseguir " +
      "dizer em voz alta que não sabia quanto tinha sobrado no ano.",
    ferramenta: "tres-numeros-da-mesa.md",
    anguloDeFechamento:
      "A SALA. Este é o único perfil em que a comunidade vende mais que a mentoria individual: o " +
      "que ele compra é um lugar onde pode dizer que não sabe, sem perder autoridade. Para os " +
      "outros seis a sala é benefício; para ele, é o produto.",
    naoDizer:
      "“Você precisa se abrir mais.” Ele foi ensinado a vida inteira do contrário, e essa frase soa como fraqueza vendida em pacote.",
  },

  T7: {
    titulo: "A agenda como fuga",
    frase: "Minha agenda é 100% operação. Não sobra tempo pra pensar.",
    primeiraMensagem:
      "Vou te devolver o que você escreveu de outro jeito: você não tem problema de tempo. Você " +
      "tem uma decisão que está sendo adiada, e a agenda cheia é o lugar mais confortável do " +
      "mundo para adiar. Ninguém cobra quem está ocupado.",
    aprofundar: "Se você tivesse dois blocos de 90 minutos livres essa semana, o que faria neles?",
    ouvir:
      "Se ele não souber responder, a trava não é agenda — é não saber por onde começar. E isso muda a conversa inteira.",
    prova: "De 62 para 41 horas por semana, e o faturamento subiu no trimestre seguinte.",
    ferramenta: "agenda-dois-blocos.md",
    anguloDeFechamento: "Recuperar horas de decisão. Concreto, contável, e ele confere sozinho na semana seguinte.",
    naoDizer: "“É questão de prioridade.” Ele sabe. Ouvir isso de fora é humilhante e não resolve.",
  },
};

/**
 * A ponte, quando a porta e o quarto são cômodos diferentes.
 *
 * Nunca pule direto para o passo 3: chegar rápido demais no diagnóstico certo
 * soa como script, e quem já comprou promessa antes reconhece script mais
 * rápido que qualquer um.
 */
export const ATRAVESSAR = {
  passo1: "Abra pela porta. Use a primeira mensagem da trava declarada, inteira. Ele precisa se sentir ouvido no que ele mesmo apontou.",
  passo2: "Na segunda ou terceira troca, pergunte: “Deixa eu te perguntar uma coisa fora do assunto. Você já tentou resolver isso antes?” — e depois: “E o que aconteceu?” Ele mesmo vai descrever a T3. NÃO complete a frase dele.",
  passo3:
    "Só então nomeie: “Então o problema não é [a trava declarada]. Você já sabia o que fazer. O " +
    "problema é que nada que você começa chega ao fim — e enquanto isso estiver de pé, qualquer " +
    "coisa que a gente montar aqui vai parar na primeira urgência igual parou as outras.”",
} as const;

export interface Oferta {
  perfil: string;
  formato: string;
  anguloDoPreco: string;
}

/** A faixa muda preço e formato. Nunca muda velocidade nem profundidade. */
export const OFERTA: Record<Faixa, Oferta> = {
  A: {
    perfil: "Dono ainda muito dentro da operação, caixa curto.",
    formato: "Programa mais curto, mais ferramenta, menos hora de sessão.",
    anguloDoPreco:
      "Ancorar no CUSTO DO PROBLEMA: a planilha de margem ou de ciclo de caixa mostra o vazamento, e a oferta é uma fração dele.",
  },
  B: {
    perfil: "Núcleo da persona.",
    formato: "O programa completo — sessões + comunidade.",
    anguloDoPreco: "Ancorar no CUSTO DO ADIAMENTO: o que mais um trimestre igual custa.",
  },
  C: {
    perfil: "Já tem estrutura; o gargalo é de decisão.",
    formato: "Individual, agenda própria, entrada direta na comunidade.",
    anguloDoPreco: "Ancorar em TEMPO DELE: preço por acesso e por prioridade, não por hora.",
  },
};

/**
 * Regra de ouro do preço, e ela não tem exceção: o número sai DEPOIS do
 * diagnóstico e sempre acompanhado do critério de entrada. Preço solto vira
 * comparação; preço com critério vira seleção.
 */
export const REGRA_DO_PRECO =
  "O número sai depois do diagnóstico, nunca antes, e sempre com o critério de entrada junto.";

/** O que a urgência muda na abordagem — não na velocidade, que é a fila. */
export const MODIFICADOR: Record<Urgencia, string> = {
  1: "Não construa desejo, ele já está pronto. MARQUE A CONVERSA NA PRIMEIRA RESPOSTA. O erro aqui é nutrir quem já decidiu.",
  2: "Diagnóstico por mensagem, proposta na semana.",
  3: "Entregue ferramenta e conteúdo. Retome no fechamento do mês, com o gancho de calendário da época.",
  4: "NÃO VENDA. Manda a ferramenta e entra na lista. Vender para quem está pesquisando queima um lead que voltaria sozinho em seis meses.",
};

/**
 * O que a landing entrega de graça a quem não passou no critério.
 *
 * Recusar bem é o que faz o critério de entrada valer alguma coisa — e é a
 * peça de conteúdo mais compartilhada que um funil desses produz, porque
 * ninguém espera ser recusado com presente.
 */
export const FERRAMENTAS_DA_RECUSA = [
  "margem-por-servico.xlsx",
  "ciclo-de-caixa.xlsx",
  "dre-de-uma-pagina.md",
] as const;
