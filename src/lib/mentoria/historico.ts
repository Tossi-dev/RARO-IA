// Histórico 360° — UMA linha do tempo só, para uma pessoa só.
//
// Hoje a vida de um mentorado está partida em duas telas: `/crm/[id]` mostra
// o que o time anotou (notas, atividades, conversas de WhatsApp) e
// `/mentoria/[id]` mostra o que a mentoria entregou (sessões, tarefas,
// marcos, score). Ninguém abre as duas ao mesmo tempo, e é entre elas que a
// informação some — o mentor liga sem saber que a pessoa mandou mensagem
// ontem, ou cobra uma tarefa de quem faltou à sessão. Este módulo junta as
// duas metades numa série ordenada só.
//
// Módulo PURO: nada de Next, nada de banco, nada de `new Date()`/`Date.now()`
// aqui dentro — `agoraIso` é sempre parâmetro, pelo mesmo motivo escrito no
// topo de `progresso.ts` (um resultado que muda sozinho com o relógio da
// máquina não é auditável, e o teste escrito hoje quebraria sozinho daqui a
// um ano). Quem lê as listas do banco é a tarefa 10 (`dados-historico.ts`);
// aqui só entram listas já lidas.
//
// ============================================================
// A REGRA QUE MANDA NESTE ARQUIVO: VISIBILIDADE É PROPRIEDADE DO TIPO
// ============================================================
//
// Cada fato nasce `interno` ou `publico`, e essa classificação é uma função
// PURA DO TIPO — está declarada uma vez em `VISIBILIDADE_POR_TIPO` e em lugar
// nenhum mais. Não é preciosismo: se a visibilidade fosse decidida caso a
// caso, dentro de cada construtor, a pergunta "o que o mentorado vê?" não
// teria resposta legível em lugar nenhum, e a resposta certa só existiria
// espalhada por doze `if`. Do jeito que está, a tabela é a resposta, o
// TypeScript exige que ela seja exaustiva (`Record<TipoFato, …>`: tipo novo
// sem classificação nem compila) e o teste exige que todo tipo declarado seja
// realmente construído por alguém.
//
// `projetarParaPortal` é o portão, e ele é FAIL-CLOSED em dois sentidos:
// tipo que o módulo não conhece não passa (nem carimbado de público), e fato
// cujo carimbo `visibilidade` discorda da classificação do seu tipo também
// não passa. Os dois têm que concordar — desacordo é sinal de dado forjado ou
// de refactor pela metade, e nos dois casos a resposta segura é não mostrar.
//
// ============================================================
// O QUE ESTE MÓDULO NÃO PROMETE
// ============================================================
//
// `higienizarTextoPublico` tira telefone, e-mail e valor em reais do texto
// livre que vai ao portal. É DEFESA EM PROFUNDIDADE, não a garantia: valor
// escrito por extenso ("cinco mil"), apelido de cliente, endereço — nada
// disso uma expressão regular alcança. A garantia de verdade é a
// classificação: cobrança, nota de CRM, temperatura de lead e documento
// fechado nunca chegam ao portão, porque nascem `interno`. O higienizador
// existe para o caso em que o texto público (o resumo que o mentor digitou na
// sessão) carrega, sem querer, o telefone de alguém.

import { lerTemperatura, TEMPERATURA_ROTULO, type FatoObservado } from "../atendimento/temperatura";
import { fmtBRL, fmtDate } from "../format";
import { statusSessaoDe } from "./tipos";
import type { ConteudoLiberado, Marco, ScoreEvolucao, Sessao, TarefaMentoria } from "./tipos";
import type { Atividade, Interacao, Nota } from "../types";
import type { Documento } from "../documentos/dados";

// ============================================================
// Contrato
// ============================================================

export type VisibilidadeFato = "interno" | "publico";

/**
 * Os tipos de fato que existem. **A ORDEM DESTE ARRAY É O DESEMPATE** de dois
 * fatos no mesmo instante (ver `compararFatos`) — está escrita na ordem em
 * que uma pessoa quer ler as coisas quando tudo aconteceu junto: primeiro a
 * conquista, depois o encontro, depois o combinado, e por último o registro
 * administrativo.
 *
 * Uma lista só, e não uma para a ordem e outra para a classificação: duas
 * listas para a mesma verdade é como uma delas fica desatualizada.
 */
