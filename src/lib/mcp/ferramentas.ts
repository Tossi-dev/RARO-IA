// As cinco ferramentas que o Claude do dono enxerga. SÓ LEITURA.
//
// A REGRA QUE MANDA NESTE ARQUIVO
// --------------------------------
// Nenhum número nasce aqui. Faturamento, lucro, caixa, ritmo de meta e alertas
// saem das MESMAS funções que desenham o Command Center (`metrics-comando.ts`);
// temperatura e fila saem das mesmas de `atendimento/`. Se este arquivo
// somasse um total "só para facilitar", o dono passaria a ter dois números
// verdadeiros para a mesma pergunta — o da tela e o do Claude — e nenhum jeito
// de saber qual acreditar. O dia em que eles divergissem seria o dia em que ele
// para de usar os dois.
//
// A SEGUNDA REGRA: TODA RESPOSTA DIZ DE ONDE VEIO
// -----------------------------------------------
// Cada resultado carrega uma linha `origem`. Ela não é enfeite: o Claude
// repete essa linha para o dono, e é por ela que ele descobre, por exemplo,
// que está olhando a base de DEMONSTRAÇÃO em vez da real. Número sem
// procedência dito por um assistente confiante é exatamente como este sistema
// perderia a confiança que levou meses para construir.
//
// A TERCEIRA: ESCRITA NÃO EXISTE NESTA VERSÃO
// -------------------------------------------
// Nenhuma ferramenta aqui grava, aprova, envia ou apaga. O Claude lê antes de
// agir. Escrita entra depois, com aprovação humana desenhada — e o desenho
// dessa aprovação é trabalho de produto, não de mais uma função neste arquivo.

import { montarFilaDoDia, type AlunoParaFila } from "@/lib/atendimento/fila";
import { acharPorTelefone, formatarTelefone } from "@/lib/atendimento/telefone";
import {
  lerTemperatura,
  TEMPERATURA_ROTULO,
  type FatoObservado,
} from "@/lib/atendimento/temperatura";
import { getDB, modoDados, type ModoDados } from "@/lib/data";
import { fmtBRL, fmtDate, fmtDateTime, fmtPct } from "@/lib/format";
import {
  alertasComando,
  desempenhoPorBraco,
  janelaComando,
  norteDoComando,
  pulsoDeCaixa,
  type SeveridadeAlerta,
} from "@/lib/metrics-comando";
import type { Aluno, Atividade, Interacao, Matricula } from "@/lib/types";

// ---------------------------------------------------------------------------
// O formato de saída — comum às cinco
// ---------------------------------------------------------------------------

export interface ResultadoFerramenta {
  /** O relatório que o modelo lê. Já contém a linha de origem, no fim. */
  texto: string;
  /** Os mesmos fatos em JSON, para o modelo não ter que reinterpretar texto. */
  dados: Record<string, unknown>;
  /** De onde cada número veio, em uma linha. */
  origem: string;
  /**
   * Falha DA FERRAMENTA (cliente não encontrado, base fora do ar) — não falha
   * do protocolo. A diferença importa: erro de protocolo derruba a conversa;
   * isto aqui vira um resultado com `isError: true` que o modelo lê e contorna.
   */
  falhou?: boolean;
}

/** A definição que vai no `tools/list`, no formato da especificação. */
export interface DefinicaoFerramenta {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Procedência da base — a primeira coisa que o dono precisa saber
// ---------------------------------------------------------------------------

/**
 * Como a base é anunciada na linha de origem.
 *
 * O modo `demo` é escrito em caixa alta e com a palavra "fictícios" de
 * propósito. É a diferença entre o dono ler "faturamento de R$ 84 mil" e
 * decidir contratar alguém, ou ler a mesma frase sabendo que aquilo é uma
 * base de demonstração. A tela tem uma faixa colorida avisando isso; numa
 * conversa de texto, o aviso tem que caber na frase.
 */
const ROTULO_BASE: Record<ModoDados, string> = {
  supabase: "base real no Supabase",
  planilha: "base real na planilha Base_Financeira_Operacao",
  demo: "base de DEMONSTRAÇÃO (dados fictícios, RARO_MODO=demo)",
  vazio: "nenhuma base conectada — não há dado real neste servidor",
};

function rotuloBase(): string {
  return ROTULO_BASE[modoDados()];
}

// ---------------------------------------------------------------------------
// Leitura de argumentos — recusa cedo, com mensagem que ensina
// ---------------------------------------------------------------------------

/**
 * Erro de ARGUMENTO, lançado para virar `-32602` (Invalid params) lá em
 * `servidor.ts`. Existe uma classe própria em vez de um `Error` genérico
 * porque a especificação separa erro do chamador de erro do servidor, e essa
 * separação é o que diz ao modelo se ele deve corrigir a chamada ou desistir.
 */
export class ArgumentoInvalido extends Error {}

function textoObrigatorio(args: Record<string, unknown>, campo: string): string {
  const v = args[campo];
  if (typeof v !== "string" || v.trim() === "") {
    throw new ArgumentoInvalido(`O parâmetro "${campo}" é obrigatório e precisa ser um texto.`);
  }
  return v.trim();
}

function textoOpcional(args: Record<string, unknown>, campo: string): string {
  const v = args[campo];
  return typeof v === "string" ? v.trim() : "";
}

function inteiroOpcional(
  args: Record<string, unknown>,
  campo: string,
  padrao: number,
  minimo: number,
  maximo: number
): number {
  const v = args[campo];
  if (v === undefined || v === null) return padrao;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) {
    throw new ArgumentoInvalido(`O parâmetro "${campo}" precisa ser um número.`);
  }
  // Corta em vez de recusar: um limite de 500 pedido por engano não é motivo
  // para a chamada inteira falhar — devolver 50 e seguir é mais útil.
  return Math.max(minimo, Math.min(maximo, Math.trunc(n)));
}

