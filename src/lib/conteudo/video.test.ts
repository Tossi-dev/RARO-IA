// Testes de `idDoYoutube` / `urlDeEmbedYoutube` — a pergunta "este endereço
// pode virar um <iframe> na minha página?".
//
// POR QUE ESTA PERGUNTA MERECE UM MÓDULO PRÓPRIO
// ----------------------------------------------
// Um `<iframe src={qualquerCoisa}>` carrega, dentro da nossa página, uma
// página de terceiro escolhida por quem digitou o campo. Não é "um link que
// não funciona" quando erra: é conteúdo estranho rodando com a nossa moldura
// em volta, com a nossa barra de endereço em cima — o material de que golpe
// de clique é feito. Por isso a regra é lista de PERMISSÃO fechada (host
// conhecido + id no formato exato), e não "recuso o que parece ruim".

import { describe, expect, it } from "vitest";
import { idDoYoutube, urlDeEmbedYoutube } from "./video";

describe("idDoYoutube — as formas que o YouTube realmente usa", () => {
  it("aceita /watch?v=, youtu.be, /embed/, /shorts/ e /live/", () => {
    const id = "dQw4w9WgXcQ";
    expect(idDoYoutube(`https://www.youtube.com/watch?v=${id}`)).toBe(id);
    expect(idDoYoutube(`https://youtube.com/watch?v=${id}&t=30s`)).toBe(id);
    expect(idDoYoutube(`https://m.youtube.com/watch?v=${id}`)).toBe(id);
    expect(idDoYoutube(`https://youtu.be/${id}`)).toBe(id);
    expect(idDoYoutube(`https://youtu.be/${id}?t=42`)).toBe(id);
    expect(idDoYoutube(`https://www.youtube.com/embed/${id}`)).toBe(id);
    expect(idDoYoutube(`https://www.youtube.com/shorts/${id}`)).toBe(id);
    expect(idDoYoutube(`https://www.youtube.com/live/${id}`)).toBe(id);
    expect(idDoYoutube(`https://www.youtube-nocookie.com/embed/${id}`)).toBe(id);
  });

  it("espaço em volta é desvio inofensivo — copiar e colar sempre traz", () => {
    expect(idDoYoutube("  https://youtu.be/dQw4w9WgXcQ  ")).toBe("dQw4w9WgXcQ");
  });
});

