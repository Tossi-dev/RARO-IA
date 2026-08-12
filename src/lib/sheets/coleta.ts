// Contrato de COLETA -- a resposta, em codigo, para "de onde vem o dado e como
// ele chega ate aqui sem ninguem digitar".
//
// MODULO NEUTRO (sem diretiva de cliente): a tabela abaixo e valor de runtime
// lido por Server Components.
//
// Por que existir separado de `abas.ts`: `abas.ts` responde QUAL e o formato do
// dado (nome de aba, titulo de coluna). Este arquivo responde COMO o dado entra
// ali -- quem dispara, em que modo, e o que ainda falta para o caminho ficar de
// pe. Sao perguntas diferentes e mudam por motivos diferentes: um cabecalho muda
// quando o dono renomeia uma coluna; uma rota de coleta muda quando uma
// integracao e liberada.
//
// REGRA DE HONESTIDADE (a mesma que tirou o dado fabricado do sistema): uma rota
// so pode ser `ativa` quando o caminho INTEIRO existe hoje. Enquanto depender de
// credencial, de decisao do cliente ou de codigo nao escrito, ela e `pendente`
// ou `planejada` E declara o bloqueio em texto. Pintar de verde o que ainda nao
// funciona e a mesma mentira que numero inventado.

import { ABAS } from "./abas";

/**
 * `automatica`     -- nasce de evento externo, ninguem toca.
 * `semiautomatica` -- uma pessoa confirma uma vez; o sistema faz o resto.
 * `manual`         -- alguem digita o dado inteiro.
 */
export type ModoColeta = "automatica" | "semiautomatica" | "manual";

/**
 * `ativa`     -- funciona hoje, do gatilho ao destino.
 * `pendente`  -- o codigo existe; falta ligar uma credencial ou permissao.
 * `planejada` -- ainda depende de decisao ou de codigo a escrever.
 */
export type StatusColeta = "ativa" | "pendente" | "planejada";

export type RotaDeColeta = {
  id: string;
  nome: string;
  modo: ModoColeta;
  status: StatusColeta;
  /** O que dispara a entrada do dado, em linguagem de negocio. */
  gatilho: string;
  /** Abas que recebem linha por esta rota. */
  destino: string[];
  /** O caminho completo, do gatilho ate a linha gravada. */
  descricao: string;
  /** O que exatamente falta. Obrigatorio quando o status nao e `ativa`. */
  bloqueio?: string;
};

