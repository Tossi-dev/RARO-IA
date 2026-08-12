import type { Metadata, Viewport } from "next";
import { getDensidade } from "@/lib/densidade-server";
import { getTema } from "@/lib/tema-server";
import "./globals.css";

export const metadata: Metadata = {
  title: "Raro.ia — Plataforma de gestão",
  description: "Gestão consolidada de negócio: financeiro, CRM e lançamentos em tempo real.",
  // Isto aqui é sério: o que este app mostra é o faturamento, o lucro e a
  // lista de clientes com telefone de uma empresa de verdade. Sistema interno
  // não pode aparecer em resultado de busca — e buscador não precisa de
  // convite, basta o endereço vazar num link qualquer.
  robots: { index: false, follow: false, nocache: true },
};

// Sem isto, o celular renderiza a página numa viewport virtual de 980px e
// depois encolhe tudo: o painel "funciona" mas fica ilegível. `viewport-fit`
// deixa o app usar a área embaixo do notch em vez de faixa preta.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0B0C16" },
    { media: "(prefers-color-scheme: light)", color: "#F4F4F8" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // O tema sai do cookie e entra no HTML já renderizado pelo servidor.
  // É por isso que não existe piscada de tema errado ao abrir a página.
  const tema = getTema();
  // A densidade viaja no <html> junto com o tema, e pela mesma razão: as
  // regras que escondem a memória de cálculo são CSS puro, então nenhuma das
  // 25 telas precisa saber que este modo existe.
  const densidade = getDensidade();

  return (
    <html lang="pt-BR" data-tema={tema} data-densidade={densidade}>
      <head>
        {/* Fontes carregadas em runtime (não no build) — com fallback de sistema */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Sora nos títulos e nos números, Inter no corpo — os dois a partir do
            peso 200/300. Carregar 400 como peso mínimo desmontaria a
            identidade: fonte fina em fundo escuro é o que dá o ar caro. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Sora:wght@200;300;400;500;600&family=Inter:wght@300;400;500;600&family=Geist+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
