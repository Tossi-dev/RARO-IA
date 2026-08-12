// Guarda das rotas de API que gastam crédito de terceiro (IA, transcrição).
//
// POR QUE ESTE ARQUIVO EXISTE
// ----------------------------
// `src/middleware.ts` cobre as PÁGINAS do app, mas exclui `/api/*` de
// propósito (comentário lá: "as rotas de API validam a si mesmas, ou são
// webhook de terceiro"). Isso é certo para webhook — mas `/api/ia` e
// `/api/transcrever` não são webhook de ninguém: são o próprio app
// chamando a própria chave paga (Anthropic, Groq) em nome de quem estiver
// na tela. Hoje "quem estiver na tela" é qualquer um que souber o
// endereço, porque nenhuma das duas checa nada — e como as chaves não
// estão configuradas ainda, o problema está invisível. No dia em que a
// chave entrar, essa mesma falta de checagem vira crédito de terceiro
// sendo gasto por qualquer pessoa que ache a URL.
//
// Reaproveita o MESMO núcleo do portão do app (`src/lib/acesso.ts`, já
// testado e propositalmente congelado) em vez de inventar uma segunda
// régua: mesmo cookie (`COOKIE_ACESSO`), mesmo selo, mesmo `modoAcesso()`.
// Uma senha certa continua sendo uma senha certa, esteja a checagem no
// middleware de página ou aqui.

import { createServerClient } from "@supabase/ssr";
import { ambienteAtual, COOKIE_ACESSO, modoAcesso, seloConfere } from "@/lib/acesso";
import { iaConfigurada } from "@/lib/integracoes/ia";
import { sttConfigurado } from "@/lib/integracoes/stt";