export const ROTAS_COLETA: RotaDeColeta[] = [
  {
    id: "planilha-direta",
    nome: "Digitacao na propria planilha",
    modo: "manual",
    status: "ativa",
    gatilho: "O dono abre a planilha e escreve a linha",
    destino: ABAS.filter((a) => a.papel === "entrada").map((a) => a.nome),
    descricao:
      "O caminho que ja existia antes do sistema. Continua valendo e continua sendo lido: qualquer linha escrita a mao na planilha aparece no painel em ate um minuto, sem passo nenhum. E o piso de garantia -- mesmo que toda automacao caia, o painel nunca fica sem fonte.",
  },
  {
    id: "formulario-sistema",
    nome: "Formulario do proprio sistema",
    modo: "semiautomatica",
    status: "pendente",
    gatilho: "Alguem preenche um formulario dentro do painel",
    destino: ["VENDAS", "RECEBIVEIS", "DESPESAS", "LEADS", "ALUNOS", "METAS"],
    descricao:
      "O operador digita uma vez, no painel, e o sistema grava a linha na aba certa da planilha com ID, timestamp e formato ja corretos. Tira do cliente a parte que ele erra: lembrar em qual aba vai, qual coluna e qual formato de data.",
    bloqueio:
      "Falta o Web App do Apps Script publicado na planilha do dono e a variavel RARO_SHEETS_WEBAPP_URL preenchida. Enquanto isso o sistema le, mas nao escreve.",
  },
  {
    id: "despesas-recorrentes",
    nome: "Despesa fixa que se lanca sozinha",
    modo: "automatica",
    status: "pendente",
    gatilho: "Chega o dia do vencimento configurado",
    destino: ["DESPESAS"],
    descricao:
      "A despesa fixa e cadastrada UMA vez em DESPESAS_RECORRENTES (aluguel, ferramenta, contador) e o sistema lanca a linha em DESPESAS todo mes, na data certa. Custo fixo esquecido derruba o ponto de equilibrio sem aviso -- e e a primeira coisa que se esquece de digitar.",
    bloqueio: "Depende da mesma escrita na planilha da rota do formulario.",
  },
  {
    id: "pix-confirmado",
    nome: "Pix confirmado vira venda",
    modo: "automatica",
    status: "planejada",
    gatilho: "O banco/PSP avisa que o Pix daquela cobranca caiu",
    destino: ["COBRANCAS", "VENDAS", "RECEBIVEIS", "INGESTAO"],
    descricao:
      "O sistema emite a cobranca Pix com um TxID proprio e fica ouvindo. Quando o pagamento cai, o evento pousa em INGESTAO, a linha de COBRANCAS muda para paga e a venda nasce em VENDAS com a parcela em RECEBIVEIS -- sem ninguem digitar. E o unico meio de recebimento do cliente, entao e aqui que a coleta automatica vale mais.",
    bloqueio:
      "Falta definir o caminho de confirmacao: API de banco (exige CNPJ), PSP que aceita pessoa fisica, ou agregador de Open Finance. A escolha depende de o Jefson ter ou nao CNPJ.",
  },
  {
    id: "whatsapp-lead",
    nome: "Mensagem no WhatsApp vira lead",
    modo: "automatica",
    status: "planejada",
    gatilho: "Uma pessoa manda a primeira mensagem no numero comercial",
    destino: ["LEADS", "ALUNOS", "INGESTAO"],
    descricao:
      "O webhook da API oficial do WhatsApp entrega a mensagem, o evento pousa em INGESTAO e vira um lead em LEADS com data, canal e etapa inicial -- e o contato em ALUNOS quando ja tem nome. Fecha o denominador da taxa de conversao, que hoje so existe se alguem anotar.",
    bloqueio: "Falta a conta da WhatsApp Cloud API do cliente e o numero comercial verificado.",
  },
  {
    id: "presencial",
    nome: "Conexao presencial",
    modo: "manual",
    status: "ativa",
    gatilho: "Uma conversa que aconteceu fora de qualquer sistema",
    destino: ["LEADS", "ALUNOS"],
    descricao:
      "Nao existe automacao honesta para um aperto de mao. O que da para fazer e reduzir o atrito: um formulario curto no painel, com data e canal ja preenchidos, para o registro levar segundos em vez de virar um bilhete perdido.",
  },
];

/** Rotas que alimentam uma aba. Vazio = nenhuma rota declarada ainda. */
export function rotasQueAlimentam(aba: string): RotaDeColeta[] {
  return ROTAS_COLETA.filter((r) => r.destino.includes(aba));
}

/**
 * A rota mais forte que alimenta a aba HOJE. "Mais forte" = a que menos exige
 * do cliente entre as que estao de pe: automatica ativa ganha de manual ativa,
 * e qualquer coisa ativa ganha de qualquer coisa pendente. E o que o painel
 * mostra quando so cabe uma linha.
 */
export function rotaPrincipal(aba: string): RotaDeColeta | null {
  const peso = (r: RotaDeColeta) =>
    (r.status === "ativa" ? 100 : r.status === "pendente" ? 50 : 10) +
    (r.modo === "automatica" ? 9 : r.modo === "semiautomatica" ? 5 : 1);
  const candidatas = rotasQueAlimentam(aba);
  if (candidatas.length === 0) return null;
  return candidatas.reduce((melhor, r) => (peso(r) > peso(melhor) ? r : melhor));
}

// ---------------------------------------------------------------------------
// CASAMENTO DE DADOS -- qual tela le quais abas.
//
// Sem esta tabela, a ligacao entre aba e tela so existe espalhada dentro do
// codigo de cada pagina, e a pergunta "se eu preencher VENDAS, o que muda no
// painel?" nao tem resposta na tela. Com ela, a resposta e navegavel nos dois
// sentidos: da aba para as telas que ela acende, e da tela para as abas que
// precisam existir.
// ---------------------------------------------------------------------------

