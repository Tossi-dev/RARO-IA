import Link from "next/link";
import { Marca } from "@/components/sidebar";
import { Botao, Campo, Card, Input } from "@/components/ui";
import { entrar } from "@/lib/actions";
import { modoDados, supabaseConfigurado } from "@/lib/data";

export const dynamic = "force-dynamic";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { erro?: string };
}) {
  // "Sem Supabase" não é mais sinônimo de demonstração: com a planilha ligada o
  // app roda com o dado real do dono, e sem configuração nenhuma ele não roda com
  // dado nenhum. Cada texto abaixo pertence a um modo só.
  const modo = modoDados();
  const demo = modo === "demo";
  // O login em si depende de Supabase Auth. Sem ele, mostrar um formulário de
  // e-mail e senha seria um botão que não faz nada.
  const temLogin = supabaseConfigurado();

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-12 sm:p-8">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(48rem_34rem_at_14%_18%,rgb(var(--primaria)/0.2),transparent_68%)]" />
      <div className="relative w-full max-w-[34rem]">
        <div className="mb-10">
          <Marca />
          <p className="mt-10 text-[11px] font-semibold uppercase tracking-[0.16em] text-primaria-2">
            Ambiente de mentoria
          </p>
          <h1 className="mt-4 max-w-[10ch] font-display text-[clamp(36px,5vw,56px)] font-fino leading-[0.96] tracking-[-0.055em] text-texto">
            Entre para conduzir melhores conversas.
          </h1>
          <p className="mt-4 max-w-md text-[17px] leading-relaxed text-texto-2">
            Acesse sua conta para continuar o acompanhamento de cada cliente com clareza.
          </p>
        </div>

        {demo ? (
          <Card className="!p-5 sm:!p-7">
            <p className="text-sm text-texto-2">
              O app está em <strong className="text-ouro">modo demonstração</strong> — o login é
              ativado automaticamente quando o Supabase for conectado (veja{" "}
              <code className="font-mono text-xs">supabase/README.md</code>).
            </p>
            <Link
              href="/"
              className="mt-5 block rounded-full bg-primaria px-4 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-primaria-hover"
            >
              Entrar na demonstração
            </Link>
          </Card>
        ) : !temLogin ? (
          <Card className="!p-5 sm:!p-7">
            <p className="text-sm text-texto-2">
              {modo === "planilha" ? (
                <>
                  A base de dados do app é a{" "}
                  <strong className="text-ouro">planilha do Google</strong>{" "}
                  (Base_Financeira_Operacao) — o dado que você vai ver é real.
                </>
              ) : (
                <>
                  O app está <strong className="text-aviso">sem base de dados conectada</strong> — as
                  telas vão aparecer vazias, e isso não é falha de carregamento. Ligue a planilha (
                  <code className="font-mono text-xs">RARO_SHEETS_ID</code>) ou o Supabase para ver
                  dados reais.
                </>
              )}{" "}
              O login com e-mail e senha só existe quando o Supabase for conectado (veja{" "}
              <code className="font-mono text-xs">supabase/README.md</code>).
            </p>
            <Link
              href="/"
              className="mt-5 block rounded-full bg-primaria px-4 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-primaria-hover"
            >
              Entrar
            </Link>
          </Card>
        ) : (
          <Card className="!p-5 sm:!p-7">
            <form action={entrar} className="space-y-4">
              <Campo label="E-mail">
                <Input name="email" type="email" required autoComplete="email" placeholder="voce@exemplo.com" />
              </Campo>
              <Campo label="Senha">
                <Input name="senha" type="password" required autoComplete="current-password" placeholder="••••••••" />
              </Campo>
              {searchParams.erro && (
                <p className="text-xs text-negativo">E-mail ou senha incorretos.</p>
              )}
              <Botao className="w-full">Entrar</Botao>
            </form>
          </Card>
        )}
      </div>
    </main>
  );
}
