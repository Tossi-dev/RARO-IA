// Testes do mapeamento planilha <-> dominio (Onda P2) -- vitest.
//
// O que estes testes protegem: a conversao e o unico lugar do sistema onde um
// numero pode mudar de valor sem ninguem perceber. "1.234,56" lido como 123456,
// venda em 9x classificada na faixa de taxa errada, data brasileira interpretada
// como americana -- tudo isso passa no build, passa no tipo e so aparece meses
// depois num fechamento que nao bate. Cada caso abaixo trava uma dessas portas.
//
// A outra regra travada aqui: substituicao silenciosa e proibida. Valor que nao
// casa com o dominio cai no neutro E registra aviso em `avisosDeMapeamento`.

import { describe, expect, it, beforeEach } from "vitest";
import { ABAS, ABAS_DERIVADAS, definicaoDaAba, podeEscrever } from "./abas";
import { PALETA_AGRUPAMENTO } from "@/lib/cores";
import type { RegistroImportacao } from "../data/provider";
import type {
  Afiliado,
  Agrupamento,
  Aluno,
  Aula,
  Despesa,
  Encontro,
  Envio,
  Interacao,
  Lancamento,
  Matricula,
  Meta,
  Modulo,
  Pagavel,
  Produto,
  ProgressoAula,
  Recebivel,
} from "@/lib/types";
import {
  afiliadoParaLinha,
  agrupamentoParaLinha,
  alunoParaLinha,
  aulaParaLinha,
  avisosDeMapeamento,
  bracoDeTexto,
  categoriaCaixaDeTexto,
  categoriaFonteDeTexto,
  despesaParaLinha,
  encontroParaLinha,
  envioParaLinha,
  formaPgtoDaVenda,
  importacaoParaLinha,
  interacaoParaLinha,
  lancamentoParaLinha,
  limparAvisosDeMapeamento,
  linhaExtratoParaMovimento,
  linhaParaAfiliado,
  linhaParaAgrupamento,
  linhaParaAluno,
  linhaParaAula,
  linhaParaDespesa,
  linhaParaEncontro,
  linhaParaEnvio,
  linhaParaImportacao,
  linhaParaInteracao,
  linhaParaLancamento,
  linhaParaMatricula,
  linhaParaMeta,
  linhaParaModulo,
  linhaParaPagavel,
  linhaParaProduto,
  linhaParaProgressoAula,
  linhaParaRecebivel,
  matriculaParaLinha,
  metaParaLinha,
  moduloParaLinha,
  pagavelParaLinha,
  periodoAnoMes,
  presentesDaCelula,
  presentesParaCelula,
  produtoParaLinha,
  progressoAulaParaLinha,
  recebivelParaLinha,
  resolverReferenciaDeAgrupamentos,
  statusVendaParaPagamento,
  vendaEhHibrida,
} from "./mapear";

// A planilha entrega tudo como texto (o CSV do gviz nao tem tipo). A escrita
// devolve `unknown` porque numero vai como numero de verdade para a celula.
// Esta ponte simula a viagem de ida e volta pela planilha.
function comoCelulas(linha: Record<string, unknown>): Record<string, string> {
  const saida: Record<string, string> = {};
  for (const [chave, valor] of Object.entries(linha)) {
    if (valor === null || valor === undefined) saida[chave] = "";
    else if (typeof valor === "boolean") saida[chave] = valor ? "Sim" : "Nao";
    else saida[chave] = String(valor);
  }
  return saida;
}

/** Linha de VENDAS com os titulos exatos da aba. */
function linhaVenda(campos: Partial<Record<string, string>> = {}): Record<string, string> {
  return {
    ID: "VEN-0001",
    Timestamp: "",
    Data: "15/03/2026",
    Responsavel: "Ana Souza",
    Produto: "Mentoria Corpo",
    "Canal de origem": "Instagram",
    "Valor da venda": "1000",
    "Forma de pagamento": "Cartao de credito",
    "Valor da entrada": "",
    "N de parcelas": "1",
    "Recebimento cartao": "",
    Comissao: "",
    Status: "Fechada",
    ...campos,
  };
}

beforeEach(() => {
  // Acumulador de avisos e global por desenho (um diagnostico por requisicao):
  // sem limpar, um teste enxergaria o aviso deixado pelo anterior.
  limparAvisosDeMapeamento();
});

describe("formaPgtoDaVenda — a faixa de parcelas decide a taxa", () => {
  it("1x cai em credito_vista", () => {
    expect(formaPgtoDaVenda("Cartao de credito", 1)).toBe("credito_vista");
  });

  it("3x cai em credito_2x6x", () => {
    expect(formaPgtoDaVenda("Cartao de credito", 3)).toBe("credito_2x6x");
  });

  it("9x cai em credito_7x12x", () => {
    expect(formaPgtoDaVenda("Cartao de credito", 9)).toBe("credito_7x12x");
  });

  it("as bordas 6x e 7x ficam em faixas diferentes", () => {
    expect(formaPgtoDaVenda("Cartao de credito", 6)).toBe("credito_2x6x");
    expect(formaPgtoDaVenda("Cartao de credito", 7)).toBe("credito_7x12x");
  });

  it("acima de 12x continua em credito_7x12x (a tabela de taxas para em 12)", () => {
    expect(formaPgtoDaVenda("Cartao de credito", 18)).toBe("credito_7x12x");
  });

  it("Pix ignora o numero de parcelas", () => {
    expect(formaPgtoDaVenda("Pix", 3)).toBe("pix");
  });

  it("debito nao e confundido com credito", () => {
    expect(formaPgtoDaVenda("Cartao de debito", 1)).toBe("debito");
  });

  it("venda hibrida Pix + Cartao segue a regra do cartao", () => {
    expect(vendaEhHibrida("Pix + Cartao")).toBe(true);
    expect(vendaEhHibrida("Pix")).toBe(false);
    expect(formaPgtoDaVenda("Pix + Cartao", 3)).toBe("credito_2x6x");
    expect(formaPgtoDaVenda("Pix + Cartao", 1)).toBe("credito_vista");
  });

  it("Boleto vira pix e AVISA, porque o custo fica subestimado", () => {
    expect(formaPgtoDaVenda("Boleto", 1)).toBe("pix");
    expect(avisosDeMapeamento().join(" ")).toContain("Boleto");
  });

  it("forma desconhecida vira pix e AVISA", () => {
    expect(formaPgtoDaVenda("Permuta", 1)).toBe("pix");
    expect(avisosDeMapeamento()).toHaveLength(1);
    expect(avisosDeMapeamento()[0]).toContain("Permuta");
  });

  it("celula vazia vira pix SEM aviso (ausencia nao e erro)", () => {
    expect(formaPgtoDaVenda("", 1)).toBe("pix");
    expect(avisosDeMapeamento()).toEqual([]);
  });
});