export type TelaDoPainel = {
  href: string;
  rotulo: string;
  /** A pergunta de negocio que a tela responde. */
  pergunta: string;
  /** Abas lidas para montar a tela. */
  le: string[];
};

export const TELAS: TelaDoPainel[] = [
  {
    href: "/",
    rotulo: "Dashboard",
    pergunta: "Como o negocio esta agora, em uma tela?",
    le: ["VENDAS", "RECEBIVEIS", "DESPESAS", "LEADS", "METAS", "ALUNOS"],
  },
  {
    href: "/financeiro",
    rotulo: "Resultado",
    pergunta: "O ano esta dando lucro e batendo as metas?",
    le: ["VENDAS", "DESPESAS", "METAS", "PRODUTOS", "LANCAMENTOS", "ALUNOS"],
  },
  {
    href: "/financeiro/caixa",
    rotulo: "Fluxo de caixa",
    pergunta: "Sobrou ou faltou dinheiro no periodo, e por causa de que?",
    le: ["MOVIMENTOS", "CONTAS", "RECEBIVEIS", "DESPESAS"],
  },
  {
    href: "/financeiro/projecao",
    rotulo: "Projecao 13 semanas",
    pergunta: "Em que semana o caixa fica negativo se nada mudar?",
    le: ["MOVIMENTOS", "CONTAS", "RECEBIVEIS", "DESPESAS", "DESPESAS_RECORRENTES"],
  },
  {
    href: "/financeiro/dre",
    rotulo: "DRE gerencial",
    pergunta: "A operacao deu lucro no mes, independente de ja ter recebido?",
    le: ["VENDAS", "DESPESAS", "PRODUTOS", "CONFIG"],
  },
  {
    href: "/financeiro/capital-de-giro",
    rotulo: "Capital de giro",
    pergunta: "Quanto tenho a receber, quanto devo e quando cada um cai?",
    le: ["RECEBIVEIS", "DESPESAS", "COBRANCAS", "CONTAS"],
  },
  {
    href: "/financeiro/reembolsos",
    rotulo: "Reembolsos",
    pergunta: "Quanto do faturamento esta voltando, e por qual produto?",
    le: ["VENDAS", "PRODUTOS", "MOVIMENTOS", "RECEBIVEIS"],
  },
  {
    href: "/financeiro/comissoes",
    rotulo: "Comissoes",
    pergunta: "Quanto devo para a rede hoje e quem ja esta atrasado?",
    le: ["VENDAS", "RESPONSAVEIS", "MOVIMENTOS"],
  },
  {
    href: "/crm",
    rotulo: "Central de Clientes",
    pergunta: "Quem esta no funil e quem parou de andar?",
    le: ["LEADS", "ALUNOS", "ATIVIDADES", "TAREFAS", "VENDAS"],
  },
  {
    href: "/lancamentos",
    rotulo: "Lancamentos",
    pergunta: "Como foi cada janela de venda contra a meta dela?",
    le: ["LANCAMENTOS", "VENDAS", "PRODUTOS", "REUNIOES"],
  },
  {
    href: "/conteudo",
    rotulo: "Conteudo & Redes",
    pergunta: "Que conteudo trouxe gente, e nao so visualizacao?",
    le: ["CONTEUDOS", "CAMPANHAS", "LEADS"],
  },
];

/** Telas que acendem quando esta aba tem linha. */
export function telasQueUsam(aba: string): TelaDoPainel[] {
  return TELAS.filter((t) => t.le.includes(aba));
}

export const ROTULO_MODO: Record<ModoColeta, string> = {
  automatica: "Automatica",
  semiautomatica: "Semiautomatica",
  manual: "Manual",
};

export const ROTULO_STATUS: Record<StatusColeta, string> = {
  ativa: "Funcionando",
  pendente: "Falta ligar",
  planejada: "Planejada",
};