// ---------------------------------------------------------------------------
// Busca textual — acento e caixa não podem separar uma pessoa da ficha dela
// ---------------------------------------------------------------------------

/**
 * "JOÃO", "joao" e "João" precisam achar a mesma pessoa. Quem digita o nome do
 * cliente numa conversa não vai lembrar do til, e um CRM que exige acento
 * exato para achar alguém é um CRM que o dono para de consultar.
 */
function achatar(texto: string): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // marcas de acento, já separadas pelo NFD
    .toLowerCase()
    .trim();
}

function pareceTelefone(termo: string): boolean {
  // Oito dígitos é o menor número de telefone brasileiro sem DDD; abaixo disso
  // é mais provável ser pedaço de nome ("2024") do que número de alguém.
  return termo.replace(/\D/g, "").length >= 8;
}

interface ClienteAchado {
  aluno: Aluno;
  comoCasou: "telefone" | "nome" | "e-mail";
}

function buscarClientes(alunos: Aluno[], termo: string, limite: number): ClienteAchado[] {
  const achados: ClienteAchado[] = [];
  const vistos = new Set<string>();

  const empurrar = (aluno: Aluno, comoCasou: ClienteAchado["comoCasou"]) => {
    if (vistos.has(aluno.id)) return;
    vistos.add(aluno.id);
    achados.push({ aluno, comoCasou });
  };

  // Telefone primeiro, e por `acharPorTelefone` (não por comparação de texto):
  // é a única correspondência aqui que é IDENTIDADE, não semelhança — a chave
  // colapsa "+55 14 99123-4567" e "1491234567" na mesma linha telefônica.
  if (pareceTelefone(termo)) {
    const porTelefone = acharPorTelefone(alunos, termo);
    if (porTelefone) empurrar(porTelefone, "telefone");
  }

  const alvo = achatar(termo);
  if (alvo !== "") {
    for (const a of alunos) {
      if (achatar(a.nome).includes(alvo)) empurrar(a, "nome");
    }
    for (const a of alunos) {
      if (achatar(a.email).includes(alvo)) empurrar(a, "e-mail");
    }
  }

  return achados.slice(0, limite);
}

// ---------------------------------------------------------------------------
// 1) buscar_cliente
// ---------------------------------------------------------------------------

async function buscarCliente(args: Record<string, unknown>): Promise<ResultadoFerramenta> {
  const termo = textoObrigatorio(args, "termo");
  const limite = inteiroOpcional(args, "limite", 10, 1, 50);

  const alunos = await getDB().listAlunos();
  const achados = buscarClientes(alunos, termo, limite);

  const origem = `Cadastro de clientes da MentorOS (${rotuloBase()}); nome e e-mail casados por texto sem acento, telefone casado pela chave de src/lib/atendimento/telefone.ts.`;

  if (achados.length === 0) {
    return {
      texto: `Nenhum cliente encontrado para "${termo}" entre os ${alunos.length} cadastrados.\n\nOrigem: ${origem}`,
      dados: { termo, encontrados: 0, totalCadastrados: alunos.length, clientes: [] },
      origem,
    };
  }

  const clientes = achados.map(({ aluno, comoCasou }) => ({
    id: aluno.id,
    nome: aluno.nome,
    telefone: formatarTelefone(aluno.telefone),
    email: aluno.email,
    statusFunil: aluno.statusFunil,
    origemDoLead: aluno.origem,
    primeiroContato: aluno.primeiroContato,
    casouPor: comoCasou,
  }));

  const linhas = clientes.map(
    (c) =>
      `· ${c.nome} — ${c.telefone} — ${c.email || "sem e-mail"} — funil: ${c.statusFunil} — 1º contato: ${fmtDate(c.primeiroContato)} (casou por ${c.casouPor}; id ${c.id})`
  );

  return {
    texto: `${achados.length} cliente(s) para "${termo}":\n${linhas.join("\n")}\n\nOrigem: ${origem}`,
    dados: { termo, encontrados: achados.length, totalCadastrados: alunos.length, clientes },
    origem,
  };
}

