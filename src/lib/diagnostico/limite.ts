// Limite de chamadas por IP para a rota pública do diagnóstico — módulo puro,
// com o relógio injetado.
//
// POR QUE UM LIMITE, JÁ QUE A TABELA É PEQUENA
// --------------------------------------------
// `/api/diagnostico` é a única rota deste projeto que qualquer pessoa na
// internet pode chamar sem chave nenhuma. Sem limite, um script enche a tabela
// de lead falso em minutos — e o estrago não é o disco, é a leitura: a
// distribuição da pergunta 3 é o dado que vai corrigir a persona, e ela só
// vale se as linhas vierem de gente.
//
// POR QUE NÃO TEM CAPTCHA
// -----------------------
// Captcha na landing custaria mais do que resolve. O público é dono de empresa
// no celular, a promessa da página é "quarenta segundos, sem cadastro", e cada
// obstáculo antes da primeira resposta cobra conversão de quem é real para
// atrapalhar quem é robô. O limite por IP fica no servidor, onde ninguém vê.
//
// O QUE ESTE LIMITE NÃO FAZ, E POR QUE ESTÁ TUDO BEM
// --------------------------------------------------
// A contagem vive na memória do processo. Em servidor sem estado (Vercel), uma
// segunda instância começa a contar do zero, e quem tiver botnet passa por
// cima. Não é engano de implementação: é o ponto de equilíbrio entre parar o
// script preguiçoso — que é o ataque que de fato acontece contra uma landing
// de mentor — e não acrescentar Redis a um projeto que ainda não precisa de
// um. Quando a primeira campanha grande rodar, este arquivo troca de dentro
// (a assinatura já é a certa) sem tocar na rota.

export interface Veredito {
  permitido: boolean;
  /** Quantas ainda cabem na janela. Zero quando barrou. */
  restantes: number;
  /** Quando a janela do IP zera. Vira o `Retry-After` da resposta. */
  liberaEm: Date;
}

/** Dez preenchimentos por hora do mesmo IP. Escritório inteiro cabe; script, não. */
export const TETO = 10;
export const JANELA_MS = 60 * 60 * 1000;

interface Contagem {
  usos: number;
  comecouEm: number;
}

const porIp = new Map<string, Contagem>();

/**
 * Registra uma tentativa e diz se ela passa.
 *
 * O relógio entra por parâmetro para o teste não depender de esperar uma hora.
 */
export function conferirLimite(ip: string, agora: Date = new Date()): Veredito {
  const t = agora.getTime();
  const chave = ip.trim() === "" ? "sem-ip" : ip.trim();

  limpar(t);

  const atual = porIp.get(chave);
  if (!atual || t - atual.comecouEm >= JANELA_MS) {
    porIp.set(chave, { usos: 1, comecouEm: t });
    return { permitido: true, restantes: TETO - 1, liberaEm: new Date(t + JANELA_MS) };
  }

  if (atual.usos >= TETO) {
    return { permitido: false, restantes: 0, liberaEm: new Date(atual.comecouEm + JANELA_MS) };
  }

  atual.usos += 1;
  return {
    permitido: true,
    restantes: TETO - atual.usos,
    liberaEm: new Date(atual.comecouEm + JANELA_MS),
  };
}

/**
 * O IP de quem chamou, lido dos cabeçalhos do proxy.
 *
 * `x-forwarded-for` pode trazer vários endereços; o PRIMEIRO é o cliente e o
 * resto são os proxies pelo caminho. Pegar o último deixaria todo mundo com o
 * mesmo IP — o da Vercel — e o limite passaria a valer para o mundo inteiro
 * junto, derrubando a landing na primeira campanha.
 */
export function ipDaRequisicao(req: Request): string {
  const encaminhado = req.headers.get("x-forwarded-for");
  if (encaminhado) return encaminhado.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() ?? "";
}

/** Descarta janelas vencidas para o mapa não crescer sem fim. */
function limpar(agora: number): void {
  if (porIp.size < 500) return;
  for (const [ip, c] of porIp) {
    if (agora - c.comecouEm >= JANELA_MS) porIp.delete(ip);
  }
}

/** Só para teste: zera a contagem entre casos. */
export function _zerar(): void {
  porIp.clear();
}