describe("statusVendaParaPagamento — quem diz se foi pago sao os recebiveis", () => {
  it("fechada com todos os recebiveis recebidos vira pago", () => {
    expect(statusVendaParaPagamento("Fechada", true)).toBe("pago");
  });

  it("fechada com recebivel em aberto continua pendente", () => {
    expect(statusVendaParaPagamento("Fechada", false)).toBe("pendente");
  });

  it("reembolsada vira reembolsado independente dos recebiveis", () => {
    expect(statusVendaParaPagamento("Reembolsada", true)).toBe("reembolsado");
  });

  it("cancelada tambem vira reembolsado (StatusPagamento nao tem cancelado)", () => {
    expect(statusVendaParaPagamento("Cancelada", true)).toBe("reembolsado");
  });

  it("status desconhecido vira pendente e AVISA", () => {
    expect(statusVendaParaPagamento("Em analise", true)).toBe("pendente");
    expect(avisosDeMapeamento()[0]).toContain("Em analise");
  });

  it("status vazio vira pendente SEM aviso", () => {
    expect(statusVendaParaPagamento("", true)).toBe("pendente");
    expect(avisosDeMapeamento()).toEqual([]);
  });
});

describe("linhaParaMatricula — numero e data atravessando a fronteira", () => {
  it('"R$ 1.234,56" vira 1234.56 e nao 123456', () => {
    const m = linhaParaMatricula(linhaVenda({ "Valor da venda": "R$ 1.234,56" }));
    expect(m.valor).toBe(1234.56);
    expect(m.valorBruto).toBe(1234.56);
  });

  it("data brasileira vira ISO (15/03/2026 e marco, nao 3 de novembro)", () => {
    const m = linhaParaMatricula(linhaVenda());
    expect(m.data).toBe("2026-03-15");
  });

  it("venda em 1x aplica a taxa de 2,69% no liquido", () => {
    const m = linhaParaMatricula(linhaVenda({ "Valor da venda": "1000", "N de parcelas": "1" }));
    expect(m.formaPgto).toBe("credito_vista");
    expect(m.valorLiquido).toBe(973.1);
    expect(m.taxaGateway).toBe(26.9);
  });

  it("venda em 9x aplica a taxa de 3,99% no liquido", () => {
    const m = linhaParaMatricula(linhaVenda({ "Valor da venda": "9000", "N de parcelas": "9" }));
    expect(m.formaPgto).toBe("credito_7x12x");
    expect(m.valorLiquido).toBe(8640.9);
    expect(m.taxaGateway).toBe(359.1);
  });

  it("venda hibrida usa a soma dos recebiveis, nunca a taxa sobre o valor cheio", () => {
    const linha = linhaVenda({
      "Forma de pagamento": "Pix + Cartao",
      "Valor da venda": "5000",
      "N de parcelas": "3",
    });
    const m = linhaParaMatricula(linha, { liquidoDosRecebiveis: 4900 });
    expect(m.formaPgto).toBe("credito_2x6x");
    expect(m.valorLiquido).toBe(4900);
    expect(m.taxaGateway).toBe(100);
  });

  it('"Recebimento cartao" com data vira dataLiberacao, nao valor', () => {
    const m = linhaParaMatricula(linhaVenda({ "Recebimento cartao": "15/04/2026" }));
    expect(m.dataLiberacao).toBe("2026-04-15");
    expect(m.valorLiquido).toBe(973.1);
  });

  it('"Recebimento cartao" com numero vira o liquido que de fato caiu', () => {
    const m = linhaParaMatricula(linhaVenda({ "Recebimento cartao": "950" }));
    expect(m.dataLiberacao).toBeNull();
    expect(m.valorLiquido).toBe(950);
  });

  it("venda reembolsada nao vira pago mesmo com os recebiveis quitados", () => {
    const m = linhaParaMatricula(linhaVenda({ Status: "Reembolsada" }), { todosRecebidos: true });
    expect(m.statusPagamento).toBe("reembolsado");
  });

  it("as referencias que exigem outras abas ficam vazias para o provider resolver", () => {
    const m = linhaParaMatricula(linhaVenda());
    expect(m.alunoId).toBe("");
    expect(m.produtoId).toBe("");
    expect(m.produtoNome).toBe("Mentoria Corpo");
    expect(m.afiliadoNome).toBe("Ana Souza");
  });
});

describe("categoria de despesa — conhecida x desconhecida", () => {
  it("categoria conhecida cai no plano de contas SEM aviso", () => {
    expect(categoriaCaixaDeTexto("Ferramentas e software")).toBe("saas_ferramentas");
    expect(categoriaCaixaDeTexto("Trafego pago")).toBe("trafego");
    expect(categoriaCaixaDeTexto("Equipe")).toBe("folha_prolabore");
    expect(avisosDeMapeamento()).toEqual([]);
  });

  it("acento e caixa nao atrapalham o casamento", () => {
    expect(categoriaCaixaDeTexto("TRÁFEGO PAGO")).toBe("trafego");
    expect(avisosDeMapeamento()).toEqual([]);
  });

  it("categoria desconhecida cai em outros e AVISA", () => {
    expect(categoriaCaixaDeTexto("Padaria do Ze")).toBe("outros");
    expect(avisosDeMapeamento()).toHaveLength(1);
    expect(avisosDeMapeamento()[0]).toContain("Padaria do Ze");
  });

  it('"Eventos e presencial" cai em outros por decisao do contrato, SEM aviso', () => {
    expect(categoriaCaixaDeTexto("Eventos e presencial")).toBe("outros");
    expect(avisosDeMapeamento()).toEqual([]);
  });

  it("a mesma categoria desconhecida em 200 linhas gera um aviso so", () => {
    for (let i = 0; i < 200; i++) categoriaCaixaDeTexto("Padaria do Ze");
    expect(avisosDeMapeamento()).toHaveLength(1);
  });

  it("Despesa guarda o TEXTO original da categoria (nada se perde)", () => {
    const d = linhaParaDespesa({
      ID: "DES-1",
      Data: "10/02/2026",
      Categoria: "Padaria do Ze",
      Tipo: "Variavel",
      Descricao: "Coffee break",
      Valor: "R$ 89,90",
    });
    expect(d.categoria).toBe("Padaria do Ze");
    expect(d.valor).toBe(89.9);
    expect(d.data).toBe("2026-02-10");
  });

  it("data no formato gviz respeita o mes base zero", () => {
    // Date(2026,11,31) e 31 de DEZEMBRO; ler como novembro joga a despesa de mes.
    const d = linhaParaDespesa({ ID: "DES-2", Data: "Date(2026,11,31)", Valor: "10" });
    expect(d.data).toBe("2026-12-31");
  });
});

