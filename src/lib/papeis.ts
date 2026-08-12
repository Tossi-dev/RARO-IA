// Quais rotas cada papel de usuário pode abrir — módulo PURO, sem "use
// client" e sem dependência de Next (roda no Edge, dentro do middleware, do
// mesmo jeito que `src/lib/portao.ts`).
//
// POR QUE ESTE ARQUIVO EXISTE
// ---------------------------
// `src/lib/portao.ts` decide SE a pessoa entrou (tem sessão válida). Este
// módulo decide, depois de já ter entrado, ONDE ela pode pisar — um
// comercial autenticado não deveria ver o DRE do dono só porque digitou a
// senha certa. São perguntas diferentes; separar os dois arquivos evita que
// o portão vire um emaranhado de papel + sessão + rota.
//
// O papel vem da coluna `profiles.papel`, um enum do Postgres com exatamente
// seis valores (ver `supabase/migrations/0001_schema.sql` e
// `0005_mentoros_identidade.sql`). `afiliado` e `aluno` são nomes antigos do
// mesmo nível de acesso que `mentorado` — mantidos aqui em vez de migrados no
// banco porque essa é uma decisão de outro card, não desta função.

import { rotaLivre } from "@/lib/acesso";

export type Papel = "dono" | "gestor" | "comercial" | "mentorado" | "afiliado" | "aluno";

const PAPEIS_VALIDOS: readonly Papel[] = ["dono", "gestor", "comercial", "mentorado", "afiliado", "aluno"];

/** O papel menos privilegiado — quem ainda não tem `profiles.papel`
 *  preenchido cai aqui (é também o default da coluna, na migração 0008), e é
 *  também para onde qualquer entrada não reconhecida deve cair. */
export const PAPEL_PADRAO: Papel = "mentorado";

/**
 * Normaliza qualquer entrada (linha do banco, cookie, token decodificado)
 * num `Papel` válido. Fail-closed: NADA que não seja exatamente um dos seis
 * valores do enum vira um papel privilegiado — na dúvida, o menos capaz.
 *
 * Aceita variação de caixa e espaço nas pontas ("DONO", " gestor ") porque
 * esses dois desvios são inofensivos e comuns o bastante (copiar e colar,
 * configuração digitada à mão) para não valer a pena tratar como ataque.
 * Qualquer outra coisa — string desconhecida, número, objeto, `null`,
 * `undefined` — é tratada como se fosse hostil.
 */
export function papelDe(valor: unknown): Papel {
  if (typeof valor !== "string") return PAPEL_PADRAO;
  const normalizado = valor.trim().toLowerCase();
  return (PAPEIS_VALIDOS as readonly string[]).includes(normalizado)
    ? (normalizado as Papel)
    : PAPEL_PADRAO;
}

/** Rotas que o papel comercial precisa para vender e acompanhar aluno, sem
 *  chegar perto de dinheiro ou indicador do negócio.
 *
 *  `as const` + `readonly string[]` no tipo abaixo: isto é lista de
 *  permissão de segurança, não uma lista de UI qualquer. Sem o `readonly`, um
 *  `.push()" acidental em qualquer lugar do código (ou de um teste futuro)
 *  mudaria o array em produção pra sempre — o TypeScript barra isso em tempo
 *  de compilação. */
const ROTAS_COMERCIAL = [
  "/",
  "/inicio",
  "/painel",
  "/comecar",
  "/tour",
  "/crm",
  "/agenda",
  "/conteudo",
] as const;

/** O nível mínimo — mentorado e os dois nomes antigos do mesmo papel
 *  (afiliado, aluno): só o que é preciso para consumir o próprio conteúdo. */
const ROTAS_MINIMAS = ["/", "/inicio", "/comecar", "/tour", "/conteudo", "/agenda"] as const;

/**
 * Lista de permissão por papel, não de bloqueio: dono e gestor recebem o
 * sinal `"todas"`; os demais papéis recebem um prefixo explícito. Uma rota
 * nova criada amanhã, que nenhum destes arrays previu, fica FORA da lista de
 * comercial e mentorado até alguém decidir incluí-la — o padrão é negar, não
 * permitir por omissão.
 *
 * `mentorado`, `afiliado` e `aluno` copiam `ROTAS_MINIMAS` (`[...ROTAS_MINIMAS]`)
 * em vez de apontar pro mesmo array: são três chaves diferentes deste objeto,
 * mas antes eram literalmente a MESMA instância — um `push` feito pensando
 * só em "mentorado" abriria a rota para os outros dois nomes também, por
 * acidente de referência compartilhada, não por decisão.
 */
const ROTAS_POR_PAPEL: Record<Papel, readonly string[] | "todas"> = {
  dono: "todas",
  gestor: "todas",
  comercial: ROTAS_COMERCIAL,
  mentorado: [...ROTAS_MINIMAS],
  afiliado: [...ROTAS_MINIMAS],
  aluno: [...ROTAS_MINIMAS],
};