// ---------------------------------------------------------------------------
// 2) historico_do_cliente
// ---------------------------------------------------------------------------

/**
 * Os fatos que alimentam a leitura de temperatura.
 *
 * SÓ INTERAÇÕES ENTRAM, e a ausência das compras aqui é decisão, não
 * esquecimento. `FatoObservado` exige uma `direcao` ("recebida" = o cliente
 * falou; "enviada" = a empresa falou), e uma VENDA não é nenhuma das duas.
 * Fingir uma direção teria custo real dos dois lados: com "recebida", uma
 * compra recente marcaria o cliente como "esperando resposta" e ele furaria a
 * fila do dia por um evento que não é mensagem; com "enviada", a leitura
 * devolveria a frase "Última mensagem foi nossa, em 12/07" apontando para uma
 * venda — uma afirmação falsa dita com a mesma confiança das verdadeiras.
 *
 * O histórico de compras aparece à parte na resposta desta ferramenta, com os
 * valores e as datas. O que se perde é o bônus de confiança que
 * `lerTemperatura` dá a quem já comprou; o que se ganha é nunca dizer ao dono
 * uma frase que os dados não sustentam.
 */
function fatosDasInteracoes(interacoes: Interacao[]): FatoObservado[] {
  return interacoes.map((i) => ({ quando: i.quando, direcao: i.direcao }));
}