describe("categoriaFonteDeTexto — conhecida x desconhecida", () => {
  it("categoria conhecida cai no enum SEM aviso", () => {
    expect(categoriaFonteDeTexto("Curso")).toBe("curso");
    expect(categoriaFonteDeTexto("Mentoria")).toBe("mentoria");
    expect(categoriaFonteDeTexto("Assinatura")).toBe("assinatura");
    expect(avisosDeMapeamento()).toEqual([]);
  });

  it("acento e caixa nao atrapalham o casamento (Servico/Serviço)", () => {
    expect(categoriaFonteDeTexto("SERVIÇO")).toBe("servico");
    expect(avisosDeMapeamento()).toEqual([]);
  });

  it("celula vazia cai em curso SEM aviso", () => {
    expect(categoriaFonteDeTexto("")).toBe("curso");
    expect(avisosDeMapeamento()).toEqual([]);
  });

  it("categoria desconhecida cai em curso e AVISA", () => {
    expect(categoriaFonteDeTexto("Franquia")).toBe("curso");
    expect(avisosDeMapeamento()).toHaveLength(1);
    expect(avisosDeMapeamento()[0]).toContain("Franquia");
  });
});

describe("presentesDaCelula/presentesParaCelula — a coluna multivalorada de ENCONTROS", () => {
  it("celula vazia vira lista vazia, nunca [\"\"]", () => {
    expect(presentesDaCelula("")).toEqual([]);
  });

  it("celula so com espacos tambem vira lista vazia", () => {
    expect(presentesDaCelula("   ")).toEqual([]);
  });

  it("ids separados por virgula e espaco viram array, com o espaco descartado", () => {
    expect(presentesDaCelula("ALU-1, ALU-2, ALU-3")).toEqual(["ALU-1", "ALU-2", "ALU-3"]);
  });

  it("virgula dupla e sobra de espaco nao geram id fantasma", () => {
    expect(presentesDaCelula(" ALU-1 ,, ALU-2 ,  ")).toEqual(["ALU-1", "ALU-2"]);
  });

  it("presentesParaCelula e o caminho inverso, com virgula e espaco", () => {
    expect(presentesParaCelula(["ALU-1", "ALU-2", "ALU-3"])).toBe("ALU-1, ALU-2, ALU-3");
  });

  it("presentesParaCelula de lista vazia devolve celula vazia", () => {
    expect(presentesParaCelula([])).toBe("");
  });

  it("ida e volta preserva a lista de presenca", () => {
    const ids = ["ALU-1", "ALU-2", "ALU-3"];
    expect(presentesDaCelula(presentesParaCelula(ids))).toEqual(ids);
  });
});

describe("Pagavel — status derivado, nunca digitado as cegas", () => {
  it("vencido e sem pagamento vira atrasado", () => {
    const p = linhaParaPagavel(
      { ID: "DES-3", Vencimento: "01/01/2026", Status: "A vencer", Valor: "100" },
      "2026-03-01"
    );
    expect(p.status).toBe("atrasado");
  });

  it("data de pagamento preenchida vence o status escrito na celula", () => {
    const p = linhaParaPagavel(
      {
        ID: "DES-4",
        Vencimento: "01/01/2026",
        Status: "A vencer",
        "Data pagamento": "05/01/2026",
        Valor: "100",
      },
      "2026-03-01"
    );
    expect(p.status).toBe("pago");
    expect(p.dataPagamento).toBe("2026-01-05");
  });

  it("ainda no prazo continua a_vencer", () => {
    const p = linhaParaPagavel(
      { ID: "DES-5", Vencimento: "30/12/2026", Status: "A vencer", Valor: "100" },
      "2026-03-01"
    );
    expect(p.status).toBe("a_vencer");
  });
});

describe("Recebivel — parcela e atraso", () => {
  it('extrai "Parcela 2/6" da descricao', () => {
    const r = linhaParaRecebivel(
      {
        ID: "REC-1",
        ID_Venda: "VEN-1",
        Descricao: "Parcela 2/6",
        Vencimento: "10/04/2026",
        Valor: "500",
        Status: "A vencer",
        "Forma de pagamento": "Cartao de credito",
      },
      { hoje: "2026-01-01", diasLiberacaoCartao: 30 }
    );
    expect(r.parcela).toBe(2);
    expect(r.totalParcelas).toBe(6);
    expect(r.diasLiberacao).toBe(30);
    expect(r.origem).toBe("matricula");
    expect(r.origemId).toBe("VEN-1");
  });

  it("sem ID_Venda o recebivel e manual", () => {
    const r = linhaParaRecebivel(
      { ID: "REC-2", ID_Venda: "", Descricao: "Consultoria avulsa", Valor: "300" },
      { hoje: "2026-01-01" }
    );
    expect(r.origem).toBe("manual");
    expect(r.origemId).toBeNull();
  });

  it("vencido e nao recebido vira atrasado", () => {
    const r = linhaParaRecebivel(
      { ID: "REC-3", Vencimento: "10/01/2026", Status: "A vencer", Valor: "500" },
      { hoje: "2026-03-01" }
    );
    expect(r.status).toBe("atrasado");
  });
});

describe("periodoAnoMes — tudo converge para YYYY-MM", () => {
  it("aceita data completa, mm/aaaa e aaaa-mm", () => {
    expect(periodoAnoMes("15/08/2026")).toBe("2026-08");
    expect(periodoAnoMes("08/2026")).toBe("2026-08");
    expect(periodoAnoMes("2026-8")).toBe("2026-08");
    expect(periodoAnoMes("")).toBe("");
  });
});

describe("Meta — indicador errado e pior que meta ausente", () => {
  it("indicador desconhecido RECUSA a meta e AVISA", () => {
    const m = linhaParaMeta({
      ID: "MET-9",
      "Tipo de meta": "Seguidores",
      Referencia: "",
      Periodo: "08/2026",
      "Meta (R$)": "1000",
    });
    expect(m).toBeNull();
    expect(avisosDeMapeamento()[0]).toContain("Seguidores");
  });

  it("meta monetaria le Meta (R$) e meta de contagem le Meta (n)", () => {
    const fat = linhaParaMeta({
      ID: "MET-1",
      "Tipo de meta": "Faturamento",
      Referencia: "corpo",
      Periodo: "08/2026",
      "Meta (R$)": "R$ 120.000,00",
      "Meta (n)": "999",
    });
    expect(fat?.valor).toBe(120000);
    expect(fat?.escopo).toBe("braco");
    expect(fat?.escopoRef).toBe("corpo");

    const vendas = linhaParaMeta({
      ID: "MET-2",
      "Tipo de meta": "Vendas",
      Referencia: "",
      Periodo: "08/2026",
      "Meta (R$)": "999",
      "Meta (n)": "30",
    });
    expect(vendas?.valor).toBe(30);
    expect(vendas?.escopo).toBe("global");
  });
});

