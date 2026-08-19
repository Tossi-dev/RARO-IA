// NOTA DE FRONTEIRA: sem "use server". Um módulo "use server" só pode exportar
// função async, e este exporta as constantes de mensagem que os testes leem.
// A fronteira de Server Action da ficha é `mentoria/acoes-ficha.ts`; quando as
// telas de trilha existirem (tarefas 30 e 31), elas ganham a sua.
//
// Escrita de trilhas, aulas, matrícula, progresso e certificado.
//
// ============================================================
// `marcarAula` NÃO ESCREVE NA TABELA — CHAMA A FUNÇÃO DO BANCO
// ============================================================
//
// O caminho óbvio seria um `.update()` em `progresso_trilha`. Ele não existe
// aqui, e não é estilo: a migração 0020 deliberadamente NÃO criou política de
// UPDATE dessa tabela para mentorado, porque RLS decide se a LINHA aparece e
// nunca QUE COLUNA pode ser escrita. Com a política de linha inteira que 0012
// tinha, um PATCH direto no PostgREST forjava a data de conclusão e movia a
// linha para outro `mentorado_id`.
//
// Quem decide se ESTA pessoa pode marcar ESTA aula é
// `public.trilha_marcar_aula`, dentro do banco, a cada chamada — nunca um `if`
// escrito aqui. Um `if` de tela é fácil de esquecer numa tela nova, ou de
// contornar chamando a Server Action direto com outro id; a função vale para
// QUALQUER caminho que tente escrever, inclusive um que ainda não existe.
//
// A checagem de liberação que existe aqui é OUTRA coisa, e o cabeçalho precisa
// dizer isso com todas as letras: ela é conveniência, não segurança. Serve
// para a pessoa receber "esta aula ainda não abriu" em vez de um erro genérico
// do banco. Se ela fosse a única barreira, não seria barreira nenhuma.
//
// ⚠ E há um limite conhecido, herdado da Tarefa 27: a função do banco confere
// matrícula ativa, workspace e papel — mas NÃO confere a data de liberação,
// que não existe como coluna calculável em SQL simples. Um mentorado
// determinado consegue marcar como concluída uma aula que ainda não abriu. Ele
// estaria enganando o próprio progresso, não acessando conteúdo alheio; ainda
// assim está registrado como dívida, não como resolvido.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { criarSupabaseServer } from "../supabase/server";
import { lerMinhaTrilha } from "./dados-trilha";

export const MOTIVO_AULA_INVALIDA = "Não reconheci a aula. Recarregue a página e tente de novo.";
export const MOTIVO_AULA_FECHADA =
  "Esta aula ainda não foi liberada. Ela abre na data indicada ao lado do título.";
export const MOTIVO_ERRO_MARCAR =
  "Não foi possível registrar o seu progresso agora. Tente novamente em instantes.";
export const MOTIVO_TRILHA_INVALIDA = "Não reconheci a trilha. Recarregue a página e tente de novo.";
export const MOTIVO_NOME_VAZIO = "Escreva um nome para a trilha.";
export const MOTIVO_TITULO_VAZIO = "Escreva um título para a aula.";
export const MOTIVO_DIAS_INVALIDO =
  "Os dias de liberação precisam ser um número inteiro de 0 para cima. Zero abre junto com a trilha.";
export const MOTIVO_ERRO_SALVAR = "Não foi possível salvar agora. Tente novamente em instantes.";
export const MOTIVO_MENTORADO_INVALIDO = "Não reconheci o mentorado. Recarregue a página e tente de novo.";

const MAX_ID = 100;
const MAX_TEXTO_CURTO = 200;
const MAX_DETALHE_LOG = 40;

function avisar(operacao: string, detalhe: unknown): void {
  console.warn(`[conteudo/acoes-trilha] ${operacao} falhou`, String(detalhe).slice(0, MAX_DETALHE_LOG));
}

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim();
}

function voltarComErro(caminho: string, mensagem: string): never {
  redirect(`${caminho}?erro=${encodeURIComponent(mensagem)}`);
}

/** `redirect` do Next sinaliza por exceção — engoli-la mataria o próprio redirecionamento. */
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

// ============================================================
// O mentorado
// ============================================================

/**
 * Marca ou desmarca UMA aula da própria trilha.
 *
 * `concluida` liga só com o literal `"1"`. Qualquer outra coisa DESMARCA — o
 * lado seguro: o erro possível é a pessoa precisar clicar de novo, nunca uma
 * aula constar como feita sem ninguém ter dito isso.
 */