/**
 * `pathname` começa em `prefixo` respeitando fronteira de segmento — mesma
 * lógica de `rotaLivre` em `src/lib/acesso.ts`. Sem isso, um prefixo
 * `/conteudo` casaria com `/conteudografico` por coincidência de texto, e
 * uma rota nova poderia ganhar acesso sem ninguém ter decidido isso.
 *
 * `/` é tratado à parte: como prefixo de tudo ele venceria qualquer rota por
 * `startsWith`, então só casa consigo mesmo.
 */
function comecaNoPrefixo(pathname: string, prefixo: string): boolean {
  if (prefixo === "/") return pathname === "/";
  return pathname === prefixo || pathname.startsWith(`${prefixo}/`);
}

/**
 * O caminho carrega algo que só pode ser lido com ambiguidade? Percent-
 * encoding (`%2f`, `%2e` etc — qualquer sequência, não só as conhecidas),
 * barra invertida, ponto-e-vírgula (truque clássico de "path parameter" que
 * alguns servidores ainda respeitam), ou um segmento igual a `.` ou `..`.
 *
 * POR QUE ESTA GUARDA EXISTE: este módulo decide permissão comparando texto
 * (`startsWith` de segmento, em `comecaNoPrefixo`). Ele não sabe — e não
 * deveria precisar saber — como o Next, um proxy na frente, ou um CDN vão
 * normalizar `/conteudo/..%2ffinanceiro` antes de rotear de verdade. Hoje
 * quem impede esse caminho de cair em `/financeiro` é um detalhe de outra
 * camada; se esse detalhe mudar (upgrade de framework, proxy novo), a
 * checagem de prefixo sozinha deixaria passar. Por isso a regra é: se o
 * caminho não pode ser lido sem ambiguidade, ele nega — não tenta decodificar
 * e comparar de novo, porque decodificar poderia, ele mesmo, introduzir outra
 * ambiguidade (dupla codificação). Fail-closed, o mesmo espírito de
 * `papelDe`.
 */
function travessiaSuspeita(pathname: string): boolean {
  if (pathname.includes("%")) return true;
  if (pathname.includes("\\")) return true;
  if (pathname.includes(";")) return true;
  return pathname.split("/").some((segmento) => segmento === ".." || segmento === ".");
}

/** O papel pode abrir este pathname?
 *
 *  `papel` chega tipado como `Papel`, mas nada garante isso em runtime — o
 *  valor pode vir direto de uma coluna do Supabase, de um cookie ou de um
 *  claim de JWT decodificado sem passar por `papelDe` antes. Por isso a
 *  primeira linha normaliza por dentro: papel desconhecido cai em
 *  PAPEL_PADRAO, nunca lança e nunca abre "todas" por acidente. */
export function rotaPermitida(papelBruto: Papel, pathname: string): boolean {
  const papel = papelDe(papelBruto);

  // As rotas livres de `src/lib/acesso.ts` (/login, /acesso, /privacidade)
  // nunca podem ficar atrás deste próprio portão de rotas — senão o
  // middleware barra o mentorado, manda ele pra /login, e este módulo barra
  // /login também: laço de redirecionamento infinito. `rotaLivre` é
  // conferido primeiro, mas só libera de fato quando o caminho não carrega
  // travessia disfarçada — "/login/..%2ffinanceiro" bate no prefixo de
  // /login por `startsWith`, mas não é a tela de login, é uma tentativa de
  // usar a rota livre como disfarce. Nesse caso ele cai na guarda abaixo.
  if (rotaLivre(pathname) && !travessiaSuspeita(pathname)) return true;

  // Travessia codificada: dono e gestor não precisam desta guarda porque já
  // recebem "todas" no lookup abaixo, travessia ou não.
  if (papel !== "dono" && papel !== "gestor" && travessiaSuspeita(pathname)) return false;

  const rotas = ROTAS_POR_PAPEL[papel];
  if (rotas === "todas") return true;
  return rotas.some((prefixo) => comecaNoPrefixo(pathname, prefixo));
}

/**
 * Para onde mandar quem acabou de entrar (login concluído, ou raiz sem rota
 * pedida). Cada destino aqui É uma das rotas do próprio mapa acima — trocar
 * um sem o outro cria um laço de redirecionamento (o teste "a rota devolvida
 * ... é sempre permitida" segura isso).
 *
 * Mesma normalização de `rotaPermitida`: papel desconhecido nunca cai fora
 * do switch (o que devolveria `undefined`, apesar da assinatura dizer
 * `string`) — cai em PAPEL_PADRAO, que sempre bate em algum `case`.
 */
export function primeiraRotaDe(papelBruto: Papel): string {
  const papel = papelDe(papelBruto);
  switch (papel) {
    case "dono":
    case "gestor":
      return "/";
    case "comercial":
      return "/crm";
    case "mentorado":
    case "afiliado":
    case "aluno":
      return "/inicio";
  }
}
