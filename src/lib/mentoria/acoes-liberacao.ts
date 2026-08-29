// NOTA DE FRONTEIRA (Tarefa 18): este arquivo NAO carrega mais "use server".
// Um modulo "use server" so pode EXPORTAR funcao async -- e este exporta
// tambem as constantes de mensagem, que os testes e a tela leem. Enquanto
// ninguem importava este arquivo, o Next nunca chegou a aplicar a regra; a
// ficha passou a importar, e o build quebrou na hora. A saida NAO foi
// esconder as constantes: foi reconhecer que a fronteira de Server Action
// e `acoes-ficha.ts`, o unico modulo que os formularios chamam. Daqui para
// baixo e biblioteca de servidor comum, chamada por aquela fronteira e
// pelas rotas -- e por isso pode exportar o que quiser.

// Liberar gravação e transcrição de uma sessão para o portal do mentorado.
//
// POR QUE ISTO É UMA AÇÃO SEPARADA, E NÃO UM CAMPO DA BAIXA
// ---------------------------------------------------------
// Dar baixa numa sessão é registrar o que aconteceu. Publicar a gravação é
// outra decisão, tomada por outra pessoa em outro momento — e é a decisão
// perigosa das duas. Uma gravação de mentoria carrega números do negócio do
// cliente, briga de sócio, o que ele disse que não conta para mais ninguém.
// Misturar as duas num formulário só faria a publicação virar efeito colateral
// de um clique em "registrar", e ninguém lembraria de desmarcar.
//
// A migração 0017 já escolheu o lado seguro: as duas flags nascem `false`, e
// quem esconde de fato não é a tela, é a view `sessao_do_portal` — RLS decide
// se a LINHA aparece, e quando aparece, aparece INTEIRA. Esta ação só vira a
// chave; a garantia mora no banco.
//
// O NOME DA COLUNA NUNCA VEM DO FORMULÁRIO
// -----------------------------------------
// O formulário manda um APELIDO ("gravacao" ou "transcricao"), e este arquivo
// traduz o apelido para o nome real da coluna a partir de um mapa literal. Se
// o nome da coluna viesse do formulário, um POST direto escolheria qual coluna
// de `sessao` escrever — o mesmo tipo de buraco que a Tarefa 16 fechou ao
// recusar identidade vinda de campo de formulário.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { criarSupabaseServer } from "../supabase/server";

export const MOTIVO_CAMPO_INVALIDO =
  "Não reconheci o que você pediu para liberar. Recarregue a ficha e tente de novo.";
export const MOTIVO_SESSAO_INVALIDA =
  "Não reconheci a sessão. Recarregue a ficha e tente de novo.";
export const MOTIVO_ERRO_GRAVAR =
  "Não foi possível mudar a liberação agora. Tente novamente em instantes.";

/**
 * Os dois únicos apelidos aceitos, e a coluna literal de cada um. É uma lista
 * de PERMITIDOS, nunca de proibidos: lista de proibidos falha por omissão, e
 * a omissão aqui seria escrever numa coluna que ninguém autorizou.
 */
// Atencao a colisao de nomes: o apelido "transcricao" aponta para a FLAG
// `transcricao_liberada`, nunca para a coluna de texto `transcricao`. E
// exatamente por isso que existe um mapa, e nao uma concatenacao de sufixo:
// sem ele, o apelido e a coluna de texto seriam a mesma string.
const COLUNA_POR_CAMPO: Readonly<Record<string, "gravacao_liberada" | "transcricao_liberada">> =
  Object.freeze({
    gravacao: "gravacao_liberada",
    transcricao: "transcricao_liberada",
  });

/** O único valor que LIGA. Qualquer outra coisa desliga — ver `liberarNoPortal`. */
const VALOR_LIGADO = "1";

const MAX_DETALHE_LOG = 40;

function avisar(operacao: string, detalhe: string): void {
  // Só um código curto, nunca a mensagem do Postgres nem a de uma exceção:
  // mensagem de terceiro pode ecoar o corpo da requisição, e o corpo aqui
  // trafega ao lado de sessões que carregam transcrição.
  console.warn(`[mentoria/acoes-liberacao] ${operacao} falhou`, String(detalhe).slice(0, MAX_DETALHE_LOG));
}

function caminhoFicha(mentoradoId: string): string {
  return mentoradoId ? `/mentoria/${mentoradoId}` : "/mentoria";
}

function redirecionarComErro(caminho: string, mensagem: string): never {
  redirect(`${caminho}?erro=${encodeURIComponent(mensagem)}`);
}

/**
 * Server Action dos dois interruptores da ficha.
 *
 * Campos lidos do formulário: `mentoradoId` (só para saber para onde voltar),
 * `sessaoId`, `campo` (o apelido) e `valor`.
 *
 * **Desligar é o padrão.** Só o literal `"1"` liga; `"true"`, `"on"`, `" 1"`,
 * campo ausente, formulário truncado — tudo isso DESLIGA. O erro possível
 * nessa escolha é esconder algo que já estava publicado, e o dono percebe na
 * hora. O erro na escolha oposta seria publicar a conversa de um cliente
 * porque um checkbox chegou torto, e ninguém percebe nunca.
 */