describe("Meta — Referencia resolve agrupamento CADASTRADO (não só os 3 nomes legados)", () => {
  it("resolverReferenciaDeAgrupamentos casa por id exato", () => {
    const agrupamentos = [{ id: "AGR-7", nome: "Time comercial", cor: "#8D70FF", ordem: 1, ativo: true }];
    const resolver = resolverReferenciaDeAgrupamentos(agrupamentos);
    expect(resolver("AGR-7")).toEqual({ escopo: "braco", escopoRef: "AGR-7" });
  });

  it("resolverReferenciaDeAgrupamentos casa por nome normalizado (acento, caixa, espaço)", () => {
    const agrupamentos = [{ id: "AGR-7", nome: "Time Comercial", cor: "#8D70FF", ordem: 1, ativo: true }];
    const resolver = resolverReferenciaDeAgrupamentos(agrupamentos);
    expect(resolver("  time   comercial  ")).toEqual({ escopo: "braco", escopoRef: "AGR-7" });
    expect(resolver("TIME COMERCIAL")).toEqual({ escopo: "braco", escopoRef: "AGR-7" });
  });

  it("resolverReferenciaDeAgrupamentos devolve null quando nada bate", () => {
    const agrupamentos = [{ id: "AGR-7", nome: "Time comercial", cor: "#8D70FF", ordem: 1, ativo: true }];
    expect(resolverReferenciaDeAgrupamentos(agrupamentos)("Marketing")).toBeNull();
  });

  it("linhaParaMeta usa o resolver para achar o agrupamento criado pelo cliente", () => {
    const agrupamentos = [{ id: "AGR-9", nome: "Time Comercial", cor: "#8D70FF", ordem: 1, ativo: true }];
    const m = linhaParaMeta(
      {
        ID: "MET-10",
        "Tipo de meta": "Faturamento",
        Referencia: "time comercial",
        Periodo: "08/2026",
        "Meta (R$)": "50000",
      },
      resolverReferenciaDeAgrupamentos(agrupamentos)
    );
    expect(m?.escopo).toBe("braco");
    expect(m?.escopoRef).toBe("AGR-9");
    expect(avisosDeMapeamento()).toEqual([]);
  });

  it("os 3 nomes legados continuam resolvendo mesmo sem o agrupamento estar cadastrado", () => {
    // Cliente antigo escreveu metas para "corpo"/"mente"/"espirito" antes de agrupamento
    // virar cadastro; sem o resolver (nem sequer chamado aqui), essas metas nao podem
    // parar de ser lidas so porque ninguem recriou o cadastro com esses tres nomes.
    const semAgrupamentos = linhaParaMeta({
      ID: "MET-11",
      "Tipo de meta": "Faturamento",
      Referencia: "Espírito",
      Periodo: "08/2026",
      "Meta (R$)": "9000",
    });
    expect(semAgrupamentos?.escopo).toBe("braco");
    expect(semAgrupamentos?.escopoRef).toBe("espirito");
    expect(avisosDeMapeamento()).toEqual([]);
  });

  it("legado tem prioridade sobre o resolver quando os dois bateriam", () => {
    // Cliente cadastrou um agrupamento chamado "Corpo" (id proprio, ex.: AGR-1);
    // a leitura ainda cai no braco legado "corpo", nao no id do cadastro -- o
    // dicionario legado e checado primeiro (ver comentario de BRACOS, mapear.ts).
    const agrupamentos = [{ id: "AGR-1", nome: "Corpo", cor: "#FF7A5C", ordem: 1, ativo: true }];
    const m = linhaParaMeta(
      {
        ID: "MET-12",
        "Tipo de meta": "Faturamento",
        Referencia: "Corpo",
        Periodo: "08/2026",
        "Meta (R$)": "9000",
      },
      resolverReferenciaDeAgrupamentos(agrupamentos)
    );
    expect(m?.escopoRef).toBe("corpo");
  });

  it("referencia que nao bate com nada AVISA em vez de chutar em silencio", () => {
    const agrupamentos = [{ id: "AGR-9", nome: "Time Comercial", cor: "#8D70FF", ordem: 1, ativo: true }];
    const m = linhaParaMeta(
      {
        ID: "MET-13",
        "Tipo de meta": "Faturamento",
        Referencia: "Marketing Digital",
        Periodo: "08/2026",
        "Meta (R$)": "9000",
      },
      resolverReferenciaDeAgrupamentos(agrupamentos)
    );
    // Ainda preserva o texto como referencia de afiliado (nao perde a meta)...
    expect(m?.escopo).toBe("afiliado");
    expect(m?.escopoRef).toBe("Marketing Digital");
    // ...mas o chute agora fica visivel.
    expect(avisosDeMapeamento()).toHaveLength(1);
    expect(avisosDeMapeamento()[0]).toContain("Marketing Digital");
  });

  it("sem resolver nenhum (provider nao passou agrupamentos), referencia desconhecida tambem AVISA", () => {
    const m = linhaParaMeta({
      ID: "MET-14",
      "Tipo de meta": "Faturamento",
      Referencia: "Alguem Que Nao Existe",
      Periodo: "08/2026",
      "Meta (R$)": "9000",
    });
    expect(m?.escopo).toBe("afiliado");
    expect(avisosDeMapeamento()).toHaveLength(1);
  });
});

describe("bracoDeTexto — sem valor neutro", () => {
  it("celula vazia vira null, nunca um agrupamento chutado", () => {
    expect(bracoDeTexto("")).toBeNull();
    expect(bracoDeTexto("   ")).toBeNull();
  });

  it("celula preenchida flui como o id do agrupamento, sem validar contra lista fixa", () => {
    expect(bracoDeTexto("AGR-7")).toBe("AGR-7");
    expect(bracoDeTexto("qualquer coisa que o dono cadastrou")).toBe("qualquer coisa que o dono cadastrou");
  });
});