export const TIPOS_FATO = [
  "marco",
  "sessao",
  "tarefa",
  "conteudo",
  "documento_portal",
  "documento_interno",
  "cobranca",
  "score",
  "temperatura",
  "nota",
  "atividade",
  "interacao",
] as const;

export type TipoFato = (typeof TIPOS_FATO)[number];

/**
 * A classificação. `Record<TipoFato, …>` é de propósito: acrescentar um valor
 * a `TIPOS_FATO` sem dizer aqui se ele é interno ou público NÃO COMPILA — o
 * erro aparece antes do teste, antes do review e muito antes do portal.
 *
 * Por que documento aparece duas vezes: um documento com `visivelPortal`
 * ligado é material que o mentor liberou para a pessoa; um documento fechado
 * é contrato, anamnese, anotação do time. São dois fatos diferentes com dois
 * públicos diferentes, e por isso são dois TIPOS — e não um tipo com um
 * campo que decide na hora. Se a visibilidade dependesse de um campo do fato,
 * a varredura "todo tipo interno morre no portão" perderia a força: passaria
 * a testar um tipo, não os dois casos.
 */
export const VISIBILIDADE_POR_TIPO: Readonly<Record<TipoFato, VisibilidadeFato>> = Object.freeze({
  // O que o mentorado pode ver da própria jornada.
  marco: "publico",
  sessao: "publico",
  tarefa: "publico",
  conteudo: "publico",
  documento_portal: "publico",
  // O que é do time e só do time.
  documento_interno: "interno",
  cobranca: "interno",
  // `score` é interno mesmo o mentorado tendo um gráfico de evolução no
  // portal: o gráfico sai da própria série de `score_evolucao` (ver
  // `Portal.scores`), enquanto o FATO daqui carrega `motivo` — a frase que o
  // mentor escreveu para si mesmo sobre por que a nota caiu.
  score: "interno",
  temperatura: "interno",
  nota: "interno",
  atividade: "interno",
  interacao: "interno",
});

/**
 * Um acontecimento na vida do mentorado, já pronto para virar linha na tela.
 *
 * `quando` é a string ISO CRUA da origem, nunca reformatada e nunca
 * substituída quando é inválida (ver `compararFatos`): data inventada é
 * número inventado. Quem exibe é quem formata.
 */
export interface FatoHistorico {
  quando: string;
  tipo: TipoFato;
  titulo: string;
  detalhe: string;
  visibilidade: VisibilidadeFato;
}

/**
 * O mínimo que o histórico precisa saber de uma cobrança.
 *
 * NÃO é `import type { Cobranca }` de lugar nenhum porque a tabela
 * `public.cobranca` ainda não existe — ela nasce na migração 0023 (tarefa 50
 * do plano da fase 2). Este módulo é puro e recebe listas já lidas, então
 * pode descrever a forma de que precisa sem esperar o banco. Quando a tabela
 * existir, quem lê é que converte a linha para cá — o histórico não muda.
 */
export interface CobrancaDoHistorico {
  /** Mês de referência (ISO). "" quando a cobrança é avulsa. */
  competencia: string;
  vencimento: string;
  valor: number;
  /** "aberta", "paga", "vencida", "cancelada"… texto da origem, sem julgamento aqui. */
  status: string;
}

/**
 * As listas cruas, já lidas por quem chama.
 *
 * TODOS os campos são opcionais, e isso tem consequência de contrato: lista
 * AUSENTE não é lista VAZIA. A tarefa 10 lê nove consultas em paralelo e uma
 * pode falhar sozinha; nesse caso ela omite a lista e avisa a tela com
 * `parcial: true`, em vez de mandar `[]` e fazer o histórico afirmar que não
 * houve nada. Aqui embaixo as duas coisas produzem os mesmos fatos (nenhum) —
 * a diferença entre "não houve" e "não deu para saber" é dita pela camada de
 * cima, que é quem sabe.
 */