export async function liberarNoPortal(formData: FormData): Promise<void> {
  const mentoradoId = String(formData.get("mentoradoId") ?? "").trim();
  const caminho = caminhoFicha(mentoradoId);

  const sessaoId = String(formData.get("sessaoId") ?? "").trim();
  if (!sessaoId) redirecionarComErro(caminho, MOTIVO_SESSAO_INVALIDA);

  const campo = String(formData.get("campo") ?? "");
  const coluna = Object.prototype.hasOwnProperty.call(COLUNA_POR_CAMPO, campo)
    ? COLUNA_POR_CAMPO[campo]
    : null;
  if (!coluna) redirecionarComErro(caminho, MOTIVO_CAMPO_INVALIDO);

  const ligar = String(formData.get("valor") ?? "") === VALOR_LIGADO;
  let caminhoRevalidacao = caminho;

  try {
    const s = criarSupabaseServer();

    // Transcrição é uma publicação de dado sensível. Antes de alterar a
    // flag, derive a sessão e o mentorado pelo servidor/RLS e confirme os
    // dois consentimentos; nenhum campo equivalente enviado pelo POST vale.
    if (campo === "transcricao") {
      const sessao = await s.from("sessao").select("id, matricula_id").eq("id", sessaoId).maybeSingle();
      if (sessao.error || !sessao.data) redirecionarComErro(caminho, MOTIVO_ERRO_GRAVAR);
      const matriculaId = typeof sessao.data.matricula_id === "string" ? sessao.data.matricula_id : "";
      const matricula = matriculaId
        ? await s.from("matricula").select("mentorado_id").eq("id", matriculaId).maybeSingle()
        : { data: null, error: new Error("matricula ausente") };
      const mentoradoIdDerivado = typeof matricula.data?.mentorado_id === "string" ? matricula.data.mentorado_id : "";
      if (matricula.error || !mentoradoIdDerivado) redirecionarComErro(caminho, MOTIVO_ERRO_GRAVAR);
      const consentimentos = await s.from("atendimento_consentimento").select("categoria, consentido").eq("mentorado_id", mentoradoIdDerivado);
      if (consentimentos.error) redirecionarComErro(caminho, MOTIVO_ERRO_GRAVAR);
      const linhas = Array.isArray(consentimentos.data) ? consentimentos.data : [];
      const consentido = (categoria: string) => linhas.some((item: unknown) => {
        const row = item as { categoria?: unknown; consentido?: unknown };
        return row.categoria === categoria && row.consentido === true;
      });
      if (!consentido("transcricao") || !consentido("portal")) redirecionarComErro(caminho, MOTIVO_ERRO_GRAVAR);
      caminhoRevalidacao = caminhoFicha(mentoradoIdDerivado);
    }
    // Uma chave só no update. Nem a outra flag, nem `transcricao`, nem
    // `link_gravacao`: liberar a gravação não pode, de carona, publicar a
    // transcrição.
    const { error } = await s
      .from("sessao")
      .update({ [coluna]: ligar })
      .eq("id", sessaoId);

    if (error) {
      avisar("liberarNoPortal", error.code ?? "sem-codigo");
      redirecionarComErro(caminho, MOTIVO_ERRO_GRAVAR);
    }
  } catch (excecao) {
    // `redirect` do Next funciona LANÇANDO — deixar a exceção dele passar é
    // obrigatório, senão o redirecionamento de erro acima nunca acontece.
    if (ehControleDeFluxoDoNext(excecao)) throw excecao;
    avisar("liberarNoPortal", excecao instanceof Error ? excecao.name : "excecao");
    redirecionarComErro(caminho, MOTIVO_ERRO_GRAVAR);
  }

  revalidatePath(caminhoRevalidacao);
  // O portal do mentorado é a outra ponta desta chave: sem revalidar aqui, o
  // mentorado continuaria vendo a versão em cache por até o próximo acesso
  // frio — publicado no banco e invisível na tela, ou o contrário.
  revalidatePath("/portal");
}

/**
 * `redirect()` e `notFound()` do Next sinalizam por exceção, e o bailout
 * dinâmico também. Engolir qualquer um deles quebra o framework em silêncio —
 * mesmo cuidado de `src/lib/data/simulacao.ts` e de
 * `src/lib/integracoes/google-agenda-escrita.ts`.
 */
function ehControleDeFluxoDoNext(excecao: unknown): boolean {
  if (typeof excecao !== "object" || excecao === null) return false;
  const digest = (excecao as { digest?: unknown }).digest;
  if (typeof digest !== "string") return false;
  return (
    digest.startsWith("NEXT_REDIRECT") ||
    digest.startsWith("NEXT_NOT_FOUND") ||
    digest.startsWith("DYNAMIC_SERVER_USAGE")
  );
}
