/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // fontes entram por <link> em runtime; sem fetch de fontes no build
  optimizeFonts: false,

  // ------------------------------------------------------------
  // A LANDING DO DIAGNÓSTICO, NA MESMA ORIGEM DO APP
  // ------------------------------------------------------------
  // As três páginas são HTML puro e auto-contido (o CSS e o JS vão
  // embutidos em cada arquivo), e vivem em `public/jefson/`. Elas não
  // são página do Next: não têm React, não têm build, e trocá-las é
  // copiar arquivo.
  //
  // POR QUE AQUI DENTRO, E NÃO EM OUTRO DOMÍNIO
  // A landing faz `POST /api/diagnostico`. Servida de outro domínio,
  // essa chamada vira requisição cross-origin, e aí ou se escreve CORS
  // na rota — abrindo uma rota pública de escrita para qualquer origem —
  // ou o preflight falha em silêncio e o lead some sem ninguém notar.
  // Mesma origem elimina os dois problemas de uma vez.
  //
  // OS ATALHOS ABAIXO SÃO O QUE O JEFSON FALA EM VÍDEO. `/diagnostico`
  // cabe numa frase e numa bio; `/jefson/diagnostico.html` não. Os links
  // ENTRE as páginas continuam relativos (`./produtos.html`) e por isso
  // funcionam tanto pelo atalho quanto pelo caminho direto.
  async rewrites() {
    return [
      { source: "/diagnostico", destination: "/jefson/diagnostico.html" },
      { source: "/jefson", destination: "/jefson/index.html" },
      { source: "/o-que-existe", destination: "/jefson/produtos.html" },
    ];
  },
};

export default nextConfig;