async function historicoDoCliente(args: Record<string, unknown>): Promise<ResultadoFerramenta> {
  const clienteId = textoOpcional(args, "cliente_id");
  const termo = textoOpcional(args, "termo");
  const limite = inteiroOpcional(args, "limite", 30, 1, 200);

  if (clienteId === "" && termo === "") {
    throw new ArgumentoInvalido('Informe "cliente_id" ou "termo" — um dos dois é obrigatório.');
  }

  const db = getDB();
  const alunos = await db.listAlunos();

  let aluno: Aluno | undefined;
  if (clienteId !== "") {
    aluno = alunos.find((a) => a.id === clienteId);
  } else {
    const achados = buscarClientes(alunos, termo, 5);
    if (achados.length > 1) {
      // Ambiguidade NÃO é resolvida por chute. Escolher "o primeiro" faria o
      // Claude relatar o histórico de outra pessoa com total convicção, e o
      // dono não teria como perceber o troco.
      const nomes = achados.map((x) => `${x.aluno.nome} (id ${x.aluno.id})`).join("; ");
      const origem = `Cadastro de clientes da MentorOS (${rotuloBase()}).`;
      return {
        texto: `"${termo}" casa com mais de um cliente: ${nomes}. Chame de novo usando "cliente_id" para escolher.\n\nOrigem: ${origem}`,
        dados: { termo, ambiguo: true, candidatos: achados.map((x) => ({ id: x.aluno.id, nome: x.aluno.nome })) },
        origem,
        falhou: true,
      };
    }
    aluno = achados[0]?.aluno;
  }

  if (!aluno) {
    const origem = `Cadastro de clientes da MentorOS (${rotuloBase()}).`;
    const alvo = clienteId !== "" ? `id "${clienteId}"` : `"${termo}"`;
    return {
      texto: `Nenhum cliente com ${alvo}.\n\nOrigem: ${origem}`,
      dados: { encontrado: false },
      origem,
      falhou: true,
    };
  }

  const encontrado = aluno;
  const [interacoes, atividades, ds] = await Promise.all([
    db.listInteracoes(encontrado.id),
    db.listAtividades(encontrado.id),
    db.dataset(),
  ]);

  const agora = new Date();
  const leitura = lerTemperatura(fatosDasInteracoes(interacoes), agora);

  const compras: Matricula[] = ds.matriculas
    .filter((m) => m.alunoId === encontrado.id && m.statusPagamento !== "pendente")
    .sort((a, b) => a.data.localeCompare(b.data));

  // Uma linha do tempo só, em ordem — o dono pensa em "o que aconteceu com
  // essa pessoa", não em "tabela de interações" e "tabela de atividades".
  type Evento = { quando: string; tipo: string; texto: string };
  const eventos: Evento[] = [
    ...interacoes.map((i: Interacao) => ({
      quando: i.quando,
      tipo: i.direcao === "recebida" ? "mensagem do cliente" : "mensagem nossa",
      texto: i.tipoMidia ? `[${i.tipoMidia}] ${i.texto}` : i.texto,
    })),
    ...atividades.map((a: Atividade) => ({
      quando: a.data,
      tipo: `atividade: ${a.tipo}`,
      texto: a.detalhe ? `${a.titulo} — ${a.detalhe}` : a.titulo,
    })),
    ...compras.map((m) => ({
      quando: m.data,
      tipo: m.statusPagamento === "reembolsado" ? "venda reembolsada" : "venda",
      texto: `${m.produtoNome ?? m.produtoId} — ${fmtBRL(m.valor)}`,
    })),
  ]
    .sort((a, b) => b.quando.localeCompare(a.quando))
    .slice(0, limite);

  const origem = `Interações e atividades da ficha de ${encontrado.nome} (${rotuloBase()}); temperatura derivada em tempo de leitura por lerTemperatura (src/lib/atendimento/temperatura.ts), a partir de ${interacoes.length} mensagem(ns) — vendas não entram nessa conta.`;

  const cabecalho =
    leitura.temperatura === null
      ? "Temperatura: sem sinal (nenhuma conversa registrada)."
      : `Temperatura: ${TEMPERATURA_ROTULO[leitura.temperatura]} · confiança ${leitura.confianca}/100 (${leitura.rotuloConfianca}) · ${leitura.diasSemContato} dia(s) sem contato${leitura.esperandoResposta ? " · ELE ESTÁ ESPERANDO RESPOSTA" : ""}`;

  const texto = [
    `${encontrado.nome} — ${formatarTelefone(encontrado.telefone)} — ${encontrado.email || "sem e-mail"} — funil: ${encontrado.statusFunil}`,
    "",
    cabecalho,
    `Por quê: ${leitura.porque.join(" ")}`,
    `Sugestão: ${leitura.sugestao}`,
    "",
    compras.length
      ? `Compras: ${compras.length}, somando ${fmtBRL(compras.reduce((s, m) => s + m.valor, 0))} (última em ${fmtDate(compras[compras.length - 1].data)}).`
      : "Compras: nenhuma registrada.",
    "",
    eventos.length
      ? `Linha do tempo (${eventos.length} evento(s) mais recentes):\n${eventos
          .map((e) => `· ${fmtDateTime(e.quando)} — ${e.tipo}: ${e.texto}`)
          .join("\n")}`
      : "Linha do tempo: nada registrado.",
    "",
    `Origem: ${origem}`,
  ].join("\n");

  return {
    texto,
    dados: {
      cliente: {
        id: encontrado.id,
        nome: encontrado.nome,
        telefone: formatarTelefone(encontrado.telefone),
        email: encontrado.email,
        statusFunil: encontrado.statusFunil,
      },
      leitura,
      compras: compras.map((m) => ({
        data: m.data,
        produto: m.produtoNome ?? m.produtoId,
        valor: m.valor,
        status: m.statusPagamento,
      })),
      eventos,
    },
    origem,
  };
}

// ---------------------------------------------------------------------------
// 3) fila_do_dia
// ---------------------------------------------------------------------------