export interface EntradaHistorico {
  interacoes?: readonly Interacao[];
  notas?: readonly Nota[];
  atividades?: readonly Atividade[];
  sessoes?: readonly Sessao[];
  tarefas?: readonly TarefaMentoria[];
  marcos?: readonly Marco[];
  scores?: readonly ScoreEvolucao[];
  conteudos?: readonly ConteudoLiberado[];
  documentos?: readonly Documento[];
  cobrancas?: readonly CobrancaDoHistorico[];
}

// ============================================================
// Classificação
// ============================================================

/**
 * Fail-closed, no mesmo espírito de `papelDe` em `src/lib/papeis.ts`:
 * qualquer coisa que não seja EXATAMENTE um tipo declarado é `interno`.
 *
 * Diferença deliberada em relação aos normalizadores de `tipos.ts`: aqui
 * NÃO se tolera variação de caixa nem espaço em volta. Lá, o valor vem de um
 * enum do Postgres e a tolerância evita perder um dado bom por causa de um
 * "Ativo" com maiúscula. Aqui o valor decide se um texto vai para a tela de
 * um cliente: "SESSAO" não é um tipo que este módulo produz, e um valor que
 * chegou torto chegou de algum lugar que ninguém previu.
 */
export function visibilidadeDoTipo(tipo: unknown): VisibilidadeFato {
  if (typeof tipo !== "string") return "interno";
  const conhecido = (TIPOS_FATO as readonly string[]).includes(tipo);
  return conhecido ? VISIBILIDADE_POR_TIPO[tipo as TipoFato] : "interno";
}

// ============================================================
// Higiene do texto que vai ao portal (defesa em profundidade — ler o
// cabeçalho do arquivo sobre o que ela NÃO promete)
// ============================================================

// O `(?<![A-Za-z0-9._%+-])` existe pelo mesmo motivo explicado no padrão de
// dinheiro logo abaixo: sem ele, cada caractere de uma corrida longa de
// dígitos/letras vira ponto de partida e o resto da corrida é varrido de novo
// em cada tentativa, o que dá custo quadrático. A guarda só permite começar
// onde a sequência realmente começa — o resultado é o mesmo (o casamento
// guloso já partia do início da corrida), o custo é que deixa de explodir.
const PADRAO_EMAIL = /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

// Valor em reais em três escritas: "R$ 5.000,00", "5 mil reais", "BRL 5000".
// `R\$` com `[\d.,]*` (e não `+`) para pegar também o cifrão solto, que
// sozinho já anuncia que ali havia dinheiro.
//
// O `(?<![\d.,])` da terceira alternativa NÃO é preciosismo de escrita: sem
// ele, o motor tenta casar a partir de CADA dígito de uma corrida longa e
// varre o resto da corrida em cada tentativa — custo quadrático. Um extrato
// colado no resumo da sessão (40 mil dígitos) travava a thread única do Node
// por ~7 s A CADA abertura do histórico. Com a guarda, só o início da corrida
// é ponto de partida e o custo volta a ser linear; o preço é não higienizar
// um valor que comece por vírgula (",5 reais"), escrita que não existe.
const PADRAO_DINHEIRO = /(R\$\s?[\d.,]*|\bBRL\s?[\d.,]*|(?<![\d.,])\d[\d.,]*\s*(?:mil|milh(?:õ|o)es|mi)?\s*(?:reais|real)\b)/gi;

// Telefone brasileiro nas escritas que aparecem de verdade: "11988887777",
// "(11) 98888-7777", "98888-7777", "+55 11 98888 7777". A barra NÃO entra
// como separador de propósito — "04/05/2026" é data, não telefone, e uma
// data mastigada no meio de um resumo faria a tela mentir de outro jeito.
const PADRAO_TELEFONE = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2}\)?[\s.-]?)?\d{4,5}[\s.-]?\d{4}/g;

/**
 * Tira do texto o que não pode atravessar para a tela do mentorado.
 *
 * A ordem importa: e-mail primeiro (o domínio pode ter dígitos que o padrão
 * de telefone pegaria pela metade), dinheiro depois (senão "5.000 7777"
 * viraria telefone), telefone por último.
 *
 * O texto removido vira uma marca legível, e não some: quem lê a tela precisa
 * saber que havia algo ali e que foi retirado de propósito — apagar em
 * silêncio faria o resumo parecer mal escrito em vez de higienizado.
 */
