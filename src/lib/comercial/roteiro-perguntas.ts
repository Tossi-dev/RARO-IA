/**
 * Roteiro de descoberta para consulta interna. Não chama rede, não grava e
 * não afirma que uma resposta será enviada ao lead.
 */
export function roteiroComercialDe(consentiu: boolean): string[] {
  if (consentiu !== true) return [];
  return [
    "O que você gostaria que estivesse diferente ao final deste acompanhamento?",
    "Qual parte dessa situação tem sido mais difícil de conduzir hoje?",
    "Que tentativas você já fez e o que percebeu com elas?",
    "O que seria um próximo passo possível que fizesse sentido para você?",
  ];
}
