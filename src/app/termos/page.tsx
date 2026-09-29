import type { Metadata } from "next";
import Link from "next/link";
import { Marca } from "@/components/sidebar";

export const metadata: Metadata = {
  title: "Termos de Uso — MentorOS",
  robots: { index: true, follow: true },
};

const CONTATO = "guilhermetossi2@gmail.com";

export default function TermosDeUsoPage() {
  return (
    <main className="min-h-screen p-4 pb-16 sm:p-8">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6"><Marca /></div>

        <header className="mt-6">
          <h1 className="font-display text-[26px] font-fino leading-tight tracking-tight text-texto">
            Termos de Uso
          </h1>
          <p className="mt-1.5 text-sm text-texto-3">Última atualização: 29 de setembro de 2026</p>
        </header>

        <article className="mt-8 space-y-8">
          <Secao titulo="Responsável pelo MentorOS">
            <P>
              O MentorOS é operado por <strong className="text-texto">Guilherme Oliveira Lima Tossi</strong>,
              como pessoa física. Dúvidas sobre o uso do sistema podem ser enviadas para{" "}
              <a className="underline underline-offset-2 hover:text-texto" href={`mailto:${CONTATO}`}>{CONTATO}</a>.
            </P>
          </Secao>

          <Secao titulo="Finalidade do sistema">
            <P>
              O MentorOS é uma ferramenta de apoio profissional para organizar atendimentos,
              clientes, metas, tarefas, sessões, conteúdos e integrações autorizadas. Ele não
              substitui avaliação clínica, psicoterapia, diagnóstico, orientação médica, jurídica
              ou financeira.
            </P>
          </Secao>

          <Secao titulo="Uso responsável">
            <P>
              Cada pessoa usa apenas sua própria conta e deve manter os dados de acesso em sigilo.
              Quem administra um workspace é responsável por cadastrar integrantes com a permissão
              adequada, registrar somente informações necessárias e respeitar a confidencialidade
              das pessoas acompanhadas.
            </P>
          </Secao>

          <Secao titulo="Integrações">
            <P>
              Integrações externas, como Google Calendar, só são conectadas após autorização da
              pessoa titular da conta externa. A conexão pode ser revogada a qualquer momento nas
              configurações disponíveis no MentorOS ou no próprio serviço conectado.
            </P>
          </Secao>

          <Secao titulo="Privacidade">
            <P>
              O tratamento de dados, as categorias tratadas e os direitos de quem usa o sistema
              estão descritos na{" "}
              <Link className="underline underline-offset-2 hover:text-texto" href="/privacidade">Política de Privacidade</Link>.
            </P>
          </Secao>

          <Secao titulo="Mudanças nestes termos">
            <P>
              Se estes termos mudarem de forma relevante, a data de atualização será revisada e a
              nova versão será disponibilizada nesta página.
            </P>
          </Secao>
        </article>

        <footer className="mt-10 border-t border-borda-sutil pt-6 text-xs text-texto-3">
          <Link href="/" className="trans toque underline underline-offset-2 hover:text-texto-2">Voltar para o início</Link>
          <span className="px-2" aria-hidden="true">·</span>
          <Link href="/privacidade" className="trans toque underline underline-offset-2 hover:text-texto-2">Política de Privacidade</Link>
        </footer>
      </div>
    </main>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-[17px] font-normal tracking-tight text-texto">{titulo}</h2>
      <div className="mt-2.5 space-y-3">{children}</div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed text-texto-2">{children}</p>;
}