export function higienizarTextoPublico(texto: string): string {
  if (!texto) return "";
  return texto
    .replace(PADRAO_EMAIL, "[e-mail removido]")
    .replace(PADRAO_DINHEIRO, "[valor removido]")
    .replace(PADRAO_TELEFONE, "[telefone removido]")
    .replace(/\s+/g, " ")
    .trim();
}

// ============================================================
// Construção dos fatos
// ============================================================

function fato(
  tipo: TipoFato,
  quando: string,
  titulo: string,
  detalhe: string,
): FatoHistorico {
  const visibilidade = VISIBILIDADE_POR_TIPO[tipo];
  const publico = visibilidade === "publico";
  return {
    quando: typeof quando === "string" ? quando : "",
    tipo,
    // O carimbo NUNCA é escolhido pelo construtor: ele é lido da tabela. É
    // por isso que não existe, em lugar nenhum deste arquivo, um construtor
    // capaz de marcar um fato como público por conta própria.
    titulo: publico ? higienizarTextoPublico(titulo) : titulo,
    detalhe: publico ? higienizarTextoPublico(detalhe) : detalhe,
    visibilidade,
  };
}

const SUFIXO_STATUS_SESSAO: Record<string, string> = {
  realizada: "realizada",
  agendada: "agendada",
  faltou: "com falta",
  cancelada: "cancelada",
};

function fatoDaSessao(s: Sessao): FatoHistorico {
  const base = s.numero === null || s.numero === undefined ? "Sessão" : `Sessão ${s.numero}`;
  const titulo = `${base} ${SUFIXO_STATUS_SESSAO[statusSessaoDe(s.status)]}`;
  // `transcricao` e `linkGravacao` ficam FORA de propósito: a transcrição é a
  // conversa inteira (o vazamento mais caro do sistema) e o link de gravação
  // pode ser assinado. Quem tem direito a eles é a tela do portal, que os lê
  // da própria linha da sessão depois de a RLS já ter decidido — não um campo
  // de texto que viaja em toda listagem.
  return fato("sessao", s.quando, titulo, s.resumo ?? "");
}

function fatoDaTarefa(t: TarefaMentoria): FatoHistorico {
  // Tarefa concluída é datada pela CONCLUSÃO, e aberta pela criação: os dois
  // são o instante em que aquele fato virou fato. Datar a concluída pela
  // criação colocaria "concluí" no dia em que a tarefa nasceu.
  const concluida = t.concluida === true;
  const quando = (concluida ? t.concluidaEm : null) ?? t.criadoEm ?? "";
  const titulo = concluida ? `Tarefa concluída: ${t.titulo}` : `Tarefa combinada: ${t.titulo}`;
  return fato("tarefa", quando, titulo, "");
}

function fatoDoMarco(m: Marco): FatoHistorico {
  return fato("marco", m.conquistadoEm, `Marco: ${m.titulo}`, m.descricao ?? "");
}

function fatoDoConteudo(c: ConteudoLiberado): FatoHistorico {
  // A `url` não entra: pode carregar token assinado, e um token que viaja em
  // toda listagem é um token que vaza no primeiro log.
  return fato("conteudo", c.liberadoEm, `Conteúdo liberado: ${c.titulo}`, "");
}

const ROTULO_CATEGORIA_DOCUMENTO: Record<string, string> = {
  contrato: "Contrato",
  anamnese: "Anamnese",
  material: "Material",
  outro: "Arquivo",
};

function fatoDoDocumento(d: Documento): FatoHistorico {
  // Arquivado é fail-closed: mesmo marcado como visível, não vai ao portal.
  // A linha não some (a casa não apaga), mas sai da vista de quem não decide
  // sobre ela. A garantia final continua sendo a RLS do 0015; isto aqui é o
  // mesmo raciocínio repetido em memória, não um substituto.
  const paraOPortal = d.visivelPortal === true && d.arquivado !== true;
  if (paraOPortal) {
    return fato("documento_portal", d.criadoEm, `Arquivo disponível: ${d.titulo}`, "");
  }
  const categoria = ROTULO_CATEGORIA_DOCUMENTO[d.categoria] ?? "Arquivo";
  return fato("documento_interno", d.criadoEm, `${categoria} interno: ${d.titulo}`, "");
}