function recusa(status: number): Response {
  // Corpo curto e genérico de propósito: nunca dizer QUAL checagem falhou
  // (cookie ausente? errado? chave configurada?), nunca ecoar o cookie
  // recebido, nunca citar nome de variável de ambiente. Cada detalhe a mais
  // na resposta é uma pista a menos para quem está tentando adivinhar.
  return new Response(JSON.stringify({ erro: "não autorizado" }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Lê um cookie por nome direto do header `Cookie` da requisição, sem passar
 * por `cookies()` de `next/headers`.
 *
 * Por que não usar `next/headers` aqui (diferente de `src/lib/supabase/
 * server.ts`, que usa): aquele `cookies()` depende do contexto de request
 * vivo do App Router — funciona dentro de um Route Handler rodando de
 * verdade, mas quebra num teste unitário que só monta um `new Request()`
 * isolado, sem servidor Next por trás. Ler o header à mão funciona nos dois
 * mundos e é exatamente o que a rota de senha (`src/app/api/acesso/
 * route.ts`) e o middleware já fazem — cada um a seu jeito — para não
 * depender de infraestrutura viva.
 */
function lerCookie(req: Request, nome: string): string | undefined {
  const bruto = req.headers.get("cookie");
  if (!bruto) return undefined;
  for (const parte of bruto.split(";")) {
    const i = parte.indexOf("=");
    if (i === -1) continue;
    if (parte.slice(0, i).trim() === nome) {
      return decodeURIComponent(parte.slice(i + 1).trim());
    }
  }
  return undefined;
}

/** Existe sessão Supabase válida para os cookies desta requisição? */
async function temSessaoSupabase(req: Request): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return false; // modoAcesso() já garante isto; defesa dupla, não confiança cega.

  const supabase = createServerClient(url, key, {
    cookies: {
      get: (nome: string) => lerCookie(req, nome),
      // O guarda só LÊ sessão, nunca escreve: não existe uma `Response` de
      // saída aqui para carregar um `Set-Cookie` de token renovado, e fingir
      // uma escrita que não vai a lugar nenhum seria pior que não escrever.
      // Na pior das hipóteses um token perto de expirar não é renovado por
      // ESTA chamada específica — a próxima página do app (que passa pelo
      // middleware de verdade) renova normalmente.
      set: () => {},
      remove: () => {},
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return Boolean(user);
}

// --- freio de uso ---------------------------------------------------------
//
// Mesmo padrão de `src/app/api/acesso/route.ts` (mapa em memória de
// processo, por IP), adaptado de "tentativas de senha erradas" para
// "chamadas aceitas": lá o que protege é o tamanho da senha, aqui o que
// protege é não deixar uma sessão/senha já comprometida (ou um script
// dentro da própria rede autorizada) drenar crédito pago em rajada.
//
// Mesma ressalva de lá, repetida porque vale igual aqui: em produção
// serverless cada instância do processo tem o SEU PRÓPRIO mapa — escalar
// horizontalmente significa que o limite real é "20 por instância", não
// "20 no total". Isto é redução de dano contra abuso ingênuo batendo na
// mesma instância, não uma muralha. A defesa que realmente impede gasto
// indevido é o portão em si: sem selo válido, ninguém chega até aqui.
const LIMITE_CHAMADAS = 20;
const JANELA_MS = 5 * 60 * 1000;
const chamadasPorIp = new Map<string, { contagem: number; desde: number }>();

function ipDoPedido(req: Request): string {
  // `x-forwarded-for` pode chegar como lista ("cliente, proxy1, proxy2");
  // o primeiro item é o mais próximo do cliente real.
  const encaminhado = req.headers.get("x-forwarded-for");
  if (encaminhado) return encaminhado.split(",")[0].trim();
  // Sem proxy na frente (ambiente local) não há como distinguir IPs: agrupar
  // tudo em "desconhecido" ainda limita o total a 20 chamadas — mais
  // restritivo que o ideal, nunca mais permissivo.
  return "desconhecido";
}

function excedeuFreio(ip: string): boolean {
  const agora = Date.now();
  const registro = chamadasPorIp.get(ip);
  if (!registro || agora - registro.desde > JANELA_MS) {
    chamadasPorIp.set(ip, { contagem: 1, desde: agora }); // janela nova (ou primeira vez)
    return false;
  }
  registro.contagem += 1;
  return registro.contagem > LIMITE_CHAMADAS;
}

/**
 * Guarda das rotas `/api/ia` e `/api/transcrever`. Devolve `null` quando a
 * chamada pode seguir, ou uma `Response` de recusa (401 ou 429) quando não.
 */
export async function guardarApi(req: Request): Promise<Response | null> {
  if (excedeuFreio(ipDoPedido(req))) return recusa(429);

  const modo = modoAcesso(ambienteAtual());

  switch (modo) {
    case "supabase":
      return (await temSessaoSupabase(req)) ? null : recusa(401);

    case "senha": {
      const cookie = lerCookie(req, COOKIE_ACESSO);
      const ok = await seloConfere(cookie, ambienteAtual().senha);
      return ok ? null : recusa(401);
    }

    case "aberto":
      // No portão de PÁGINAS (`src/lib/acesso.ts`), "aberto" quer dizer "não
      // há dado real do dono a proteger" — planilha, financeiro, alunos.
      // Aqui o que está em jogo não é dado, é CRÉDITO: a chave da
      // Anthropic/Groq cobra por chamada, e isso é verdade em qualquer
      // instalação, tenha ela planilha conectada ou não. Uma base "aberto"
      // por decisão (`RARO_ACESSO_ABERTO=1`) sem NENHUMA chave de IA
      // configurada continua inofensiva liberar — não há crédito a gastar.
      // Mas no instante em que `ANTHROPIC_API_KEY` ou `GROQ_API_KEY` entram
      // no ambiente, "aberto" deixa de significar "sem risco" só aqui,
      // mesmo que continue significando isso lá no portão de páginas. Por
      // isso a checagem explícita da chave nesta rota, em vez de herdar
      // cegamente a decisão de `modoAcesso()`: falhar fechado quando há
      // crédito real em jogo, mesmo em modo "aberto".
      return iaConfigurada() || sttConfigurado() ? recusa(401) : null;

    case "trancado":
      return recusa(401);

    default:
      // Não deveria ser alcançável (switch cobre todo `ModoAcesso`), mas um
      // modo novo que apareça amanhã e não seja tratado aqui deve recusar,
      // não liberar — o mesmo "falha fechado" do resto do sistema.
      return recusa(401);
  }
}
