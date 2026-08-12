// A tela de destravar o sistema.
//
// POR QUE ELA FICA FORA DO GRUPO `(app)`
// ---------------------------------------
// O layout de `(app)` lê banco/planilha para montar menu e KPIs. Se esta
// tela usasse esse layout, o portão dependeria justamente do dado que ele
// existe para proteger — e um erro de leitura vazaria pra cá como uma tela
// quebrada, em vez de um aviso limpo. Por isso esta página é standalone,
// só com o root layout por cima.

import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Marca } from "@/components/sidebar";
import { Botao, Campo, Card, Input } from "@/components/ui";
import { ambienteAtual, COOKIE_ACESSO, modoAcesso, seloConfere } from "@/lib/acesso";
import { rotaSegura } from "@/lib/portao";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Acesso — raro.ia",
};

export default async function AcessoPage({
  searchParams,
}: {
  searchParams: { erro?: string; de?: string };
}) {
  const ambiente = ambienteAtual();
  const modo = modoAcesso(ambiente);

  // Nestes dois modos não existe nada para "destravar" aqui: `supabase` tem
  // login próprio em /login, e `aberto` não tem dado real a proteger. Manter
  // esta tela visível seria mostrar uma porta que não faz nada.
  if (modo === "supabase" || modo === "aberto") redirect("/");

  const de = rotaSegura(searchParams.de);

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Marca />
        </div>

        {modo === "trancado" ? (
          <AvisoTrancado />
        ) : (
          <TelaSenha erro={searchParams.erro === "1"} de={de} senha={ambiente.senha} />
        )}
      </div>
    </main>
  );
}

/**
 * Mensagem escrita para o DONO do sistema ler, não para quem chegou aqui sem
 * permissão: por isso diz COMO resolver (as duas variáveis) mas não entra em
 * detalhe de como o portão decide os modos — essa lógica protege outros
 * clientes rodando o mesmo código, e não é assunto de quem só quer entrar.
 */
function AvisoTrancado() {
  return (
    <Card>
      <h1 className="font-display text-[20px] font-fino tracking-tight text-texto">
        Sistema sem proteção configurada
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-texto-2">
        Este painel tem dado real de negócio — financeiro, alunos — e ainda não tem senha nem
        login configurados. Por isso os números não aparecem agora: é mais seguro esconder tudo
        do que arriscar mostrar para quem não deveria ver.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-texto-2">
        Para destravar, defina a variável de ambiente{" "}
        <code className="font-mono text-xs">RARO_SENHA</code> com uma senha longa, ou conecte um
        projeto Supabase para ter login individual por pessoa.
      </p>
    </Card>
  );
}

async function TelaSenha({
  erro,
  de,
  senha,
}: {
  erro: boolean;
  de: string;
  senha: string | undefined;
}) {
  // A pessoa já pode ter digitado a senha antes e estar só revisitando
  // /acesso (por engano, ou de propósito para sair). Sem esta checagem o
  // formulário reapareceria pedindo senha de novo a cada visita à própria
  // tela de acesso.
  const destravado = await seloConfere(cookies().get(COOKIE_ACESSO)?.value, senha);

  if (destravado) {
    return (
      <Card>
        <h1 className="font-display text-[20px] font-fino tracking-tight text-texto">
          Acesso liberado
        </h1>
        <p className="mt-1.5 text-sm text-texto-2">Este navegador já está destravado.</p>
        <a
          href={de}
          className="trans toque mt-5 block rounded-full bg-primaria px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-primaria-2"
        >
          Continuar
        </a>
        <form action="/api/acesso/sair" method="POST" className="mt-3">
          <Botao tipo="fantasma" className="w-full">
            Sair do sistema
          </Botao>
        </form>
      </Card>
    );
  }

  return (
    <Card>
      <h1 className="font-display text-[20px] font-fino tracking-tight text-texto">
        Digite a senha
      </h1>
      <p className="mt-1.5 text-sm text-texto-2">
        Este sistema tem dado real e pede uma senha para abrir.
      </p>
      <form action="/api/acesso" method="POST" className="mt-5 space-y-3">
        <input type="hidden" name="de" value={de} />
        <Campo label="Senha">
          <Input name="senha" type="password" required autoComplete="current-password" autoFocus />
        </Campo>
        {erro && <p className="text-xs text-negativo">Senha incorreta.</p>}
        <Botao className="w-full">Entrar</Botao>
      </form>
    </Card>
  );
}