export async function marcarAula(formData: FormData): Promise<void> {
  const caminho = "/portal/trilhas";
  const aulaId = texto(formData, "aulaId");
  if (!aulaId || aulaId.length > MAX_ID) voltarComErro(caminho, MOTIVO_AULA_INVALIDA);

  const concluida = texto(formData, "concluida") === "1";

  try {
    // Conveniência, não segurança — ver o cabeçalho. Serve para a mensagem
    // ser "esta aula ainda não abriu" em vez de um erro genérico do banco.
    const minha = await lerMinhaTrilha(new Date().toISOString());
    const aula = minha.trilhas.flatMap((t) => t.aulas).find((a) => a.id === aulaId);
    if (!aula) voltarComErro(caminho, MOTIVO_AULA_INVALIDA);
    if (!aula.liberada) voltarComErro(caminho, MOTIVO_AULA_FECHADA);

    const s = criarSupabaseServer();
    const { error } = await s.rpc("trilha_marcar_aula", {
      p_aula_id: aulaId,
      p_concluida: concluida,
    });

    if (error) {
      // A função LEVANTA exceção quando zero linhas são afetadas (0020), e o
      // supabase-js devolve isso como `error`. Sem este `if`, a ação fingiria
      // sucesso silencioso e o botão não faria nada sem avisar ninguém.
      avisar("marcarAula", error.code ?? "sem-codigo");
      voltarComErro(caminho, MOTIVO_ERRO_MARCAR);
    }
  } catch (excecao) {
    if (ehControleDeFluxoDoNext(excecao)) throw excecao;
    avisar("marcarAula", excecao instanceof Error ? excecao.name : "excecao");
    voltarComErro(caminho, MOTIVO_ERRO_MARCAR);
  }

  revalidatePath(caminho);
}

/*
 * A EMISSÃO DO CERTIFICADO NÃO MORA AQUI, E ISSO FOI UMA DECISÃO, NÃO UM
 * ESQUECIMENTO.
 *
 * O plano da Fase 2 (tarefa 28) pedia `emitirCertificado` junto com estas
 * ações. Ao escrever, apareceu uma incoerência com o banco: a política de
 * insert de `certificado` (migração 0020, já aplicada) permite dono e gestor,
 * e não o mentorado — então o portal não teria como emitir o próprio
 * certificado, e a ação teria que nascer torta de um dos dois jeitos:
 *
 *   - uma função `security definer` nova, que conseguiria conferir no banco
 *     "todas as aulas concluídas" mas NÃO a data de liberação (a metade que
 *     não é expressável em SQL simples), deixando um documento emitível sem a
 *     trilha estar realmente completa;
 *   - ou a emissão pela gestão, que é coerente com a RLS mas precisa de uma
 *     leitura que ainda não existe (hoje só há a do portal).
 *
 * Certificado é documento: emitir errado é pior que não emitir. O dono
 * decidiu adiar a emissão para uma tarefa própria, decidida junto com a tela.
 * Até lá, `temDireitoAoCertificado` (calculado na leitura) já diz QUANDO a
 * pessoa concluiu — só não existe o ato de emitir.
 */

// ============================================================
// A gestão
//
// `workspace_id` NUNCA é lido do formulário em nenhuma delas — nem é
// mencionado. Ele tem `default` no schema, e a política de insert de 0019/0020
// exige `workspace_id = workspace_atual()`: quem decide de quem é a linha é o
// banco, a partir de quem está autenticado.
// ============================================================

export async function salvarTrilha(formData: FormData): Promise<void> {
  const caminho = "/conteudo/trilhas";
  const nome = texto(formData, "nome");
  if (!nome || nome.length > MAX_TEXTO_CURTO) voltarComErro(caminho, MOTIVO_NOME_VAZIO);

  const id = texto(formData, "id");
  const descricao = texto(formData, "descricao").slice(0, 2000);
  const programaId = texto(formData, "programaId");

  try {
    const s = criarSupabaseServer();
    // `programa_id` vazio vira null, não string vazia: a coluna é uma FK, e
    // "" não é um uuid — o insert falharia com erro de tipo em vez de gravar
    // a trilha sem programa, que é um estado legítimo (ver 0019).
    const valores = {
      nome,
      descricao,
      programa_id: programaId === "" ? null : programaId,
    };

    const { error } = id
      ? await s.from("trilha").update(valores).eq("id", id)
      : await s.from("trilha").insert(valores);

    if (error) {
      avisar("salvarTrilha", error.code ?? "sem-codigo");
      voltarComErro(caminho, MOTIVO_ERRO_SALVAR);
    }
  } catch (excecao) {
    if (ehControleDeFluxoDoNext(excecao)) throw excecao;
    avisar("salvarTrilha", excecao instanceof Error ? excecao.name : "excecao");
    voltarComErro(caminho, MOTIVO_ERRO_SALVAR);
  }

  revalidatePath(caminho);
}

