// "Este endereço pode virar um <iframe> dentro da nossa página?" — módulo
// PURO, sem dependência de React, de Next ou do banco.
//
// POR QUE ISTO NÃO É UMA CHECAGEM DE LINK QUALQUER
// ------------------------------------------------
// Um link errado abre uma aba que não funciona. Um `<iframe src>` errado
// carrega a página de um estranho DENTRO da nossa, com a nossa moldura em
// volta e o nosso endereço na barra — é exatamente a matéria-prima de golpe
// de clique e de tela de login falsa. Quem digita o campo é a gestão, não um
// anônimo; ainda assim a regra é lista de PERMISSÃO, porque "só gente de
// confiança digita aqui" é a premissa que envelhece pior em qualquer sistema
// (basta uma conta comprometida, ou um dia ruim com copiar e colar).
//
// A REGRA, EM UMA FRASE: host exatamente conhecido + id no formato exato do
// YouTube, e o endereço que sai daqui é CONSTRUÍDO por nós — nunca o que foi
// digitado, repassado adiante.
//
// O que este módulo deliberadamente NÃO faz: não tenta consertar endereço
// quase certo, não segue redirecionamento, não pergunta ao YouTube se o vídeo
// existe. Ele responde uma pergunta de FORMA; se a resposta for "não", a tela
// mostra o endereço como texto e a pessoa confere com os próprios olhos.

/** Onze caracteres, e só estes. O id do YouTube nunca teve outro formato. */
const ID_YOUTUBE = /^[A-Za-z0-9_-]{11}$/;

/** Hosts do YouTube que servem página de vídeo. Comparação por IGUALDADE
 *  contra `hostname` — nunca `includes`/`endsWith`, que aceitariam
 *  `youtube.com.exemplo.com` e `naoyoutube.com` de brinde. */
const HOSTS_YOUTUBE = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

/** O encurtador: o caminho inteiro é o id. */
const HOSTS_CURTO = new Set(["youtu.be", "www.youtu.be"]);

/** Prefixos de caminho em que o SEGUNDO segmento é o id. */
const CAMINHOS_COM_ID = new Set(["embed", "shorts", "live", "v"]);

/**
 * O id do vídeo, ou string vazia. Vazio significa "não sei dizer que isto é
 * um vídeo do YouTube" — e quem chama trata isso como recusa, nunca como
 * "provavelmente é".
 *
 * `unknown` na assinatura de propósito: o valor costuma vir de uma coluna do
 * banco ou de um `FormData`, e nada garante que seja string em runtime.
 */
export function idDoYoutube(valor: unknown): string {
  if (typeof valor !== "string") return "";
  const bruto = valor.trim();
  if (bruto === "") return "";

  let url: URL;
  try {
    url = new URL(bruto);
  } catch {
    // Não é endereço absoluto. Endereço relativo não entra: sem host, não há
    // como afirmar que é do YouTube.
    return "";
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return "";

  // "https://www.youtube.com@exemplo.com/watch?v=…" é uma página do
  // exemplo.com: o que vem antes do @ é usuário, não host. O olho lê o
  // começo, o navegador obedece o fim. `hostname` já devolve o host certo
  // (exemplo.com) e a lista abaixo recusaria — esta linha é o cinto extra,
  // porque endereço com usuário embutido nunca é uso legítimo aqui.
  if (url.username !== "" || url.password !== "") return "";

  const host = url.hostname.toLowerCase();
  const segmentos = url.pathname.split("/").filter((s) => s !== "");
  let candidato = "";

  if (HOSTS_CURTO.has(host)) {
    // youtu.be/<id> — um segmento, e nada além dele.
    if (segmentos.length === 1) candidato = segmentos[0];
  } else if (HOSTS_YOUTUBE.has(host)) {
    if (segmentos.length === 1 && segmentos[0] === "watch") {
      candidato = url.searchParams.get("v") ?? "";
    } else if (segmentos.length === 2 && CAMINHOS_COM_ID.has(segmentos[0])) {
      candidato = segmentos[1];
    }
  }

  return ID_YOUTUBE.test(candidato) ? candidato : "";
}

/**
 * O endereço de embed, ou string vazia.
 *
 * MONTADO do zero a partir do id, e não derivado do que foi digitado: o
 * endereço original pode carregar `autoplay=1`, `list=`, `origin=` e o que
 * mais alguém pendurar nele. O que entra na página é só o que nós escrevemos.
 *
 * `-nocookie` não é preciosismo: o domínio comum planta cookie de rastreio do
 * Google em quem só abriu a aula, e a pessoa não pediu isso ao entrar numa
 * trilha de mentoria.
 */
export function urlDeEmbedYoutube(valor: unknown): string {
  const id = idDoYoutube(valor);
  return id === "" ? "" : `https://www.youtube-nocookie.com/embed/${id}`;
}