describe("idDoYoutube — o que NUNCA pode virar iframe", () => {
  const id = "dQw4w9WgXcQ";

  it("outro domínio, por mais parecido que seja o caminho", () => {
    expect(idDoYoutube(`https://exemplo.com/watch?v=${id}`)).toBe("");
    expect(idDoYoutube(`https://exemplo.com/embed/${id}`)).toBe("");
  });

  it("domínio que só COMEÇA ou só TERMINA com youtube.com", () => {
    // O truque clássico: quem confere com `includes` ou `endsWith` cai nos dois.
    expect(idDoYoutube(`https://youtube.com.exemplo.com/watch?v=${id}`)).toBe("");
    expect(idDoYoutube(`https://naoyoutube.com/watch?v=${id}`)).toBe("");
    expect(idDoYoutube(`https://youtube.com.br/watch?v=${id}`)).toBe("");
  });

  it("usuário e senha na URL disfarçando o host de verdade", () => {
    // "https://www.youtube.com@exemplo.com/x" é uma página do exemplo.com,
    // não do YouTube — o olho humano lê o começo, o navegador lê o fim.
    expect(idDoYoutube(`https://www.youtube.com@exemplo.com/watch?v=${id}`)).toBe("");
    expect(idDoYoutube(`https://www.youtube.com:senha@exemplo.com/watch?v=${id}`)).toBe("");
    // E o contrário também: host de verdade do YouTube, mas com credencial
    // pendurada. Endereço assim nunca é uso legítimo aqui — é gente
    // testando o que a checagem aceita, ou uma cola de algum lugar ruim.
    expect(idDoYoutube(`https://exemplo.com@www.youtube.com/watch?v=${id}`)).toBe("");
    expect(idDoYoutube(`https://usuario:senha@youtu.be/${id}`)).toBe("");
  });

  it("protocolo que não é http nem https", () => {
    expect(idDoYoutube(`javascript:alert(1)//youtube.com/watch?v=${id}`)).toBe("");
    expect(idDoYoutube(`data:text/html,<script>1</script>`)).toBe("");
    expect(idDoYoutube(`file:///etc/passwd`)).toBe("");
    // Este é o caso que a lista de hosts NÃO pega sozinha: `ftp://` e
    // `ws://` têm host de verdade, então "www.youtube.com" bate na lista e
    // só a checagem de protocolo recusa. Sem ela, a função afirmaria que um
    // endereço de FTP é um vídeo do YouTube.
    expect(idDoYoutube(`ftp://www.youtube.com/watch?v=${id}`)).toBe("");
    expect(idDoYoutube(`ws://www.youtube.com/watch?v=${id}`)).toBe("");
  });

  it("id fora do formato exato de onze caracteres", () => {
    expect(idDoYoutube("https://www.youtube.com/watch?v=curto")).toBe("");
    expect(idDoYoutube("https://www.youtube.com/watch?v=dQw4w9WgXcQextra")).toBe("");
    expect(idDoYoutube("https://www.youtube.com/watch?v=dQw4w9WgXc/")).toBe("");
    expect(idDoYoutube("https://youtu.be/dQw4w9WgXcQ/mais")).toBe("");
  });

  it("caminho do YouTube que não é um vídeo", () => {
    expect(idDoYoutube("https://www.youtube.com/")).toBe("");
    expect(idDoYoutube("https://www.youtube.com/results?search_query=x")).toBe("");
    expect(idDoYoutube("https://www.youtube.com/@algumcanal")).toBe("");
    expect(idDoYoutube("https://www.youtube.com/playlist?list=PL123")).toBe("");
  });

  it("entrada que nem é endereço, e entrada que nem é string", () => {
    expect(idDoYoutube("")).toBe("");
    expect(idDoYoutube("   ")).toBe("");
    expect(idDoYoutube("dQw4w9WgXcQ")).toBe("");
    expect(idDoYoutube("nao é uma url")).toBe("");
    expect(idDoYoutube(null)).toBe("");
    expect(idDoYoutube(undefined)).toBe("");
    expect(idDoYoutube(42)).toBe("");
    // `RegExp#test` converte array em string: ["dQw4w9WgXcQ"] vira o próprio
    // texto. Sem a checagem de `typeof`, isto passaria (já mordeu antes,
    // no código do certificado).
    expect(idDoYoutube(["https://youtu.be/dQw4w9WgXcQ"])).toBe("");
    expect(idDoYoutube({ toString: () => "https://youtu.be/dQw4w9WgXcQ" })).toBe("");
  });
});

describe("urlDeEmbedYoutube", () => {
  it("monta o embed a partir do id, nunca a partir do endereço digitado", () => {
    // Repassar o que foi digitado carregaria junto qualquer parâmetro
    // pendurado nele. O que sai daqui é construído do zero, com o id.
    expect(urlDeEmbedYoutube("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1&autoplay=1")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
    expect(urlDeEmbedYoutube("https://youtu.be/dQw4w9WgXcQ")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
  });

  it("endereço recusado devolve vazio — a tela usa isso para não desenhar o iframe", () => {
    expect(urlDeEmbedYoutube("https://exemplo.com/watch?v=dQw4w9WgXcQ")).toBe("");
    expect(urlDeEmbedYoutube("")).toBe("");
  });

  it("o domínio do embed é o -nocookie", () => {
    // Não é detalhe: o embed comum planta cookie de rastreio do Google em
    // quem só abriu a aula. O -nocookie serve o mesmo vídeo sem isso.
    expect(urlDeEmbedYoutube("https://youtu.be/dQw4w9WgXcQ")).toContain("youtube-nocookie.com");
    expect(urlDeEmbedYoutube("https://youtu.be/dQw4w9WgXcQ")).not.toContain("//www.youtube.com");
  });
});
