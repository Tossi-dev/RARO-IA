/** Portão local de marketing: captura não é autorização para contato. */
export function decisaoDeContato(consentiu: boolean, cancelou: boolean) {
  return {
    podeCapturar: consentiu === true && cancelou !== true,
    // Não existe canal externo ativado nesta fase. Manter isto explícito
    // impede que captura futura seja confundida com permissão de envio.
    podeEnviar: false,
  };
}
