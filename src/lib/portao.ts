// Tradução PURA de "estado da requisição" em "decisão do portão".
//
// POR QUE ESTE ARQUIVO EXISTE, SEPARADO DE `middleware.ts`
// ----------------------------------------------------------
// `src/lib/acesso.ts` está congelado (é o núcleo já testado do incidente) e
// não pode crescer uma função que fale de rota/redirecionamento. E testar o
// `middleware.ts` de verdade em cima de `NextRequest`/`NextResponse` cai bem,
// mas testar SÓ a decisão fica mais claro sem nenhum dos dois no meio — este
// módulo não importa nada do Next, então o teste de decisão não depende do
// runtime Edge, de fetch, nem de nada assíncrono além da conferência do selo
// (que o middleware já resolveu antes de chamar isto aqui).
//
// O middleware vira, então, só isto: Request -> monta EntradaPortao ->
// decidirAcesso() -> traduz a decisão em Response.

import { rotaLivre, type ModoAcesso } from "@/lib/acesso";

export type DecisaoAcesso =
  | { tipo: "passa" }
  | { tipo: "redireciona"; para: string };

export interface EntradaPortao {
  /** `req.nextUrl.pathname` — nunca a URL inteira, para não vazar querystring
   *  (que pode carregar token de terceiro) no destino do redirecionamento. */
  pathname: string;
  modo: ModoAcesso;
  /** Já resolvido pelo middleware via `seloConfere()` antes de chamar esta
   *  função — `seloConfere` é assíncrona (usa `crypto.subtle`), e a decisão
   *  em si não precisa ser: fica testável com uma chamada síncrona comum. */
  seloOk: boolean;
}

export function decidirAcesso(entrada: EntradaPortao): DecisaoAcesso {
  const { pathname, modo, seloOk } = entrada;

  // A própria tela de destravar (e /login, e /privacidade) nunca pode cair
  // atrás do portão que ela mesma existe para abrir — senão o redirecionamento
  // aponta para uma rota que também redireciona, para sempre.
  if (rotaLivre(pathname)) return { tipo: "passa" };

  switch (modo) {
    case "aberto":
      // Decisão explícita (RARO_ACESSO_ABERTO=1) ou não há dado real: nada a
      // esconder.
      return { tipo: "passa" };

    case "trancado":
      // Dado real, zero proteção configurada: falha fechado. A tela de
      // /acesso explica o motivo — este módulo só sabe que tem que trancar.
      return { tipo: "redireciona", para: "/acesso" };

    case "senha":
      if (seloOk) return { tipo: "passa" };
      // `de` volta para /acesso poder mandar de volta pra rota certa depois
      // de destravar — sem isto, toda senha certa cairia sempre na home.
      return { tipo: "redireciona", para: `/acesso?de=${encodeURIComponent(pathname)}` };

    case "supabase":
      // Este modo é decidido em outro caminho, pela sessão do Supabase Auth
      // (o middleware nem chama esta função quando `modo === "supabase"`).
      // Se algum dia chamar por engano, falha fechado em vez de liberar.
      return { tipo: "redireciona", para: "/acesso" };
  }
}

/**
 * Verifica se `de` (a rota de origem, vinda de `?de=` na URL ou de um campo
 * oculto de formulário) é segura para redirecionar de volta depois de
 * destravar.
 *
 * Por que não aceitar qualquer string: `de=//evil.com/phishing` é uma URL
 * relativa a protocolo — o navegador entende "mesmo protocolo, outro host" e
 * manda o usuário, já autenticado na cabeça dele, para um site de terceiro.
 * É o desenho clássico de redirecionamento aberto. Exigir uma única barra no
 * início barra esse caminho sem impedir o caso normal (voltar para
 * `/financeiro/caixa` depois de digitar a senha).
 */
export function rotaSegura(de: string | null | undefined): string {
  if (typeof de === "string" && de.startsWith("/") && !de.startsWith("//")) return de;
  return "/";
}