describe("linhaParaAfiliado — responsável sem agrupamento não vira 'corpo'", () => {
  it("Braco em branco vira null (nao o primeiro agrupamento da lista)", () => {
    const a = linhaParaAfiliado({
      ID: "RES-9",
      Nome: "Bruno Lima",
      Braco: "",
      "Comissao padrao (%)": "20",
      Ativo: "Sim",
    });
    expect(a.braco).toBeNull();
    // Celula vazia nao e erro de preenchimento (ver bracoDeTexto): sem aviso.
    expect(avisosDeMapeamento()).toEqual([]);
  });

  it("Braco preenchido flui como o id do cadastro do usuario", () => {
    const a = linhaParaAfiliado({
      ID: "RES-10",
      Nome: "Carla Nogueira",
      Braco: "AGR-4",
      "Comissao padrao (%)": "25",
      Ativo: "Sim",
    });
    expect(a.braco).toBe("AGR-4");
  });

  it("Afiliado com braco null sobrevive ao round-trip (grava celula vazia, le null de volta)", () => {
    const a: Afiliado = {
      id: "RES-11",
      nome: "Diego Prado",
      braco: null,
      pctPadrao: 15,
      ativo: true,
      metaMensal: 0,
      whatsapp: "",
      chavePix: "",
    };
    expect(linhaParaAfiliado(comoCelulas(afiliadoParaLinha(a)))).toEqual(a);
  });
});

describe("Agrupamento — tolerância à planilha preenchida à mão", () => {
  it("Cor em branco cai na primeira cor da paleta, nunca string vazia", () => {
    const a = linhaParaAgrupamento({ ID: "AGR-2", Nome: "Mente", Cor: "", Ordem: "2", Ativo: "Sim" });
    expect(a.cor).toBe(PALETA_AGRUPAMENTO[0]);
  });

  it("Ordem ausente vira 0 e Ativo ausente vira false, como nos vizinhos (Produto.ativo etc.)", () => {
    const a = linhaParaAgrupamento({ ID: "AGR-3", Nome: "Espírito", Cor: "#9B7BFF" });
    expect(a.ordem).toBe(0);
    expect(a.ativo).toBe(false);
  });

  it("Ordem em formato numérico brasileiro é lida corretamente", () => {
    const a = linhaParaAgrupamento({ ID: "AGR-4", Nome: "Corpo", Cor: "#FF7A5C", Ordem: "1.234", Ativo: "Sim" });
    expect(a.ordem).toBe(1234);
  });

  it("Ativo aceita variação em português ('não') como falso", () => {
    const a = linhaParaAgrupamento({ ID: "AGR-5", Nome: "Mente", Cor: "#46B6F0", Ordem: "1", Ativo: "Não" });
    expect(a.ativo).toBe(false);
  });
});

describe("ida e volta — a planilha devolve o que recebeu", () => {
  it("Matricula sobrevive ao round-trip nos campos que a planilha guarda", () => {
    const m: Matricula = {
      id: "VEN-77",
      alunoId: "",
      produtoId: "",
      lancamentoId: null,
      afiliadoId: null,
      turmaId: null,
      valor: 3000,
      formaPgto: "credito_2x6x",
      valorLiquido: 2907.3,
      data: "2026-03-15",
      statusPagamento: "pago",
      origem: "Instagram",
      isUpsell: false,
      valorBruto: 3000,
      produtoNome: "Mentoria Corpo",
      afiliadoNome: "Ana Souza",
    };

    const volta = linhaParaMatricula(comoCelulas(matriculaParaLinha(m)), { todosRecebidos: true });

    expect(volta.id).toBe(m.id);
    expect(volta.valor).toBe(3000);
    expect(volta.formaPgto).toBe("credito_2x6x");
    expect(volta.valorLiquido).toBe(2907.3);
    expect(volta.data).toBe("2026-03-15");
    expect(volta.statusPagamento).toBe("pago");
    expect(volta.origem).toBe("Instagram");
    expect(volta.produtoNome).toBe("Mentoria Corpo");
    expect(volta.afiliadoNome).toBe("Ana Souza");
    expect(avisosDeMapeamento()).toEqual([]);
  });

  it("Despesa sobrevive ao round-trip", () => {
    const d: Despesa = {
      id: "DES-77",
      data: "2026-02-10",
      descricao: "Assinatura Figma",
      categoria: "Ferramentas e software",
      tipo: "fixa",
      valor: 89.9,
      braco: null,
      lancamentoId: null,
    };
    expect(linhaParaDespesa(comoCelulas(despesaParaLinha(d)))).toEqual(d);
  });

  it("Pagavel sobrevive ao round-trip, inclusive a categoria tipada", () => {
    const p: Pagavel = {
      id: "DES-88",
      categoria: "saas_ferramentas",
      fornecedor: "Figma Inc",
      descricao: "Assinatura Figma",
      valor: 89.9,
      vencimento: "2026-02-10",
      dataPagamento: "2026-02-09",
      status: "pago",
      tipo: "fixa",
      braco: null,
      origem: "despesa",
      origemId: "DES-88",
      contaId: null,
    };
    expect(linhaParaPagavel(comoCelulas(pagavelParaLinha(p)), "2026-03-01")).toEqual(p);
  });

  it("Recebivel sobrevive ao round-trip", () => {
    const r: Recebivel = {
      id: "REC-88",
      origem: "matricula",
      origemId: "VEN-77",
      descricao: "Parcela 2/6",
      valor: 500,
      vencimento: "2026-04-10",
      dataRecebimento: "2026-04-10",
      status: "recebido",
      gateway: "manual",
      diasLiberacao: 30,
      parcela: 2,
      totalParcelas: 6,
      braco: null,
      contaId: null,
    };
    const volta = linhaParaRecebivel(comoCelulas(recebivelParaLinha(r, "Ana Souza")), {
      hoje: "2026-05-01",
      diasLiberacaoCartao: 30,
    });
    expect(volta).toEqual(r);
  });

  it("Aluno sobrevive ao round-trip", () => {
    const a: Aluno = {
      id: "ALU-1",
      nome: "Maria Silva",
      telefone: "11 99999-0000",
      email: "maria@exemplo.com",
      statusFunil: "potencial",
      estagioId: "etapa-qualificado",
      origem: "Indicacao",
      primeiroContato: "2026-01-05",
      observacoes: "Quer comecar em marco",
    };
    expect(linhaParaAluno(comoCelulas(alunoParaLinha(a, "Ana Souza", "LEA-1")))).toEqual(a);
  });

  it("Meta sobrevive ao round-trip", () => {
    const m: Meta = {
      id: "MET-77",
      indicador: "faturamento",
      escopo: "afiliado",
      escopoRef: "Ana Souza",
      periodo: "2026-05",
      valor: 50000,
    };
    expect(linhaParaMeta(comoCelulas(metaParaLinha(m)))).toEqual(m);
  });

  it("Produto sobrevive ao round-trip, inclusive braco e categoria", () => {
    const p: Produto = {
      id: "PRO-1",
      nome: "Mentoria Corpo",
      tipo: "high_ticket",
      precoBase: 4997,
      ativo: true,
      braco: "corpo",
      categoria: "mentoria",
    };
    expect(linhaParaProduto(comoCelulas(produtoParaLinha(p)))).toEqual(p);
  });

  it("Agrupamento sobrevive ao round-trip", () => {
    const a: Agrupamento = {
      id: "AGR-1",
      nome: "Corpo",
      cor: "#FF7A5C",
      ordem: 1,
      ativo: true,
    };
    expect(linhaParaAgrupamento(comoCelulas(agrupamentoParaLinha(a)))).toEqual(a);
  });

  it("Afiliado sobrevive ao round-trip", () => {
    const a: Afiliado = {
      id: "RES-1",
      nome: "Ana Souza",
      braco: "mente",
      pctPadrao: 25,
      ativo: true,
      metaMensal: 30000,
      whatsapp: "11 98888-0000",
      chavePix: "ana@exemplo.com",
    };
    expect(linhaParaAfiliado(comoCelulas(afiliadoParaLinha(a)))).toEqual(a);
  });

  it("Lancamento sobrevive ao round-trip", () => {
    const l: Lancamento = {
      id: "LAN-1",
      nome: "Turma de abril",
      produtoId: "PRO-1",
      inicio: "2026-04-01",
      fim: "2026-04-30",
      status: "ativo",
      metaFaturamento: 200000,
      descricao: "Lancamento semente",
    };
    expect(linhaParaLancamento(comoCelulas(lancamentoParaLinha(l)))).toEqual(l);
  });

  it("Modulo sobrevive ao round-trip", () => {
    const m: Modulo = {
      id: "MOD-1",
      produtoId: "PRO-1",
      nome: "Fundamentos",
      ordem: 1,
      descricao: "Base antes da pratica",
    };
    expect(linhaParaModulo(comoCelulas(moduloParaLinha(m)))).toEqual(m);
  });

  it("Aula sobrevive ao round-trip", () => {
    const a: Aula = {
      id: "AUL-1",
      moduloId: "MOD-1",
      produtoId: "PRO-1",
      titulo: "Introducao",
      ordem: 1,
      duracaoMin: 12,
      tipo: "ao_vivo",
    };
    expect(linhaParaAula(comoCelulas(aulaParaLinha(a)))).toEqual(a);
  });

  it("ProgressoAula sobrevive ao round-trip, com hora em Concluida em", () => {
    const p: ProgressoAula = {
      id: "PRG-1",
      alunoId: "ALU-1",
      aulaId: "AUL-1",
      produtoId: "PRO-1",
      concluida: true,
      concluidaEm: "2026-03-15T14:32:00",
      minutosAssistidos: 11,
    };
    expect(linhaParaProgressoAula(comoCelulas(progressoAulaParaLinha(p)))).toEqual(p);
  });

  it("ProgressoAula nao concluida guarda concluidaEm como null", () => {
    const p: ProgressoAula = {
      id: "PRG-2",
      alunoId: "ALU-2",
      aulaId: "AUL-1",
      produtoId: "PRO-1",
      concluida: false,
      concluidaEm: null,
      minutosAssistidos: 3,
    };
    expect(linhaParaProgressoAula(comoCelulas(progressoAulaParaLinha(p)))).toEqual(p);
  });

  it("Encontro sobrevive ao round-trip, inclusive a lista de presenca", () => {
    const e: Encontro = {
      id: "ENC-1",
      turmaId: "TUR-1",
      titulo: "Aula ao vivo de abertura",
      data: "2026-04-02",
      presentes: ["ALU-1", "ALU-2", "ALU-3"],
    };
    expect(linhaParaEncontro(comoCelulas(encontroParaLinha(e)))).toEqual(e);
  });

  it("Encontro sem nenhum presente guarda lista vazia (celula Presentes fica em branco)", () => {
    const e: Encontro = {
      id: "ENC-2",
      turmaId: "TUR-1",
      titulo: "Aula cancelada",
      data: "2026-04-09",
      presentes: [],
    };
    const linha = encontroParaLinha(e);
    expect(linha.Presentes).toBe("");
    expect(linhaParaEncontro(comoCelulas(linha))).toEqual(e);
  });
});

