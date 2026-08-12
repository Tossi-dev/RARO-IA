// Descobre, no SERVIDOR, o papel de quem está logado — pensado para ser
// chamado UMA VEZ por página (Server Component) e o resultado repassado por
// PROP para os componentes de navegação (springboard, sidebar, topbar,
// paleta de comandos). Ver o comentário no topo de `src/lib/apps.ts`
// (`appsDoPapel`) para o porquê de filtrar no servidor e não no cliente.
//
// A LÓGICA É A MESMA DO MIDDLEWARE (src/middleware.ts, ramo
// `modo === "supabase"`), fail-closed: sem usuário, sem linha em `profiles`,
// erro de rede/RLS na consulta, ou um valor fora do enum — tudo isso passa
// por `papelDe()` e vira PAPEL_PADRAO (o papel menos privilegiado). Um
// problema de leitura nunca pode, por acidente, abrir mais navegação do que
// deveria; o pior caso é mostrar menos por um instante, nunca mais.
//
// A ÚNICA EXCEÇÃO — e ela é deliberada, não um furo no fail-closed:
// -------------------------------------------------------------------
// Quando `supabaseConfigurado()` é FALSO, o sistema roda no modo
// planilha/senha (ver `src/lib/acesso.ts`): não existe coluna `profiles`,
// não existe sessão por pessoa, não existe papel nenhum para consultar. Quem
// passou pelo portão nesse modo já provou, por outro caminho (a senha única
// de `RARO_SENHA`, ou não ter proteção nenhuma configurada), que É o dono
// operando o próprio negócio — não há "outra pessoa" de quem esconder nada
// AINDA. O padrão fail-closed dos parágrafos acima vale onde HÁ identidade a
// conferir e a consulta pode falhar; aqui não há identidade nenhuma a
// conferir — a pergunta "qual papel é este?" não tem uma resposta mais
// segura que "dono", porque não existe um papel "mais mentorado" esperando
// para ser descoberto. Devolver PAPEL_PADRAO (mentorado) neste caso não
// seria mais seguro, seria simplesmente ERRADO: cortaria a navegação do
// próprio dono pela metade no dia em que esta tarefa entrar no ar, antes
// mesmo de o login por pessoa (Supabase) estar em operação.
import { supabaseConfigurado } from "@/lib/data";
import { papelDe, PAPEL_PADRAO, type Papel } from "@/lib/papeis";
import { criarSupabaseServer } from "@/lib/supabase/server";

export async function papelAtual(): Promise<Papel> {
  if (!supabaseConfigurado()) return "dono";

  try {
    const supabase = criarSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return PAPEL_PADRAO;

    const { data: perfil, error } = await supabase
      .from("profiles")
      .select("papel")
      .eq("id", user.id)
      .maybeSingle();

    // `maybeSingle()` não lança em erro de RLS/rede — devolve
    // `{data:null, error:{...}}`. Sem este `if`, esse caminho nunca cairia
    // no catch abaixo e um erro de consulta ficaria sem rastro nenhum para
    // diagnosticar (mesmo raciocínio do middleware). `error.code`/`.message`
    // são detalhe técnico da consulta — nunca id nem e-mail, que vazariam
    // quem é a pessoa para qualquer operador que leia o log.
    if (error) {
      console.warn(
        "[papel-atual] papel não pôde ser lido, navegação rebaixada ao mínimo:",
        error.code,
        error.message
      );
      return PAPEL_PADRAO;
    }

    return papelDe(perfil?.papel);
  } catch {
    // Exceção (rede caiu, sessão expirou no meio da leitura) nunca deve
    // impedir a página de renderizar — o papel padrão, já fail-closed,
    // resolve.
    return PAPEL_PADRAO;
  }
}