function fatoDaNota(n: Nota): FatoHistorico {
  const titulo = n.autor ? `Nota de ${n.autor}` : "Nota de CRM";
  return fato("nota", n.criadoEm, titulo, n.texto ?? "");
}

function fatoDaAtividade(a: Atividade): FatoHistorico {
  const titulo = a.titulo ? a.titulo : `Atividade: ${a.tipo}`;
  return fato("atividade", a.data, titulo, a.detalhe ?? "");
}

function fatoDaInteracao(i: Interacao): FatoHistorico {
  const titulo = i.direcao === "recebida" ? "Mensagem recebida" : "Mensagem enviada";
  const detalhe = i.tipoMidia ? `[${i.tipoMidia}] ${i.texto ?? ""}`.trim() : (i.texto ?? "");
  return fato("interacao", i.quando, titulo, detalhe);
}

function fatoDoScore(s: ScoreEvolucao): FatoHistorico {
  return fato("score", s.semana, `Score da semana: ${s.score}`, s.motivo ?? "");
}

function fatoDaCobranca(c: CobrancaDoHistorico): FatoHistorico {
  const titulo = `Cobrança ${c.status} — ${fmtBRL(c.valor)}`;
  const detalhe = c.competencia ? `Competência ${fmtDate(c.competencia)}` : "";
  return fato("cobranca", c.vencimento, titulo, detalhe);
}

/**
 * A temperatura do lead NÃO é lida de coluna nenhuma: ela é derivada das
 * interações, aqui, chamando a MESMA `lerTemperatura` que a ficha do CRM, a
 * fila de atendimento e o MCP já chamam. Reimplementar a conta "só para o
 * histórico" faria a ficha dizer "morno" e a linha do tempo dizer "frio" no
 * mesmo dia, com as duas telas certas segundo o próprio código — o risco
 * estrutural que o plano descreve em D2.
 *
 * Devolve `null` (nenhum fato) quando não há base: sem interação válida, ou
 * com `agoraIso` que não é data. Ausência de leitura nunca vira um veredito
 * "frio" — é a regra 3 do cabeçalho de `temperatura.ts`.
 */
function fatoDaTemperatura(interacoes: readonly Interacao[], agoraIso: string): FatoHistorico | null {
  const agora = new Date(agoraIso);
  if (!Number.isFinite(agora.getTime())) return null;
  if (interacoes.length === 0) return null;

  const observados: FatoObservado[] = interacoes.map((i) => ({ quando: i.quando, direcao: i.direcao }));
  const leitura = lerTemperatura(observados, agora);
  if (leitura.temperatura === null) return null;

  const titulo = `Temperatura do lead: ${TEMPERATURA_ROTULO[leitura.temperatura]}`;
  return fato("temperatura", agoraIso, titulo, leitura.porque.join(" "));
}

// ============================================================
// Ordem
// ============================================================

function instanteDe(quando: string): number | null {
  if (!quando) return null;
  const t = Date.parse(quando);
  return Number.isFinite(t) ? t : null;
}

function ordemDoTipo(tipo: TipoFato): number {
  const i = (TIPOS_FATO as readonly string[]).indexOf(tipo);
  // Tipo desconhecido vai para o fim, nunca para o começo: se um dia entrar
  // aqui um fato que este módulo não construiu, ele não fura a fila.
  return i === -1 ? TIPOS_FATO.length : i;
}

/**
 * Ordem total, de propósito — e não "decrescente por data e deixa o resto por
 * conta do `sort`".
 *
 * `Array.prototype.sort` é estável na especificação desde 2019, mas
 * estabilidade só garante que empates saem na ordem em que ENTRARAM — e a
 * ordem de entrada aqui é a ordem em que nove consultas paralelas voltaram do
 * banco, que não é ordem nenhuma. Duas telas abertas no mesmo segundo
 * mostrariam a mesma linha do tempo em ordens diferentes, e ninguém saberia
 * dizer qual estava certa. Por isso o desempate é declarado até o fim: data,
 * tipo (na ordem fixa de `TIPOS_FATO`), título, detalhe e, por último, a
 * string crua de `quando`.
 *
 * Comparação de texto com `<` e não `localeCompare`: `localeCompare` depende
 * do locale do processo, e o objetivo desta função é justamente não depender
 * de nada que mude entre duas execuções.
 */