async function filaDoDia(args: Record<string, unknown>): Promise<ResultadoFerramenta> {
  const limite = inteiroOpcional(args, "limite", 15, 1, 100);

  const db = getDB();
  const [alunos, interacoes] = await Promise.all([db.listAlunos(), db.listInteracoes()]);

  // Uma passada só para agrupar: `listInteracoes(alunoId)` por pessoa seria
  // uma consulta por cliente, e no modo planilha isso é uma leitura de rede
  // por linha do cadastro.
  const porAluno = new Map<string, Interacao[]>();
  for (const i of interacoes) {
    const atual = porAluno.get(i.alunoId);
    if (atual) atual.push(i);
    else porAluno.set(i.alunoId, [i]);
  }

  const paraFila: AlunoParaFila[] = alunos.map((a) => ({
    id: a.id,
    nome: a.nome,
    telefone: a.telefone,
    fatos: fatosDasInteracoes(porAluno.get(a.id) ?? []),
  }));

  const fila = montarFilaDoDia(paraFila, new Date());
  const recorte = fila.slice(0, limite);

  const origem = `Fila montada por montarFilaDoDia (src/lib/atendimento/fila.ts) sobre ${interacoes.length} interação(ões) de ${alunos.length} cliente(s) (${rotuloBase()}); a ordem é pesoDeAtencao, a mesma regra da tela de atendimento.`;

  if (recorte.length === 0) {
    return {
      texto: `Ninguém na fila hoje: nenhum dos ${alunos.length} clientes tem conversa registrada, e quem não tem conversa não entra na fila (não há base para dizer nada sobre essa pessoa).\n\nOrigem: ${origem}`,
      dados: { totalNaFila: 0, totalClientes: alunos.length, fila: [] },
      origem,
    };
  }

  const itens = recorte.map((item, i) => ({
    posicao: i + 1,
    clienteId: item.alunoId,
    nome: item.nome,
    telefone: formatarTelefone(item.telefone),
    temperatura: item.leitura.temperatura,
    confianca: item.leitura.confianca,
    diasSemContato: item.leitura.diasSemContato,
    esperandoResposta: item.leitura.esperandoResposta,
    porque: item.leitura.porque,
    sugestao: item.leitura.sugestao,
    peso: item.peso,
  }));

  const linhas = itens.map(
    (x) =>
      `${x.posicao}. ${x.nome} (${x.telefone}) — ${x.temperatura ? TEMPERATURA_ROTULO[x.temperatura] : "sem sinal"}${x.esperandoResposta ? ", ESPERANDO RESPOSTA" : ""}, ${x.diasSemContato} dia(s) sem contato. ${x.sugestao} [id ${x.clienteId}]`
  );

  return {
    texto: `${fila.length} pessoa(s) na fila; mostrando ${itens.length}:\n${linhas.join("\n")}\n\nOrigem: ${origem}`,
    dados: { totalNaFila: fila.length, totalClientes: alunos.length, fila: itens },
    origem,
  };
}

// ---------------------------------------------------------------------------
// 4) resumo_do_negocio
// ---------------------------------------------------------------------------

/**
 * O filtro global do app fala em DIAS (7/30/90/365) e `janelaComando` traduz
 * isso para semana/mês/trimestre/ano de calendário. Aqui a conversa é ao
 * contrário — o dono pergunta "como foi o mês" —, então o mapa devolve o
 * número de dias que produz a janela pedida. Reusar `janelaComando` em vez de
 * montar as datas na mão é o que garante que "mês" aqui e "mês" na tela sejam
 * o mesmo intervalo, inclusive nos comparativos e no prorrateio de meta.
 */
const DIAS_POR_PERIODO: Record<string, number> = {
  semana: 7,
  mes: 30,
  trimestre: 90,
  ano: 365,
};