// ---------------------------------------------------------------------------
// Contrato das abas da coleta automatica
//
// COBRANCAS, INGESTAO e DESPESAS_RECORRENTES so servem para alguma coisa se o
// sistema puder ESCREVER nelas: as tres nascem de evento automatico, nao de
// alguem digitando. Uma delas cair na porta de seguranca por engano nao produz
// erro visivel -- produz um painel que simplesmente para de receber dado novo,
// que e o modo de falha mais caro que este repositorio conhece.
// ---------------------------------------------------------------------------

/** Os tres cabecalhos, na ordem em que o .gs cria a aba. */
const CABECALHOS_DA_COLETA: Record<string, string[]> = {
  COBRANCAS: [
    "ID",
    "Timestamp",
    "ID_Aluno",
    "ID_Venda",
    "Produto",
    "Responsavel",
    "Descricao",
    "Valor",
    "Vencimento",
    "TxID",
    "Chave Pix",
    "Link de pagamento",
    "Copia e cola",
    "Status",
    "Data pagamento",
    "Pagador nome",
    "Pagador documento",
    "Origem",
  ],
  INGESTAO: [
    "ID",
    "Recebido em",
    "Origem",
    "Tipo de evento",
    "Identificador externo",
    "Resumo",
    "Payload",
    "Status",
    "Aba destino",
    "ID gerado",
    "Erro",
  ],
  DESPESAS_RECORRENTES: [
    "ID",
    "Descricao",
    "Categoria",
    "Tipo",
    "Fornecedor",
    "Valor",
    "Dia do vencimento",
    "Forma de pagamento",
    "Inicio",
    "Fim",
    "Ativo",
    "Ultimo lancamento",
  ],
};

const ABAS_DA_COLETA = Object.keys(CABECALHOS_DA_COLETA);

/**
 * Copia da `chaveAba()` do raro-sync.gs. O Apps Script so roda na
 * infraestrutura do Google, entao a unica forma de testar a regra dele daqui e
 * reproduzi-la -- e a regra e curta o bastante para isso valer a pena.
 */
function chaveAba(nome: string): string {
  return nome
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[\s._\-]+/g, "_");
}

/** A mesma lista de ABAS_PROIBIDAS do raro-sync.gs. */
const ABAS_PROIBIDAS_NO_GS = ["PAINEL", "DRE", "FLUXO_CAIXA", "INSTRUCOES", "CONFIG"];

