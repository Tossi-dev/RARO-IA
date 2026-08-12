// Sugestão de categoria de caixa a partir da descrição do extrato — função
// PURA, sem I/O, para a tela "CONFERIR" poder pré-marcar o select de cada
// linha antes de o dono olhar. É palpite, não fato: a tela sempre mostra a
// sugestão como sugestão e deixa o dono trocar antes de gravar (o dinheiro
// só entra no caixa depois da conferência — ver extrato-importar.tsx).
//
// Categoria vem do domínio já existente (`CategoriaCaixa`, em src/lib/types.ts)
// — nenhuma categoria nova é inventada aqui. Regra de negócio do próprio tipo
// (comentário em types.ts): entrada só pode cair em "vendas" ou
// "outras_receitas"; toda saída cai no resto do plano de contas. O que não
// casa com nenhuma palavra-chave volta como "outros" — nunca um chute entre
// as categorias específicas.

import { CATEGORIAS_ENTRADA } from "@/lib/domain";
import type { CategoriaCaixa } from "@/lib/types";

/**
 * Minúscula, sem acento, sem pontuação — mesma ideia de normalização usada em
 * extrato.ts para a impressão digital, reescrita aqui porque aquela função
 * não é exportada (é detalhe interno da digital, não uma utilidade geral).
 */