async function resumoDoNegocio(args: Record<string, unknown>): Promise<ResultadoFerramenta> {
  const pedido = textoOpcional(args, "periodo") || "mes";
  const chave = achatar(pedido); // "mês" e "MES" chegam na mesma chave
  const dias = DIAS_POR_PERIODO[chave];
  if (dias === undefined) {
    throw new ArgumentoInvalido(
      `O parâmetro "periodo" aceita: ${Object.keys(DIAS_POR_PERIODO).join(", ")}.`
    );
  }

  const db = getDB();
  const [ds, dc, metas] = await Promise.all([db.dataset(), db.datasetCaixa(), db.listMetas()]);

  const hoje = new Date();
  const janela = janelaComando(dias, hoje);
  // `fonte: "todos"` — sem lente de produto. A lente é uma escolha de TELA
  // (o dono clica nela e vê o recorte mudar na frente dele); numa conversa,
  // um recorte silencioso viraria um número menor sem explicação.
  const norte = norteDoComando(ds, metas, "todos", janela);
  const pulso = pulsoDeCaixa(ds, dc, "todos", hoje);

  const origem = `norteDoComando + pulsoDeCaixa (src/lib/metrics-comando.ts), as mesmas funções do Command Center, sobre ${janela.rotulo} (${janela.atual.inicio} a ${janela.atual.fim}) e a ${rotuloBase()}.`;

  const linhaMeta =
    norte.meta === null
      ? "Meta: nenhuma cadastrada para este período — sem meta não há ritmo a comparar."
      : `Meta: ${fmtBRL(norte.meta)}${norte.metaProrrateada ? " (prorrateada, a janela cobre mês parcial)" : ""} · ${fmtPct(norte.pctMeta ?? 0)} realizado com ${fmtPct(norte.pace?.pctTempo ?? 0)} do tempo decorrido · projeção de fechamento ${fmtBRL(norte.projecao)} (${norte.noRitmo ? "no ritmo" : `faltam ${fmtBRL(Math.abs(norte.gapProjetado ?? 0))}`}) · ritmo atual ${fmtBRL(norte.ritmoAtual)}/dia, necessário ${fmtBRL(norte.ritmoNecessario)}/dia nos ${janela.diasRestantes} dia(s) restantes.`;

  // Sem extrato lançado e sem saldo inicial parametrizado, saldo e runway são
  // zero por AUSÊNCIA DE REGISTRO, não por conta zerada. Dizer "seu caixa é
  // R$ 0,00" nesse estado é a mentira mais cara que este endpoint poderia
  // contar — `pulso.temExtrato` existe exatamente para separar os dois casos.
  const linhaCaixa = pulso.temExtrato
    ? `Caixa hoje: ${fmtBRL(pulso.saldoHoje)} (reserva mínima ${fmtBRL(pulso.reservaMinima)}${pulso.abaixoDaReserva ? " — ABAIXO da reserva" : ""}) · runway ${pulso.runway.meses === null ? "sem esgotamento projetado" : `${pulso.runway.meses} mês(es)`} · ${pulso.primeiraSemanaNegativa ? `caixa vira negativo na semana de ${fmtDate(pulso.primeiraSemanaNegativa.inicio)}` : "nenhuma semana negativa nas próximas 13"}.`
    : "Caixa: sem extrato lançado e sem saldo inicial informado — saldo, runway e projeção não medem nada neste servidor (o zero seria ausência de registro, não caixa zerado).";

  const texto = [
    `Resumo de ${janela.rotulo} (dia ${janela.diasDecorridos} de ${janela.diasTotais}).`,
    "",
    `Faturamento: ${fmtBRL(norte.resumo.faturamento)} em ${norte.resumo.qtdVendas} venda(s), ticket médio ${fmtBRL(norte.resumo.ticketMedio)}.`,
    `Resultado: líquido ${fmtBRL(norte.resumo.liquido)} − custos ${fmtBRL(norte.resumo.custoTotal)} = lucro ${fmtBRL(norte.resumo.lucro)} (margem ${fmtPct(norte.resumo.margem)}).`,
    `Custos: comissões ${fmtBRL(norte.resumo.comissoes)} · despesas fixas ${fmtBRL(norte.resumo.despesasFixas)} · variáveis ${fmtBRL(norte.resumo.despesasVariaveis)} · reembolsos ${fmtBRL(norte.resumo.reembolsos)}.`,
    linhaMeta,
    linhaCaixa,
    `Comparativos: ${norte.comparativos.map((c) => `${c.rotulo} ${fmtBRL(c.valor)} (${c.deltaPct === null ? "sem base" : fmtPct(c.deltaPct)})`).join(" · ")}.`,
    `DRE do mês (competência): lucro operacional ${fmtBRL(pulso.lucroOperacional)}, margem líquida ${fmtPct(pulso.margemLiquidaPct)}.`,
    "",
    `Origem: ${origem}`,
  ].join("\n");

  return {
    texto,
    dados: {
      periodo: {
        escala: janela.escala,
        rotulo: janela.rotulo,
        inicio: janela.atual.inicio,
        fim: janela.atual.fim,
        diasDecorridos: janela.diasDecorridos,
        diasTotais: janela.diasTotais,
        diasRestantes: janela.diasRestantes,
      },
      faturamento: norte.resumo.faturamento,
      liquido: norte.resumo.liquido,
      custoTotal: norte.resumo.custoTotal,
      lucro: norte.resumo.lucro,
      margemPct: norte.resumo.margem,
      qtdVendas: norte.resumo.qtdVendas,
      ticketMedio: norte.resumo.ticketMedio,
      meta: norte.meta,
      metaProrrateada: norte.metaProrrateada,
      pctMeta: norte.pctMeta,
      pctTempo: norte.pace?.pctTempo ?? null,
      projecao: norte.projecao,
      gapProjetado: norte.gapProjetado,
      noRitmo: norte.noRitmo,
      ritmoAtual: norte.ritmoAtual,
      ritmoIdeal: norte.ritmoIdeal,
      ritmoNecessario: norte.ritmoNecessario,
      comparativos: norte.comparativos,
      caixa: {
        temExtrato: pulso.temExtrato,
        saldoHoje: pulso.temExtrato ? pulso.saldoHoje : null,
        reservaMinima: pulso.reservaMinima,
        abaixoDaReserva: pulso.abaixoDaReserva,
        runwayMeses: pulso.runway.meses,
        primeiraSemanaNegativa: pulso.primeiraSemanaNegativa,
        capitalDeGiro: pulso.capitalDeGiro,
        aReceberVencido: pulso.aReceberVencido,
        aPagarVencido: pulso.aPagarVencido,
        lucroOperacional: pulso.lucroOperacional,
        margemLiquidaPct: pulso.margemLiquidaPct,
        sobrouDinheiro: pulso.sobrouDinheiro,
        temCaixa: pulso.temCaixa,
      },
    },
    origem,
  };
}

