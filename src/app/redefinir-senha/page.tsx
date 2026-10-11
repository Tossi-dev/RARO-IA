import Link from "next/link";
import { Marca } from "@/components/sidebar";
import { Botao, Campo, Card, Input } from "@/components/ui";
import { redefinirSenha } from "@/lib/acoes-acesso";

export const dynamic = "force-dynamic";

const MENSAGENS_ERRO: Record<string, string> = {
  campos: "Use uma senha de pelo menos 12 caracteres e repita-a exatamente.",
  salvar: "Não foi possível atualizar a senha. Peça um novo link e tente novamente.",
};

export default function RedefinirSenhaPage({
  searchParams,
}: {
  searchParams: { erro?: string };
}) {
  const erro = searchParams.erro ? MENSAGENS_ERRO[searchParams.erro] ?? MENSAGENS_ERRO.salvar : null;

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-12 sm:p-8">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(48rem_34rem_at_14%_18%,rgb(var(--primaria)/0.2),transparent_68%)]" />
      <div className="relative w-full max-w-[34rem]">
        <div className="mb-10">
          <Marca />
          <p className="mt-10 text-[11px] font-semibold uppercase tracking-[0.16em] text-primaria-2">Acesso à conta</p>
          <h1 className="mt-4 max-w-[12ch] font-display text-[clamp(36px,5vw,56px)] font-fino leading-[0.96] tracking-[-0.055em] text-texto">Escolha uma nova senha.</h1>
          <p className="mt-4 max-w-md text-[17px] leading-relaxed text-texto-2">Use uma senha exclusiva, com ao menos 12 caracteres.</p>
        </div>

        <Card className="!p-5 sm:!p-7">
          <form action={redefinirSenha} className="space-y-4">
            <Campo label="Nova senha">
              <Input name="senha" type="password" required minLength={12} autoComplete="new-password" placeholder="Pelo menos 12 caracteres" />
            </Campo>
            <Campo label="Confirme a nova senha">
              <Input name="confirmarSenha" type="password" required minLength={12} autoComplete="new-password" placeholder="Repita a nova senha" />
            </Campo>
            {erro ? <p className="text-xs text-negativo">{erro}</p> : null}
            <Botao className="w-full">Atualizar senha</Botao>
          </form>
        </Card>

        <p className="mt-5 text-center text-sm text-texto-2">
          <Link className="font-medium text-primaria-2 hover:text-texto" href="/login">Voltar para entrar</Link>
        </p>
      </div>
    </main>
  );
}