function normalizar(txt: string): string {
  return txt
    .toLowerCase()
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Palavras-chave por categoria, na ordem em que devem ser testadas — a
 * primeira que casar decide. Só entram aqui categorias de SAÍDA porque
 * entrada não tem o que classificar além de vendas/outras_receitas (ver
 * `palpitarEntrada`).
 */
const PALAVRAS_SAIDA: Array<{ categoria: CategoriaCaixa; termos: string[] }> = [
  {
    categoria: "comissoes",
    termos: ["comissao", "comissoes", "repasse afiliado", "repasse de afiliado", "afiliado"],
  },
  {
    categoria: "taxas_gateway",
    termos: [
      "taxa gateway",
      "tarifa gateway",
      "taxa de intermediacao",
      "taxa adquirente",
      "taxa cartao",
      "taxa cielo",
      "taxa stone",
      "taxa rede",
      "taxa getnet",
      "taxa pagseguro",
      "taxa mercado pago",
      // gateways de venda de curso/infoproduto — a mesma marca que indica
      // "vendas" na entrada (ver TERMOS_VENDA) também cobra taxa/saque na
      // saída, e essa taxa é sempre custo de gateway, nunca comissão.
      "taxa hotmart",
      "tarifa hotmart",
      "taxa kiwify",
      "tarifa kiwify",
      "taxa pagar me", // "Pagar.me" normalizado (ponto vira espaço)
      "taxa pagarme", // "Pagar.me" grafado sem pontuação no extrato
      "tarifa pagar me",
      "taxa de saque", // saque de saldo do gateway — mesmo custo, marca à parte
      "tarifa bancaria",
      "tarifa manutencao conta",
      "cesta de servicos", // pacote mensal de tarifas, nome comum em conta PJ
      "ted doc",
      // sufixo solto de "tarifa" pega o resto (ex.: "TARIFA PACOTE DE
      // SERVICOS", "TARIFA COBRANCA") sem precisar listar cada nome de
      // pacote — por isso fica por último no grupo, como rede de segurança.
      "tarifa",
    ],
  },
  {
    categoria: "trafego",
    termos: [
      "facebook ads",
      "meta ads",
      "google ads",
      "tiktok ads",
      "trafego pago",
      "trafego",
      "anuncio",
      "anuncios",
      "impulsionamento",
    ],
  },
  {
    categoria: "impostos",
    termos: [
      "das simples",
      "simples nacional",
      "darf",
      "imposto",
      "impostos",
      "inss",
      "iss ",
      "irpj",
      "csll",
      "iof", // imposto sobre operação financeira — comum em saque/câmbio/antecipação
    ],
  },
  {
    categoria: "folha_prolabore",
    termos: [
      "prolabore",
      "pro labore",
      "folha de pagamento",
      "folha pagamento",
      "salario",
      "salarios",
      "13o salario",
      "decimo terceiro",
      "ferias",
      "fgts",
      "vale transporte",
      "vale alimentacao",
    ],
  },
  {
    categoria: "saas_ferramentas",
    termos: [
      "assinatura",
      "mensalidade software",
      "notion",
      "zoom",
      "google workspace",
      "canva",
      "clickup",
      "activecampaign",
      "mailchimp",
      "hotmart ferramenta",
      "hospedagem",
      "dominio",
      "saas",
    ],
  },
  {
    categoria: "producao_conteudo",
    termos: [
      "edicao de video",
      "edicao video",
      "producao de conteudo",
      "producao conteudo",
      "freelancer design",
      "designer",
      "estudio gravacao",
      "estudio de gravacao",
      "roteirista",
    ],
  },
  {
    categoria: "reembolsos",
    termos: ["reembolso", "estorno", "chargeback", "devolucao ao aluno", "devolucao cliente"],
  },
];

/**
 * Palavras que indicam receita de venda, para diferenciar de "outras_receitas".
 * Só é consultada para linhas de ENTRADA (`palpitarEntrada`) — por isso um
 * termo genérico como "boleto" é seguro aqui: um boleto que SAI dinheiro
 * (conta paga) nunca passa por esta lista, só o boleto que entra (matrícula
 * paga por boleto) é que chega até aqui.
 */
const TERMOS_VENDA = [
  "hotmart",
  "kiwify",
  "eduzz",
  "monetizze",
  "braip",
  "perfectpay",
  "venda",
  "vendas",
  "matricula",
  "pagamento do curso",
  "pix recebido",
  "recebimento cliente",
  "boleto",
];

function algumTermoCasa(descricaoNormalizada: string, termos: string[]): boolean {
  return termos.some((t) => descricaoNormalizada.includes(t));
}

function palpitarEntrada(descricaoNormalizada: string): CategoriaCaixa {
  if (algumTermoCasa(descricaoNormalizada, TERMOS_VENDA)) return "vendas";
  return "outras_receitas";
}

/**
 * Marcas de gateway de infoproduto. Na SAÍDA, a marca só aparece no extrato
 * quando o gateway cobrou alguma coisa — taxa, tarifa, comissão da plataforma
 * ou saque de saldo.
 */
const MARCAS_GATEWAY = ["hotmart", "kiwify", "eduzz", "monetizze", "braip", "pagar me", "pagarme"];
const COBRANCAS_GATEWAY = ["taxa", "tarifa", "saque", "desconto"];

function palpitarSaida(descricaoNormalizada: string): CategoriaCaixa {
  for (const grupo of PALAVRAS_SAIDA) {
    if (algumTermoCasa(descricaoNormalizada, grupo.termos)) return grupo.categoria;
  }
  // Rede de segurança para a ORDEM das palavras. A lista acima é de expressões
  // inteiras ("taxa hotmart"), e o banco escreve na ordem que quiser —
  // "PAGAMENTO HOTMART TAXA" caía em "outros" só por isso. Marca de gateway +
  // palavra de cobrança, em qualquer ordem, é custo de gateway.
  if (
    algumTermoCasa(descricaoNormalizada, MARCAS_GATEWAY) &&
    algumTermoCasa(descricaoNormalizada, COBRANCAS_GATEWAY)
  ) {
    return "taxas_gateway";
  }
  return "outros";
}

/**
 * Sugere a categoria de uma linha de extrato pela descrição + direção.
 * Nunca sugere fora do que a direção permite (regra do plano de contas em
 * types.ts) e nunca "adivinha" categoria específica sem palavra-chave —
 * cai em "outras_receitas"/"outros", que são as categorias-fallback do
 * próprio plano de contas.
 */
export function sugerirCategoria(descricao: string, tipo: "entrada" | "saida"): CategoriaCaixa {
  const desc = normalizar(descricao);
  const categoria = tipo === "entrada" ? palpitarEntrada(desc) : palpitarSaida(desc);

  // cinto e suspensório: garante em tempo de execução que a sugestão respeita
  // a regra "entrada só vendas/outras_receitas" mesmo se a lista de palavras
  // for editada no futuro sem reparar nessa regra.
  const ehEntrada = CATEGORIAS_ENTRADA.includes(categoria);
  if (tipo === "entrada" && !ehEntrada) return "outras_receitas";
  if (tipo === "saida" && ehEntrada) return "outros";
  return categoria;
}