// ---------------------------------------------------------------------------
// 5) alertas
// ---------------------------------------------------------------------------

const SEVERIDADES: SeveridadeAlerta[] = ["critico", "atencao", "oportunidade"];

async function alertas(args: Record<string, unknown>): Promise<ResultadoFerramenta> {
  const limite = inteiroOpcional(args, "limite", 10, 1, 50);
  const filtroSeveridade = achatar(textoOpcional(args, "severidade"));
  if (filtroSeveridade !== "" && !(SEVERIDADES as string[]).includes(filtroSeveridade)) {
    throw new ArgumentoInvalido(`O parâmetro "severidade" aceita: ${SEVERIDADES.join(", ")}.`);
  }

  const db = getDB();
  const [ds, dc, alunos, afiliados, metas, atividades, orcamentos, agrupamentos] = await Promise.all(
    [
      db.dataset(),
      db.datasetCaixa(),
      db.listAlunos(),
      db.listAfiliados(),
      db.listMetas(),
      db.listAtividades(),
      db.listOrcamentos(),
      db.listAgrupamentos(),
    ]
  );

  const hoje = new Date();
  const janela = janelaComando(30, hoje);
  const norte = norteDoComando(ds, metas, "todos", janela);
  const pulso = pulsoDeCaixa(ds, dc, "todos", hoje);
  // A composição abaixo é a MESMA de src/app/(app)/painel/page.tsx, na mesma
  // ordem e com as mesmas bases — inclusive `desempenhoPorBraco` sobre a base
  // completa. Montar a entrada de outro jeito aqui produziria alertas que a
  // tela não mostra (ou o contrário), e o dono descobriria a divergência
  // discutindo com o Claude sobre um alerta que ele não consegue achar.
  const porAgrupamento = desempenhoPorBraco(ds.matriculas, afiliados, metas, janela, agrupamentos);

  const lista = alertasComando({
    ds,
    dc,
    alunos,
    atividades,
    afiliados,
    orcamentos,
    norte,
    pulso,
    fonte: "todos",
    porAgrupamento,
    ref: hoje,
  });

  const filtrada = filtroSeveridade === "" ? lista : lista.filter((a) => a.severidade === filtroSeveridade);
  const recorte = filtrada.slice(0, limite);

  const origem = `alertasComando (src/lib/metrics-comando.ts), a mesma Central de Alertas do Command Center, sobre ${janela.rotulo} e a ${rotuloBase()}; a ordem é por R$ em jogo, nunca por data.`;

  if (recorte.length === 0) {
    return {
      texto: `Nenhum alerta${filtroSeveridade ? ` de severidade "${filtroSeveridade}"` : ""} neste momento. Vale lembrar a regra: alerta sem valor em R$ não entra na lista, então "nenhum alerta" quer dizer "nada com dinheiro mensurável em jogo".\n\nOrigem: ${origem}`,
      dados: { total: 0, alertas: [] },
      origem,
    };
  }

  const itens = recorte.map((a) => ({
    id: a.id,
    tipo: a.tipo,
    severidade: a.severidade,
    titulo: a.titulo,
    detalhe: a.detalhe,
    acao: a.acao,
    valor: a.valor,
    rotuloValor: a.rotuloValor,
  }));

  const linhas = itens.map(
    (a) =>
      `· [${a.severidade}] ${a.titulo} — ${fmtBRL(a.valor)} ${a.rotuloValor}. ${a.detalhe} Ação: ${a.acao}`
  );

  return {
    texto: `${filtrada.length} alerta(s); mostrando ${itens.length}, do mais caro para o mais barato:\n${linhas.join("\n")}\n\nOrigem: ${origem}`,
    dados: { total: filtrada.length, alertas: itens },
    origem,
  };
}

// ---------------------------------------------------------------------------
// O catálogo
// ---------------------------------------------------------------------------

/**
 * As descrições são escritas PARA O MODELO decidir quando chamar, e por isso
 * dizem também o que a ferramenta NÃO faz. Descrição vaga é o que produz a
 * ferramenta chamada na hora errada — e depois um resumo confiante em cima do
 * dado errado.
 */