function compararFatos(a: FatoHistorico, b: FatoHistorico): number {
  const ta = instanteDe(a.quando);
  const tb = instanteDe(b.quando);

  // Data inválida não lança e não vira "1970": vai para o FIM da lista,
  // depois até do fato válido mais antigo. Tratá-la como zero colocaria um
  // registro sem data no meio da década de 70 e mentiria com cara de dado.
  if (ta === null && tb !== null) return 1;
  if (tb === null && ta !== null) return -1;
  if (ta !== null && tb !== null && ta !== tb) return tb - ta;

  const oa = ordemDoTipo(a.tipo);
  const ob = ordemDoTipo(b.tipo);
  if (oa !== ob) return oa - ob;

  if (a.titulo !== b.titulo) return a.titulo < b.titulo ? -1 : 1;
  if (a.detalhe !== b.detalhe) return a.detalhe < b.detalhe ? -1 : 1;
  if (a.quando !== b.quando) return a.quando < b.quando ? -1 : 1;
  return 0;
}

// ============================================================
// A função
// ============================================================

/**
 * Junta as listas cruas numa linha do tempo só, do mais recente para o mais
 * antigo.
 *
 * Nunca muta as listas recebidas (todas entram como `readonly`, e o array
 * ordenado é sempre novo) — a mesma disciplina de `progresso.ts`.
 *
 * Lista vazia devolve `[]`, nunca `null`: a ausência de fatos é um resultado
 * legítimo e a tela precisa poder percorrer o que recebeu sem checar antes se
 * recebeu alguma coisa.
 */
export function historicoDe(entrada: EntradaHistorico, agoraIso: string): FatoHistorico[] {
  const interacoes = entrada.interacoes ?? [];

  const fatos: FatoHistorico[] = [
    ...(entrada.marcos ?? []).map(fatoDoMarco),
    ...(entrada.sessoes ?? []).map(fatoDaSessao),
    ...(entrada.tarefas ?? []).map(fatoDaTarefa),
    ...(entrada.conteudos ?? []).map(fatoDoConteudo),
    ...(entrada.documentos ?? []).map(fatoDoDocumento),
    ...(entrada.cobrancas ?? []).map(fatoDaCobranca),
    ...(entrada.scores ?? []).map(fatoDoScore),
    ...(entrada.notas ?? []).map(fatoDaNota),
    ...(entrada.atividades ?? []).map(fatoDaAtividade),
    ...interacoes.map(fatoDaInteracao),
  ];

  const temperatura = fatoDaTemperatura(interacoes, agoraIso);
  if (temperatura !== null) fatos.push(temperatura);

  return fatos.sort(compararFatos);
}

/**
 * O PORTÃO do portal: devolve só os fatos públicos.
 *
 * Fail-closed em dois sentidos, e os dois importam:
 *
 * 1) O tipo tem que ser conhecido. Um fato com tipo que este módulo não
 *    declara não passa nem carimbado de público — é exatamente o caso do
 *    "tipo novo criado amanhã e ninguém classificou".
 *
 * 2) O carimbo tem que CONCORDAR com a classificação do tipo. Um fato
 *    `{ tipo: "nota", visibilidade: "publico" }` é dado forjado ou refactor
 *    pela metade; nos dois casos a resposta segura é não mostrar. Confiar só
 *    no campo `visibilidade` transformaria um campo de dado numa permissão.
 *
 * O texto público é higienizado DE NOVO aqui, e não só na construção: esta
 * função é a última coisa que roda antes de o fato virar tela do mentorado, e
 * ela também recebe fatos que outra camada pode ter montado à mão.
 */
export function projetarParaPortal(fatos: readonly FatoHistorico[]): FatoHistorico[] {
  return fatos
    .filter((f) => visibilidadeDoTipo(f.tipo) === "publico" && f.visibilidade === "publico")
    .map((f) => ({
      ...f,
      titulo: higienizarTextoPublico(f.titulo),
      detalhe: higienizarTextoPublico(f.detalhe),
    }));
}
