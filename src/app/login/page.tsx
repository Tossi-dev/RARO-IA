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
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Marca />
        </div>

        {demo ? (
          <Card>
            <p className="text-sm text-texto-2">
              O app está em <strong className="text-ouro">modo demonstração</strong> — o login é
              ativado automaticamente quando o Supabase for conectado (veja{" "}
              <code className="font-mono text-xs">supabase/README.md</code>).
            </p>
            <Link
              href="/"
              className="mt-4 block rounded-lg bg-primaria px-3 py-2 text-center text-sm font-medium text-white hover:bg-primaria-2"
            >
              Entrar na demonstração
            </Link>
          </Card>
        ) : !temLogin ? (
          <Card>
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
              className="mt-4 block rounded-lg bg-primaria px-3 py-2 text-center text-sm font-medium text-white hover:bg-primaria-2"
            >
              Entrar
            </Link>
          </Card>
        ) : (
          <Card>
            <form action={entrar} className="space-y-3">
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