export async function salvarAula(formData: FormData): Promise<void> {
  const caminho = "/conteudo/trilhas";
  const trilhaId = texto(formData, "trilhaId");
  if (!trilhaId || trilhaId.length > MAX_ID) voltarComErro(caminho, MOTIVO_TRILHA_INVALIDA);

  const titulo = texto(formData, "titulo");
  if (!titulo || titulo.length > MAX_TEXTO_CURTO) voltarComErro(caminho, MOTIVO_TITULO_VAZIO);

  // Recusado AQUI, antes do banco. O `check (libera_em_dias >= 0)` da 0019
  // também barra, e é ele a garantia — esta checagem existe para a mensagem
  // ser humana em vez de um erro de constraint.
  const diasCru = texto(formData, "liberaEmDias");
  const dias = diasCru === "" ? 0 : Number(diasCru);
  if (!Number.isInteger(dias) || dias < 0) voltarComErro(caminho, MOTIVO_DIAS_INVALIDO);

  const id = texto(formData, "id");
  const ordemCru = texto(formData, "ordem");
  const ordem = ordemCru === "" ? 0 : Number(ordemCru);

  try {
    const s = criarSupabaseServer();
    const valores = {
      trilha_id: trilhaId,
      titulo,
      tipo: texto(formData, "tipo") || "video",
      url_video: texto(formData, "urlVideo"),
      texto: String(formData.get("texto") ?? ""),
      duracao_min: Number.isInteger(Number(texto(formData, "duracaoMin"))) ? Number(texto(formData, "duracaoMin")) : 0,
      libera_em_dias: dias,
      ordem: Number.isInteger(ordem) ? ordem : 0,
    };

    const { error } = id
      ? await s.from("trilha_aula").update(valores).eq("id", id)
      : await s.from("trilha_aula").insert(valores);

    if (error) {
      avisar("salvarAula", error.code ?? "sem-codigo");
      voltarComErro(caminho, MOTIVO_ERRO_SALVAR);
    }
  } catch (excecao) {
    if (ehControleDeFluxoDoNext(excecao)) throw excecao;
    avisar("salvarAula", excecao instanceof Error ? excecao.name : "excecao");
    voltarComErro(caminho, MOTIVO_ERRO_SALVAR);
  }

  revalidatePath(caminho);
}

export async function matricularNaTrilha(formData: FormData): Promise<void> {
  const caminho = "/conteudo/trilhas";
  const mentoradoId = texto(formData, "mentoradoId");
  if (!mentoradoId || mentoradoId.length > MAX_ID) voltarComErro(caminho, MOTIVO_MENTORADO_INVALIDO);

  const trilhaId = texto(formData, "trilhaId");
  if (!trilhaId || trilhaId.length > MAX_ID) voltarComErro(caminho, MOTIVO_TRILHA_INVALIDA);

  try {
    const s = criarSupabaseServer();
    const { error } = await s
      .from("trilha_matricula")
      .insert({ mentorado_id: mentoradoId, trilha_id: trilhaId });

    if (error) {
      // 23505 aqui é o `unique (mentorado_id, trilha_id)`: a pessoa já está
      // matriculada, e isso é o estado desejado. Tratar como erro faria a
      // tela pedir para tentar de novo algo que já está feito.
      if (error.code !== "23505") {
        avisar("matricularNaTrilha", error.code ?? "sem-codigo");
        voltarComErro(caminho, MOTIVO_ERRO_SALVAR);
      }
    }
  } catch (excecao) {
    if (ehControleDeFluxoDoNext(excecao)) throw excecao;
    avisar("matricularNaTrilha", excecao instanceof Error ? excecao.name : "excecao");
    voltarComErro(caminho, MOTIVO_ERRO_SALVAR);
  }

  revalidatePath(caminho);
}
