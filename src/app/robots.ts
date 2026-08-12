// Impede que Google e qualquer outro robô indexem o painel. Não é proteção
// de acesso (robots.txt é um pedido educado, não uma trava — quem quer
// ignora), mas fecha o caminho mais bobo de exposição: o financeiro de um
// cliente aparecendo como resultado de busca por causa de um link
// compartilhado sem querer.
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
