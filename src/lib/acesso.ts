// O portão de entrada do sistema — módulo NEUTRO, sem "use client" e sem
// dependência de Node (roda no Edge, dentro do middleware).
//
// POR QUE ESTE ARQUIVO EXISTE
// ---------------------------
// Até hoje o `src/middleware.ts` só exigia sessão quando havia um projeto
// Supabase configurado; sem ele, liberava tudo. Isso estava certo enquanto o
// sistema era demonstração — e virou o problema errado no dia em que a
// planilha real do dono foi conectada. Qualquer pessoa com o endereço via
// faturamento, lucro, saldo e a lista de alunos com nome e telefone.
//
// A REGRA NOVA, EM UMA FRASE: onde há dado real e não há como identificar
// quem entrou, o sistema RECUSA mostrar o dado. Falha fechado, não aberto.
//
// Os quatro estados possíveis, em ordem de preferência:
//
//   supabase  — existe projeto Supabase: cada pessoa tem login próprio, com
//               e-mail e senha. É o destino final; os outros são degraus.
//   senha     — não há Supabase, mas existe `RARO_SENHA`: uma senha só,
//               compartilhada, que destrava o sistema inteiro neste
//               navegador. Não identifica QUEM entrou (por isso não é o
//               destino final), mas impede que qualquer um entre.
//   aberto    — não há dado real a proteger (demonstração, base vazia), ou
//               alguém declarou `RARO_ACESSO_ABERTO=1` assumindo o risco de
//               propósito. Aberto por decisão, nunca por descuido.
//   trancado  — há dado real e NENHUMA proteção configurada. O sistema
//               mostra uma tela de aviso em vez dos números. É o estado que
//               não deveria durar mais que o tempo de configurar a senha.
//
// SOBRE O DEGRAU "senha": ele existe porque criar projeto Supabase leva
// dezenas de minutos e depende de conta de terceiro, enquanto o dado real já
// está exposto AGORA. Uma variável de ambiente fecha a porta em dois minutos.
// Não é substituto de login com usuário — é o que impede o estrago enquanto o
// login de verdade não sobe.

export type ModoAcesso = "supabase" | "senha" | "aberto" | "trancado";

/** As variáveis de ambiente que decidem o portão. Recebidas como parâmetro
 *  (e não lidas de `process.env` aqui dentro) para o comportamento ser
 *  testável sem mexer no ambiente do processo. */
export interface AmbienteAcesso {
  supabaseUrl?: string;
  supabaseKey?: string;
  /** `RARO_SENHA` — senha única compartilhada. NUNCA `NEXT_PUBLIC_`: se
   *  vazasse para o pacote do navegador, estaria publicada junto com o app. */
  senha?: string;
  /** `RARO_ACESSO_ABERTO=1` — a única forma de abrir o sistema com dado real,
   *  e ela exige alguém digitar isso sabendo o que está fazendo. */
  abertoDeclarado?: string;
  /** `RARO_SHEETS_ID` — havendo planilha, há dado real do dono em jogo. */
  sheetsId?: string;
  /** `RARO_MODO` — "demo" significa números fictícios: não há o que proteger. */
  modo?: string;
}

/** Senha curta demais é a mesma coisa que senha nenhuma: quatro dígitos caem
 *  em segundos numa tentativa automatizada. Abaixo disto o sistema trata como
 *  não configurada, e o estado vira `trancado` — falha fechado, como o resto. */
export const TAMANHO_MINIMO_SENHA = 10;

export function senhaValida(senha: string | undefined): senha is string {
  return typeof senha === "string" && senha.trim().length >= TAMANHO_MINIMO_SENHA;
}

/** Existe dado REAL do dono em jogo nesta instalação? */
export function temDadoReal(env: AmbienteAcesso): boolean {
  if (env.modo === "demo") return false; // números fictícios, por pedido explícito
  return Boolean(env.sheetsId || (env.supabaseUrl && env.supabaseKey));
}

export function modoAcesso(env: AmbienteAcesso): ModoAcesso {
  if (env.supabaseUrl && env.supabaseKey) return "supabase";
  if (senhaValida(env.senha)) return "senha";
  if (env.abertoDeclarado === "1") return "aberto";
  // Nada configurado: só fica aberto se não houver nada a proteger.
  return temDadoReal(env) ? "trancado" : "aberto";
}

/** Lê o ambiente de verdade. Chamada por middleware e telas; o resto do
 *  módulo continua puro e testável. */
export function ambienteAtual(): AmbienteAcesso {
  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    senha: process.env.RARO_SENHA,
    abertoDeclarado: process.env.RARO_ACESSO_ABERTO,
    sheetsId: process.env.RARO_SHEETS_ID,
    modo: process.env.RARO_MODO,
  };
}

export const COOKIE_ACESSO = "raro_acesso";

/** O que é assinado. Trocar este texto invalida todos os cookies emitidos —
 *  é o botão de "derrubar todo mundo" caso a senha vaze. */