export const CATALOGO: DefinicaoFerramenta[] = [
  {
    name: "buscar_cliente",
    title: "Buscar cliente",
    description:
      "Procura clientes do CRM por nome, telefone ou e-mail e devolve os dados de cadastro (id, telefone, e-mail, estágio do funil, data do primeiro contato). Use para descobrir o id de alguém antes de pedir o histórico. Não traz conversas nem vendas — para isso use historico_do_cliente.",
    inputSchema: {
      type: "object",
      properties: {
        termo: {
          type: "string",
          description:
            "Nome (parcial serve, acento não importa), telefone em qualquer escrita (com ou sem DDI, com ou sem o nono dígito) ou e-mail.",
        },
        limite: {
          type: "integer",
          description: "Máximo de clientes a devolver. Padrão 10, teto 50.",
          minimum: 1,
          maximum: 50,
        },
      },
      required: ["termo"],
      additionalProperties: false,
    },
  },
  {
    name: "historico_do_cliente",
    title: "Histórico do cliente",
    description:
      "Linha do tempo de um cliente — mensagens trocadas, atividades registradas e compras, em ordem — junto com a leitura de temperatura do lead (quente/morno/frio/dormindo), a confiança dessa leitura, os fatos que a sustentam e a sugestão do que fazer. Identifique o cliente por cliente_id (preferível) ou por termo; termo ambíguo devolve os candidatos em vez de escolher um.",
    inputSchema: {
      type: "object",
      properties: {
        cliente_id: { type: "string", description: "Id exato do cliente, como devolvido por buscar_cliente." },
        termo: { type: "string", description: "Nome, telefone ou e-mail, quando o id não for conhecido." },
        limite: {
          type: "integer",
          description: "Máximo de eventos da linha do tempo. Padrão 30, teto 200.",
          minimum: 1,
          maximum: 200,
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "fila_do_dia",
    title: "Fila do dia",
    description:
      "Com quem falar hoje e por quê, na ordem de atenção do sistema: quem falou por último e não teve resposta fura a fila de qualquer temperatura. Cada linha traz o motivo datado e a sugestão. Quem não tem nenhuma conversa registrada não aparece — não há base para dizer nada sobre essa pessoa.",
    inputSchema: {
      type: "object",
      properties: {
        limite: {
          type: "integer",
          description: "Máximo de pessoas a devolver. Padrão 15, teto 100.",
          minimum: 1,
          maximum: 100,
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "resumo_do_negocio",
    title: "Resumo do negócio",
    description:
      "Faturamento, custos, lucro, margem, meta e ritmo do período, mais a posição de caixa (saldo, reserva, runway, semana negativa) — exatamente os números do Command Center, calculados pelas mesmas funções. Sem lente de produto: é sempre o negócio inteiro.",
    inputSchema: {
      type: "object",
      properties: {
        periodo: {
          type: "string",
          enum: ["semana", "mes", "trimestre", "ano"],
          description: "Período de calendário corrente. Padrão: mes.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "alertas",
    title: "Alertas priorizados",
    description:
      "A Central de Alertas do painel: o que precisa de ação agora, ordenado por quantos reais estão em jogo, com o problema, o contexto e a ação sugerida. Alerta sem valor em R$ mensurável não entra na lista — lista vazia significa 'nada com dinheiro mensurável em jogo', não 'está tudo bem'.",
    inputSchema: {
      type: "object",
      properties: {
        limite: {
          type: "integer",
          description: "Máximo de alertas. Padrão 10, teto 50.",
          minimum: 1,
          maximum: 50,
        },
        severidade: {
          type: "string",
          enum: ["critico", "atencao", "oportunidade"],
          description: "Filtra por severidade. Sem isto, vêm todas.",
        },
      },
      additionalProperties: false,
    },
  },
];

type Executor = (args: Record<string, unknown>) => Promise<ResultadoFerramenta>;

const EXECUTORES: Record<string, Executor> = {
  buscar_cliente: buscarCliente,
  historico_do_cliente: historicoDoCliente,
  fila_do_dia: filaDoDia,
  resumo_do_negocio: resumoDoNegocio,
  alertas,
};

export function ferramentaExiste(nome: string): boolean {
  return Object.prototype.hasOwnProperty.call(EXECUTORES, nome);
}

/**
 * Executa uma ferramenta. Lança `ArgumentoInvalido` quando o CHAMADOR errou
 * (vira -32602) e deixa qualquer outra exceção subir para quem chamou
 * transformá-la em resultado com `isError` — o modelo precisa saber que a
 * ferramenta falhou sem que a conversa inteira caia.
 */
export async function executarFerramenta(
  nome: string,
  args: Record<string, unknown>
): Promise<ResultadoFerramenta> {
  const executor = EXECUTORES[nome];
  if (!executor) throw new ArgumentoInvalido(`Ferramenta desconhecida: ${nome}`);
  return executor(args);
}
