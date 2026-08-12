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
import { primeiraRotaDe, rotaPermitida, type Papel } from "@/lib/papeis";

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

// --- decisão do modo supabase: sessão + papel -----------------------------
//
// `decidirAcesso` (acima) cobre os três modos degrau (aberto/trancado/senha),
// que só sabem "há selo ou não". No modo supabase há sessão de verdade E
// papel — um mentorado autenticado é, ainda assim, barrado de `/financeiro`.
// Isto fica num tipo de entrada separado (`EntradaPortaoSupabase`, não
// `EntradaPortao`) porque as duas perguntas são diferentes: uma fala de selo
// de senha compartilhada, a outra de sessão individual com papel — misturar
// os dois campos num único tipo deixaria a maioria deles sempre vazia,
// dependendo do modo, e o TypeScript não pegaria a combinação errada.

export interface EntradaPortaoSupabase {
  pathname: string;
  /** null quando não há sessão. O papel já vem normalizado por papelDe() —
   *  esta função nunca lê `profiles.papel` cru, isso é responsabilidade de
   *  quem monta esta entrada (o middleware). */
  usuario: { papel: Papel } | null;
}

/** `pathname` é `prefixo` ou um segmento abaixo dele — mesma regra de
 *  fronteira usada em `rotaLivre` (src/lib/acesso.ts) e `comecaNoPrefixo`
 *  (src/lib/papeis.ts): sem isso, "/login" casaria por texto com
 *  "/loginzinho" por coincidência, e uma rota nova poderia herdar o
 *  tratamento especial de /login sem ninguém ter decidido isso. */
function ehRotaOuSubrota(pathname: string, rota: string): boolean {
  return pathname === rota || pathname.startsWith(`${rota}/`);
}

/**
 * Traduz "sessão do Supabase + papel" em decisão do portão. Pura e síncrona
 * de propósito, pelo mesmo motivo de `decidirAcesso`: o middleware já
 * resolveu tudo que precisava de I/O (getUser(), a consulta de papel) antes
 * de chamar isto, e o que sobra é só comparação de string — fica testável
 * sem subir Edge Runtime nenhum.
 *
 * A ORDEM DAS CINCO REGRAS ABAIXO NÃO É ARBITRÁRIA — é exatamente o que
 * evita um laço de redirecionamento. Cada regra resolve o caso que a regra
 * seguinte, sozinha, trataria errado:
 *
 *   1. /sem-acesso primeiro, antes de qualquer outra coisa: é a tela que
 *      EXPLICA por que a pessoa foi barrada. Se ela mesma fosse barrada por
 *      não ter o papel certo, o redirecionamento da regra 5 apontaria para
 *      uma rota que, de novo, redireciona — para sempre. Sem usuário, ainda
 *      assim manda para /login (não para "passa" cego): a tela de bloqueio
 *      não é útil pra quem nem entrou.
 *   2. /login em seguida: sem usuário, é a própria porta de entrada, passa.
 *      Com usuário, NÃO pode mandar para "/" fixo — um mentorado que acabou
 *      de logar cairia numa rota que o papel dele não abre (regra 5 barraria
 *      de novo, para /sem-acesso, um instante depois de acertar a senha).
 *      Por isso `primeiraRotaDe(papel)`, que é sempre uma rota que o próprio
 *      papel tem permissão de ver.
 *   3. `rotaLivre` (src/lib/acesso.ts — hoje /acesso e /privacidade, além de
 *      /login já tratado na regra 2) logo depois: são as rotas que o
 *      cabeçalho daquele módulo chama de "o portão nunca pode bloquear", e
 *      isso vale para QUALQUER visitante, com sessão ou sem. Por isso esta
 *      regra tem que vir DEPOIS da regra 2 — senão um usuário logado batendo
 *      em /login pararia de ser mandado para a primeira rota do próprio
 *      papel (regra 2) e passaria cego por aqui — e ANTES da regra 4: sem
 *      isso, um visitante anônimo em /privacidade cairia direto em "sem
 *      usuário -> /login", tornando a página pública ilegível justamente para
 *      quem mais precisa lê-la sem estar logado.
 *   4. Sem usuário, qualquer outra rota: não há sessão para checar papel
 *      nenhum, então nem chega na regra 5 — direto para /login.
 *   5. Com usuário e nenhuma das rotas especiais acima: primeiro a raiz "/"
 *      é um caso à parte — ela renderiza o catálogo inteiro de áreas do
 *      sistema (Springboard), e mostrar esse mapa para quem só enxerga uma
 *      fatia dele já vaza a EXISTÊNCIA das áreas vedadas, mesmo que os
 *      números venham zerados pelo RLS. Por isso, quando a primeira rota do
 *      papel não é a própria "/", manda para lá — dono e gestor (cuja
 *      primeira rota É "/") não entram nesse desvio, o que evita o laço.
 *      Fora da raiz, a pergunta é "este papel pode ver este pathname",
 *      delegada a `rotaPermitida` (que já embute sua própria defesa contra
 *      travessia de caminho).
 */
export function decidirAcessoSupabase(entrada: EntradaPortaoSupabase): DecisaoAcesso {
  const { pathname, usuario } = entrada;

  if (ehRotaOuSubrota(pathname, "/sem-acesso")) {
    return usuario ? { tipo: "passa" } : { tipo: "redireciona", para: "/login" };
  }

  if (ehRotaOuSubrota(pathname, "/login")) {
    if (!usuario) return { tipo: "passa" };
    return { tipo: "redireciona", para: primeiraRotaDe(usuario.papel) };
  }

  if (rotaLivre(pathname)) return { tipo: "passa" };

  if (!usuario) return { tipo: "redireciona", para: "/login" };

  if (pathname === "/") {
    const primeira = primeiraRotaDe(usuario.papel);
    if (primeira !== "/") return { tipo: "redireciona", para: primeira };
  }

  return rotaPermitida(usuario.papel, pathname)
    ? { tipo: "passa" }
    : { tipo: "redireciona", para: "/sem-acesso" };
}
