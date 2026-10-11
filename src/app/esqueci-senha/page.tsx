import Link from "next/link";
import { Marca } from "@/components/sidebar";
import { Botao, Campo, Card, Input } from "@/components/ui";
import { solicitarRedefinicaoSenha } from "@/lib/acoes-acesso";

export const dynamic = "force-dynamic";

export default function EsqueciSenhaPage({
  searchParams,
}: {
  searchParams: { erro?: string; sucesso?: string };
}) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-12 sm:p-8">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(48rem_34rem_at_14%_18%,rgb(var(--primaria)/0.2),transparent_68%)]" />
      <div className="relative w-full max-w-[34rem]">
        <div className="mb-10">
          <Marca />
          <p className="mt-10 text-[11px] font-semibold uppercase tracking-[0.16em] text-primaria-2">Acesso à conta</p>
          <h1 className="mt-4 max-w-[12ch] font-display text-[clamp(36px,5vw,56px)] font-fino leading-[0.96] tracking-[-0.055em] text-texto">Recupere sua senha.</h1>
          <p className="mt-4 max-w-md text-[17px] leading-relaxed text-texto-2">Enviaremos um link seguro para você escolher uma nova senha.</p>
        </div>

        <Card className="!p-5 sm:!p-7">
          {searchParams.sucesso ? (
            <div className="space-y-4">
              <h2 className="font-display text-xl font-fino text-texto">Confira seu e-mail</h2>
              <p className="text-sm leading-relaxed text-texto-2">Se houver uma conta para este endereço, o link de redefinição já foi enviado.</p>
            </div>
          ) : (
            <form action={solicitarRedefinicaoSenha} className="space-y-4">
              <Campo label="E-mail da sua conta">
                <Input name="email" type="email" required autoComplete="email" placeholder="voce@exemplo.com" />
              </Campo>
              {searchParams.erro ? <p className="text-xs text-negativo">Confira o e-mail informado.</p> : null}
              <Botao className="w-full">Enviar link de recuperação</Botao>
            </form>
          )}
        </Card>

        <p className="mt-5 text-center text-sm text-texto-2">
          <Link className="font-medium text-primaria-2 hover:text-texto" href="/login">Voltar para entrar</Link>
        </p>
      </div>
    </main>
  );
}