describe("contrato das abas da coleta automatica", () => {
  it.each(ABAS_DA_COLETA)("%s existe no contrato como aba de entrada do sistema", (nome: string) => {
    const def = definicaoDaAba(nome);
    expect(def).not.toBeNull();
    expect(def?.nome).toBe(nome);
    expect(def?.papel).toBe("entrada");
    expect(def?.origem).toBe("sistema");
    expect(def?.descricao.length).toBeGreaterThan(0);
  });

  it.each(ABAS_DA_COLETA)("podeEscrever('%s') e true", (nome: string) => {
    expect(podeEscrever(nome)).toBe(true);
  });

  it.each(ABAS_DA_COLETA)(
    "%s tem exatamente os titulos que o .gs escreve na linha 1, na mesma ordem",
    (nome: string) => {
      const titulos = definicaoDaAba(nome)?.colunas.map((c) => c.titulo);
      expect(titulos).toEqual(CABECALHOS_DA_COLETA[nome]);
    }
  );

  it.each(ABAS_DA_COLETA)("%s nao e derivada nem cai na guarda do .gs", (nome: string) => {
    expect(ABAS_DERIVADAS).not.toContain(nome);
    // abaProibida() do .gs compara por chave canonica dos DOIS lados, entao a
    // conferencia aqui precisa ser a mesma: um indexOf cru deixaria passar uma
    // colisao de grafia que o script pegaria.
    const chave = chaveAba(nome);
    expect(ABAS_PROIBIDAS_NO_GS.map(chaveAba)).not.toContain(chave);
  });

  it("nenhum nome de aba do contrato colide por chave canonica com outro", () => {
    const chaves = ABAS.map((a) => chaveAba(a.nome));
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it("toda coluna das tres abas tem chave e titulo preenchidos e sem repeticao", () => {
    for (const nome of ABAS_DA_COLETA) {
      const colunas = definicaoDaAba(nome)?.colunas ?? [];
      expect(colunas.length).toBeGreaterThan(0);
      for (const coluna of colunas) {
        expect(coluna.chave).not.toBe("");
        expect(coluna.titulo).not.toBe("");
      }
      expect(new Set(colunas.map((c) => c.chave)).size).toBe(colunas.length);
      expect(new Set(colunas.map((c) => c.titulo.toLowerCase())).size).toBe(colunas.length);
    }
  });
});

// ---------------------------------------------------------------------------
// Contrato da aba IMPORTACOES — livro-razão da importação de extrato
//
// Ela só serve para alguma coisa se puder REGISTRAR o que já foi trazido para
// dentro do sistema: reenviar um extrato que se sobrepõe ao anterior é o uso
// NORMAL do cliente (semanal em cima de diário, mensal em cima de semanal), e
// sem esta aba o mesmo lançamento duplicaria em MOVIMENTOS sem ninguém
// perceber até o fechamento do mês.
// ---------------------------------------------------------------------------

/** O cabeçalho exato que o .gs escreve na linha 1 de IMPORTACOES (ver ABAS_NOVAS). */
const CABECALHO_IMPORTACOES = [
  "ID",
  "Impressao_Digital",
  "Data",
  "Descricao",
  "Valor",
  "Tipo",
  "Documento",
  "Origem",
  "ID_Conta",
  "ID_Movimento",
  "Importado_Em",
];

describe("contrato da aba IMPORTACOES", () => {
  it("existe no contrato como aba de entrada do sistema", () => {
    const def = definicaoDaAba("IMPORTACOES");
    expect(def).not.toBeNull();
    expect(def?.papel).toBe("entrada");
    expect(def?.origem).toBe("sistema");
    expect(def?.descricao.length).toBeGreaterThan(0);
  });

  it("podeEscrever('IMPORTACOES') e true", () => {
    expect(podeEscrever("IMPORTACOES")).toBe(true);
  });

  it("tem exatamente os titulos que o .gs escreve na linha 1, na mesma ordem", () => {
    const titulos = definicaoDaAba("IMPORTACOES")?.colunas.map((c) => c.titulo);
    expect(titulos).toEqual(CABECALHO_IMPORTACOES);
  });

  it("nao e derivada nem cai na guarda do .gs", () => {
    expect(ABAS_DERIVADAS).not.toContain("IMPORTACOES");
    const chave = chaveAba("IMPORTACOES");
    expect(ABAS_PROIBIDAS_NO_GS.map(chaveAba)).not.toContain(chave);
  });
});

describe("IMPORTACOES — ida e volta, e a conversao para MOVIMENTOS", () => {
  it("RegistroImportacao (entrada, com documento) sobrevive ao round-trip", () => {
    const r: RegistroImportacao = {
      id: "IMP-1",
      impressaoDigital: "doc:abc123",
      data: "2026-03-10",
      descricao: "PIX RECEBIDO JOAO",
      valor: 500,
      tipo: "entrada",
      documento: "ABC123",
      origem: "ofx",
      contaId: "CTA-1",
      movimentoId: "MOV-9",
      importadoEm: "2026-03-11T09:00:00.000Z",
    };
    expect(linhaParaImportacao(comoCelulas(importacaoParaLinha(r)))).toEqual(r);
  });

  it("RegistroImportacao (saida, sem documento, origem csv) sobrevive ao round-trip", () => {
    const r: RegistroImportacao = {
      id: "IMP-2",
      impressaoDigital: "sd:2026-03-10:-4590:tarifa manutencao conta",
      data: "2026-03-10",
      descricao: "TARIFA MANUTENCAO CONTA",
      valor: -45.9,
      tipo: "saida",
      documento: "",
      origem: "csv",
      contaId: "CTA-1",
      movimentoId: "MOV-10",
      importadoEm: "2026-03-11T09:00:00.000Z",
    };
    expect(linhaParaImportacao(comoCelulas(importacaoParaLinha(r)))).toEqual(r);
  });

  it("origem desconhecida na celula cai em texto (nunca quebra a leitura)", () => {
    const linha = importacaoParaLinha({
      id: "IMP-3",
      impressaoDigital: "sd:2026-01-01:100:teste",
      data: "2026-01-01",
      descricao: "teste",
      valor: 1,
      tipo: "entrada",
      documento: "",
      origem: "ofx",
      contaId: "CTA-1",
      movimentoId: "MOV-1",
      importadoEm: "2026-01-01T00:00:00.000Z",
    });
    const celulas = comoCelulas({ ...linha, Origem: "algo-invalido" });
    expect(linhaParaImportacao(celulas).origem).toBe("texto");
  });

  it("linhaExtratoParaMovimento grava valor sempre positivo, com a direcao vinda do tipo", () => {
    const entrada = linhaExtratoParaMovimento(
      {
        data: "2026-03-10",
        descricao: "PIX RECEBIDO",
        valor: 500,
        tipo: "entrada",
        documento: "ABC",
        impressaoDigital: "doc:abc",
        categoria: "vendas",
      },
      "CTA-1"
    );
    expect(entrada.direcao).toBe("entrada");
    expect(entrada.valor).toBe(500);
    expect(entrada.contaId).toBe("CTA-1");
    expect(entrada.status).toBe("realizado");
    expect(entrada.categoria).toBe("vendas");

    const saida = linhaExtratoParaMovimento(
      {
        data: "2026-03-10",
        descricao: "TARIFA",
        valor: -45.9,
        tipo: "saida",
        documento: "",
        impressaoDigital: "sd:x",
        categoria: "taxas_gateway",
      },
      "CTA-1"
    );
    expect(saida.direcao).toBe("saida");
    // sempre positivo -- a invariante de MovimentoCaixa e que o sinal vive em `direcao`.
    expect(saida.valor).toBe(45.9);
    // a categoria vem da PROPRIA linha, escolhida no passo de conferencia --
    // nao um valor fixo (bug corrigido: antes caia sempre em "outros").
    expect(saida.categoria).toBe("taxas_gateway");
  });
});

// ============================================================
// INTERACOES e ENVIOS -- as abas do atendimento por WhatsApp
//
// Sao escritas so pelo sistema, entao o risco aqui nao e grafia divergente do
// dono: e texto de TERCEIRO. O que chega nestas celulas foi digitado no celular
// de um cliente, e a planilha interpreta como formula tudo que comeca com "=",
// "+", "-" ou "@". Os casos abaixo travam essa porta e a do status de envio,
// que se cair no neutro errado manda mensagem que ninguem aprovou.
// ============================================================

describe("INTERACOES <-> Interacao", () => {
  const interacao: Interacao = {
    id: "INT-1",
    alunoId: "ALU-1",
    canal: "whatsapp",
    direcao: "recebida",
    texto: "Bom dia, ainda tem vaga?",
    quando: "2026-03-01T13:45:00.000Z",
    idExterno: "false_5514991234567@c.us_ABC123",
    tipoMidia: "",
    nomeExibicao: "Joana da Padaria",
    telefone: "5514991234567",
  };

  it("ida e volta preserva a mensagem inteira, inclusive a hora", () => {
    const volta = linhaParaInteracao(comoCelulas(interacaoParaLinha(interacao)));
    expect(volta).toEqual(interacao);
  });

  it("texto que comeca com = nao vira formula na planilha", () => {
    // "=1+1" numa celula viraria 2, e o dono leria um numero no lugar da
    // mensagem do cliente -- perda silenciosa de conteudo.
    const linha = interacaoParaLinha({ ...interacao, texto: "=1+1" });
    expect(linha.Texto).toBe("'=1+1");
    const linhaMenos = interacaoParaLinha({ ...interacao, texto: "-50% hoje" });
    expect(linhaMenos.Texto).toBe("'-50% hoje");
  });

  it("direcao desconhecida cai em recebida, nunca em enviada", () => {
    // Marcar como "enviada" uma mensagem do cliente apagaria o sinal mais
    // urgente do CRM: alguem esperando resposta.
    const volta = linhaParaInteracao({ ID: "INT-9", ID_Aluno: "ALU-1", Direcao: "sei la" });
    expect(volta.direcao).toBe("recebida");
  });

  it("aba vazia devolve interacao vazia em vez de data invalida", () => {
    const volta = linhaParaInteracao({});
    expect(volta.quando).toBe("");
    expect(volta.idExterno).toBe("");
  });
});

describe("ENVIOS <-> Envio", () => {
  const envio: Envio = {
    id: "ENV-1",
    alunoId: "ALU-1",
    telefone: "5514991234567",
    texto: "Oi Joana, temos vaga sim!",
    autorizadoPor: "Tossi",
    autorizadoEm: "2026-03-01T14:00:00.000Z",
    status: "aprovado",
    enviadoEm: "",
    idExterno: "",
    erro: "",
  };

  it("ida e volta preserva a linha da fila", () => {
    const volta = linhaParaEnvio(comoCelulas(envioParaLinha(envio)));
    expect(volta).toEqual(envio);
  });

  it("status irreconhecivel NUNCA vira aprovado", () => {
    // Cair no neutro aqui entregaria ao agente local uma mensagem que ninguem
    // autorizou -- o unico erro deste modulo que chega no celular de um cliente.
    expect(linhaParaEnvio({ ID: "ENV-9", Status: "" }).status).toBe("falhou");
    expect(linhaParaEnvio({ ID: "ENV-9", Status: "pendente" }).status).toBe("falhou");
    expect(linhaParaEnvio({ ID: "ENV-9", Status: "Aprovado" }).status).toBe("aprovado");
  });

  it("o resultado do envio volta com id externo e erro", () => {
    const falhou = linhaParaEnvio(
      comoCelulas(
        envioParaLinha({
          ...envio,
          status: "falhou",
          enviadoEm: "2026-03-01T14:05:00.000Z",
          erro: "numero nao existe no WhatsApp",
        })
      )
    );
    expect(falhou.status).toBe("falhou");
    expect(falhou.erro).toBe("numero nao existe no WhatsApp");
  });
});

describe("abas do atendimento declaradas no contrato", () => {
  it("INTERACOES e ENVIOS existem, sao de entrada e podem ser escritas", () => {
    for (const nome of ["INTERACOES", "ENVIOS"]) {
      const def = definicaoDaAba(nome);
      expect(def).not.toBeNull();
      expect(def?.papel).toBe("entrada");
      expect(def?.origem).toBe("sistema");
      expect(podeEscrever(nome)).toBe(true);
    }
  });

  it("todo campo gravado tem coluna declarada -- e o contrario tambem", () => {
    // Coluna gravada e nao declarada some na planilha sem erro nenhum; coluna
    // declarada e nunca gravada vira cabecalho vazio que o dono nao entende.
    const interacao = interacaoParaLinha({
      id: "1", alunoId: "2", canal: "whatsapp", direcao: "recebida", texto: "x",
      quando: "2026-03-01T13:45:00.000Z", idExterno: "y", tipoMidia: "", nomeExibicao: "z",
      telefone: "5514991234567",
    });
    const titulosInteracao = definicaoDaAba("INTERACOES")?.colunas.map((c) => c.titulo) ?? [];
    expect(Object.keys(interacao).sort()).toEqual([...titulosInteracao].sort());

    const envio = envioParaLinha({
      id: "1", alunoId: "2", telefone: "3", texto: "x", autorizadoPor: "p",
      autorizadoEm: "2026-03-01T14:00:00.000Z", status: "aprovado", enviadoEm: "",
      idExterno: "", erro: "",
    });
    const titulosEnvio = definicaoDaAba("ENVIOS")?.colunas.map((c) => c.titulo) ?? [];
    expect(Object.keys(envio).sort()).toEqual([...titulosEnvio].sort());
  });
});