const ROTULO = "raro-acesso-v1";

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * O selo que vai no cookie: HMAC-SHA256 de um texto fixo, usando a senha como
 * chave.
 *
 * Por que não guardar a senha no cookie: cookie viaja em toda requisição e
 * aparece inteiro em qualquer log de navegador ou proxy mal configurado. O
 * selo prova que quem o emitiu conhecia a senha, sem carregar a senha.
 *
 * Por que é determinístico (a mesma senha sempre dá o mesmo selo): o
 * middleware precisa conferir o cookie sem consultar banco nenhum — não há
 * onde guardar sessão no Edge. O preço é que o selo não expira sozinho; quem
 * expira é o `maxAge` do cookie, e trocar a senha invalida todos de uma vez.
 *
 * `crypto.subtle` e não a biblioteca `crypto` do Node: este código roda
 * DENTRO do middleware, que é Edge Runtime — lá não existe módulo do Node.
 */
export async function selo(senha: string): Promise<string> {
  const cod = new TextEncoder();
  const chave = await crypto.subtle.importKey(
    "raw",
    cod.encode(senha),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return hex(await crypto.subtle.sign("HMAC", chave, cod.encode(ROTULO)));
}

/**
 * Comparação de tempo constante. Um `===` normal para de comparar no primeiro
 * caractere diferente, e a diferença de microssegundos entre "errou no
 * primeiro" e "errou no último" é medível pela rede — dá para descobrir o
 * selo caractere por caractere. Aqui todo caractere é sempre percorrido.
 */
function igualEmTempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}

/** O cookie apresentado corresponde à senha configurada? */
export async function seloConfere(
  valorDoCookie: string | undefined,
  senha: string | undefined
): Promise<boolean> {
  if (!senhaValida(senha) || !valorDoCookie) return false;
  return igualEmTempoConstante(valorDoCookie, await selo(senha));
}

/** Quanto tempo o destravamento dura neste navegador — 30 dias. Curto o
 *  bastante para um aparelho perdido não valer para sempre, longo o bastante
 *  para o dono não digitar senha toda semana. */
export const VALIDADE_ACESSO_SEGUNDOS = 60 * 60 * 24 * 30;

/** Rotas que o portão nunca pode bloquear, sob pena de deixar a própria tela
 *  de destravar inacessível (e o app num laço de redirecionamento).
 *
 *  `/certificado` (tarefa 29) entra aqui por um motivo DIFERENTE dos outros
 *  três: não é laço de redirecionamento, é o propósito da tela. Quem confere
 *  um certificado de conclusão é um contratante, um cliente do aluno, uma
 *  banca — gente que não tem conta neste sistema e não vai criar uma só para
 *  isso. Um certificado que só o emissor consegue conferir não é
 *  certificado, é print de tela.
 *
 *  O QUE ESTA LINHA NÃO AUTORIZA — leia antes de escrever a tela: estar em
 *  ROTAS_LIVRES significa que o PORTÃO não pergunta quem é. Não significa
 *  que a página pode consultar o banco com a chave anônima e devolver o que
 *  vier: a RLS de `certificado` (migração 0020) é escrita para gestão e
 *  mentorado autenticados, e `anon` não tem — nem pode ganhar — política de
 *  leitura ali. A verificação pública precisa passar por uma função
 *  `security definer` que receba o CÓDIGO e devolva o MÍNIMO (validade, nome
 *  de quem concluiu, trilha, data), nunca uma lista e nunca um filtro livre:
 *  senão a rota livre vira listagem de clientes do Jefson para qualquer um
 *  com um `curl`. */
/* TAREFA 48 — `/proposta` entra pelo MESMO raciocínio, e com o mesmo limite.
 * O prospect que recebe uma proposta não tem login, e não vai criar um para
 * ler um documento comercial. O que a liberação NÃO autoriza continua igual:
 * a página não consulta `proposta` com a chave anônima (não há política de
 * select para `anon`, e não pode haver — a tabela guarda valor negociado de
 * todo mundo). Quem faz a ponte é `proposta_publica` (migração 0025),
 * `security definer`, retorno fechado em cinco colunas, igualdade exata no
 * token e só status `enviada` dentro da validade.
 *
 * A fechadura, aqui, é o TOKEN — 22 caracteres base62 sorteados na borda
 * (proposta-token.ts). Por isso a página é `noindex` e por isso todos os
 * "não" respondem a mesma coisa: um link de proposta indexado ou um oráculo
 * de enumeração valem o pipeline inteiro. */
// Tarefa 72: quem recebeu um link de campanha não tem conta. A rota só chama
// a RPC estreita de clique e valida o destino antes de redirecionar.
export const ROTAS_LIVRES = ["/acesso", "/login", "/privacidade", "/certificado", "/proposta", "/l"];

export function rotaLivre(pathname: string): boolean {
  return ROTAS_LIVRES.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}
