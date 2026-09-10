import Link from "next/link";
import { Marca } from "@/components/sidebar";
import { Botao, Campo, Card, Input } from "@/components/ui";
import { criarContaSaas } from "@/lib/acoes-acesso";

export const dynamic = "force-dynamic";

const MENSAGENS_ERRO: Record<string, string> = {
  campos: "Confira seu nome, o nome do espaço, e-mail e senha. A senha precisa ter ao menos 12 caracteres e ser confirmada.",
  cadastro: "Não foi possível concluir o cadastro agora. Confira seu e-mail ou tente novamente em alguns minutos.",
};

export default function CriarContaPage({
  searchParams,
}: {
  searchParams: { erro?: string; sucesso?: string };
}) {
  const erro = searchParams.erro ? MENSAGENS_ERRO[searchParams.erro] ?? MENSAGENS_ERRO.cadastro : null;

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-12 sm:p-8">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(48rem_34rem_at_14%_18%,rgb(var(--primaria)/0.2),transparent_68%)]" />
      <div className="relative w-full max-w-[34rem]">
        <div className="mb-10">
          <Marca />
          <p className="mt-10 text-[11px] font-semibold uppercase tracking-[0.16em] text-primaria-2">
            Comece seu espaço
          </p>
          <h1 className="mt-4 max-w-[12ch] font-display text-[clamp(36px,5vw,56px)] font-fino leading-[0.96] tracking-[-0.055em] text-texto">
            Crie seu ambiente de mentoria.
          </h1>
          <p className="mt-4 max-w-md text-[17px] leading-relaxed text-texto-2">
            Seu espaço será separado dos demais. Você escolhe sua senha e confirma o e-mail antes de entrar.
          </p>
        </div>

        <Card className="!p-5 sm:!p-7">
          {searchParams.sucesso ? (
            <div className="space-y-4">
              <h2 className="font-display text-xl font-fino text-texto">Confira seu e-mail</h2>
              <p className="text-sm leading-relaxed text-texto-2">
                Enviamos um link de confirmação. Ao abrir o link, sua conta estará pronta para entrar com a senha que você acabou de escolher.
              </p>
              <Link className="inline-flex text-sm font-medium text-primaria-2 hover:text-texto" href="/login">
                Voltar para entrar
              </Link>
            </div>
          ) : (
            <form action={criarContaSaas} className="space-y-4">
              <Campo label="Seu nome">
                <Input name="nome" required autoComplete="name" placeholder="Como você quer ser chamado" />
              </Campo>
              <Campo label="Nome do seu espaço">
                <Input name="workspaceNome" required placeholder="Ex.: Mentoria Marina" />
              </Campo>
              <Campo label="E-mail">
                <Input name="email" type="email" required autoComplete="email" placeholder="voce@exemplo.com" />
              </Campo>
              <Campo label="Crie uma senha">
                <Input name="senha" type="password" required minLength={12} autoComplete="new-password" placeholder="Pelo menos 12 caracteres" />
              </Campo>
              <Campo label="Confirme sua senha">
                <Input name="confirmarSenha" type="password" required minLength={12} autoComplete="new-password" placeholder="Repita a senha" />
              </Campo>
              {erro ? <p className="text-xs text-negativo">{erro}</p> : null}
              <Botao className="w-full">Criar meu espaço</Botao>
            </form>
          )}
        </Card>

        <p className="mt-5 text-center text-sm text-texto-2">
          Já possui uma conta?{" "}
          <Link className="font-medium text-primaria-2 hover:text-texto" href="/login">
            Entrar
          </Link>
        </p>
      </div>
    </main>
  );
}
