// Testes da sugestão de categoria (src/lib/extrato/classificar.ts). A regra
// mais importante para travar aqui é a de negócio herdada de types.ts:
// entrada nunca sai do par vendas/outras_receitas, saída nunca cai nesse par.

import { describe, expect, it } from "vitest";
import { sugerirCategoria } from "./classificar";

describe("sugerirCategoria", () => {
  it("reconhece gateway de venda como vendas, em entrada", () => {
    expect(sugerirCategoria("Repasse Hotmart", "entrada")).toBe("vendas");
    expect(sugerirCategoria("KIWIFY PAGAMENTOS LTDA", "entrada")).toBe("vendas");
  });

  it("entrada sem palavra de venda cai em outras_receitas, nunca 'outros'", () => {
    expect(sugerirCategoria("Depósito não identificado", "entrada")).toBe("outras_receitas");
  });

  it("reconhece comissão de afiliado em saída", () => {
    expect(sugerirCategoria("Comissão afiliado João", "saida")).toBe("comissoes");
  });

  it("reconhece tráfego pago em saída", () => {
    expect(sugerirCategoria("FACEBOOK ADS", "saida")).toBe("trafego");
    expect(sugerirCategoria("Google Ads - campanha", "saida")).toBe("trafego");
  });

  it("reconhece taxa de gateway em saída", () => {
    expect(sugerirCategoria("Taxa Mercado Pago", "saida")).toBe("taxas_gateway");
  });

  it("reconhece imposto em saída", () => {
    expect(sugerirCategoria("DAS Simples Nacional 08/2026", "saida")).toBe("impostos");
  });

  it("reconhece folha/pró-labore em saída", () => {
    expect(sugerirCategoria("Pró-labore sócio", "saida")).toBe("folha_prolabore");
    expect(sugerirCategoria("Pagamento de salário", "saida")).toBe("folha_prolabore");
  });

  it("reconhece SaaS/ferramentas em saída", () => {
    expect(sugerirCategoria("Assinatura Notion", "saida")).toBe("saas_ferramentas");
  });

  it("reconhece produção de conteúdo em saída", () => {
    expect(sugerirCategoria("Edição de vídeo — freelancer", "saida")).toBe("producao_conteudo");
  });

  it("reconhece reembolso em saída", () => {
    expect(sugerirCategoria("Reembolso cliente Maria", "saida")).toBe("reembolsos");
  });

  it("saída sem palavra-chave nenhuma cai em outros, nunca um chute", () => {
    expect(sugerirCategoria("Transferência TED 55512", "saida")).toBe("outros");
  });

  it("é acento-insensível e maiúscula-insensível", () => {
    expect(sugerirCategoria("COMISSAO AFILIADO", "saida")).toBe("comissoes");
    expect(sugerirCategoria("comissão", "saida")).toBe("comissoes");
  });

  it("nunca sugere categoria de entrada para uma linha de saída", () => {
    const categoria = sugerirCategoria("Hotmart taxa de saque", "saida");
    expect(["vendas", "outras_receitas"]).not.toContain(categoria);
  });

  it("nunca sugere categoria de saída para uma linha de entrada", () => {
    const categoria = sugerirCategoria("Comissão recebida de parceiro", "entrada");
    expect(["vendas", "outras_receitas"]).toContain(categoria);
  });

  it("reconhece IOF como imposto", () => {
    expect(sugerirCategoria("IOF sobre antecipação", "saida")).toBe("impostos");
  });

  it("reconhece taxa/tarifa dos gateways de venda (Hotmart, Kiwify, Pagar.me) como taxas_gateway", () => {
    expect(sugerirCategoria("Taxa Hotmart", "saida")).toBe("taxas_gateway");
    expect(sugerirCategoria("Tarifa Kiwify saque", "saida")).toBe("taxas_gateway");
    // "Pagar.me" normalizado vira "pagar me" (o ponto some na normalização);
    // o termo de busca já está escrito nesse formato, mas o texto de entrada
    // aqui é o nome real da marca, com ponto mesmo.
    expect(sugerirCategoria("Taxa Pagar.me", "saida")).toBe("taxas_gateway");
    expect(sugerirCategoria("TAXA PAGARME", "saida")).toBe("taxas_gateway");
  });

  it("reconhece cesta de serviços como taxa bancária", () => {
    expect(sugerirCategoria("Cesta de Serviços PJ", "saida")).toBe("taxas_gateway");
  });

  it("tarifa genérica (sem nome de banco/gateway específico) ainda cai em taxas_gateway", () => {
    expect(sugerirCategoria("TARIFA PACOTE DE SERVICOS", "saida")).toBe("taxas_gateway");
  });

  it("reconhece boleto recebido como venda, em entrada", () => {
    expect(sugerirCategoria("Boleto compensado - matrícula", "entrada")).toBe("vendas");
  });

  it("rendimento de aplicação, em entrada, cai em outras_receitas (não é venda)", () => {
    expect(sugerirCategoria("Rendimento poupança", "entrada")).toBe("outras_receitas");
  });

  it("aluguel não tem categoria própria no plano de contas: cai em outros, sem chute", () => {
    // Decisão deliberada: CategoriaCaixa não tem uma categoria de "despesas
    // fixas"/aluguel — inventar uma quebraria a regra de só usar categoria
    // já existente, então o fallback correto aqui é "outros".
    expect(sugerirCategoria("Aluguel escritório", "saida")).toBe("outros");
  });

  it("débito automático sozinho é ambíguo demais (pode ser SaaS, seguro, utilidade) e cai em outros", () => {
    // Decisão deliberada: "débito automático" não indica sozinho qual
    // categoria de saída é a certa — forçar uma classificação específica
    // seria o chute que a regra de negócio proíbe.
    expect(sugerirCategoria("Débito automático - Seguro", "saida")).toBe("outros");
  });

  it("PIX enviado, sem mais contexto, cai em outros — não é uma categoria específica por si só", () => {
    expect(sugerirCategoria("Pix enviado Maria", "saida")).toBe("outros");
  });
});

describe("marca de gateway com a cobrança em qualquer ordem", () => {
  it("reconhece a taxa mesmo quando o banco inverte as palavras", () => {
    // O extrato real não segue ordem nenhuma: "PAGAMENTO HOTMART TAXA",
    // "KIWIFY DESC TARIFA", "SAQUE PAGAR.ME". Antes disso, só a expressão
    // exata "taxa hotmart" era reconhecida e o resto virava "outros".
    expect(sugerirCategoria("PAGAMENTO HOTMART TAXA", "saida")).toBe("taxas_gateway");
    expect(sugerirCategoria("SAQUE PAGAR.ME", "saida")).toBe("taxas_gateway");
    expect(sugerirCategoria("KIWIFY DESCONTO PLATAFORMA", "saida")).toBe("taxas_gateway");
  });

  it("marca de gateway sozinha, sem cobrança, não vira taxa", () => {
    // "HOTMART" sozinho numa saída pode ser qualquer coisa (estorno de compra
    // do próprio dono, por exemplo) — chutar taxa seria inventar.
    expect(sugerirCategoria("HOTMART", "saida")).toBe("outros");
  });
});
