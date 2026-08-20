// A leitura da página PÚBLICA de certificado.
//
// ============================================================
// ESTA É A ÚNICA LEITURA DO SISTEMA QUE ATENDE QUEM NÃO TEM LOGIN
// ============================================================
//
// Todo o resto deste projeto lê com a sessão de alguém e conta com a RLS para
// decidir o que aparece. Aqui não há sessão: quem confere um certificado é um
// contratante, um cliente do aluno, uma banca. Por isso a leitura NÃO toca em
// tabela nenhuma — ela chama `verificar_certificado` (migração 0021), uma
// função `security definer` de retorno fechado, que é a única coisa neste
// banco liberada para `anon`.
//
// O que isso significa na prática, e vale repetir porque é fácil de desfazer
// sem perceber: um `.from("certificado")` aqui NÃO funcionaria (não existe
// política de select para `anon`, e não pode existir), e um dia em que
// alguém "consertasse" isso criando a política estaria abrindo a carteira de
// clientes inteira para quem tem a chave pública. O caminho é a função, e a
// função é estreita de propósito.
//
// A OUTRA DECISÃO: "não encontrei" É UMA RESPOSTA SÓ
// --------------------------------------------------
// Código mal formado e código que não existe produzem exatamente o mesmo
// resultado. Separar os dois — "esse código não tem o formato certo" versus
// "não encontramos" — entregaria de graça, a quem estivesse tentando
// adivinhar, a confirmação de que o formato dele já está certo. A tela mostra
// uma frase só, e ela não descreve o formato.

import { codigoValido, normalizarCodigo } from "./certificado";
import { supabaseConfigurado } from "../data";
import { criarSupabaseServer } from "../supabase/server";

const MOTIVO_SEM_CONEXAO =
  "Não foi possível conferir este certificado agora. Tente novamente em instantes.";
const MAX_DETALHE_LOG = 40;

export interface CertificadoPublico {
  /** `false` = não deu para perguntar ao banco. Diferente de "não existe". */
  conectado: boolean;
  /** Vazio quando conectou; texto humano quando não. */
  motivo: string;
  encontrado: boolean;
  /** O código já normalizado — vazio quando a forma foi recusada. */
  codigo: string;
  aluno: string;
  trilha: string;
  /** Instante ISO de emissão; vazio quando não encontrado. */
  emitidoEm: string;
}

function avisar(detalhe: unknown): void {
  // SÓ o código do erro. A mensagem de um erro de PostgREST ecoa parâmetros
  // da chamada — aqui isso significaria o código do certificado, e às vezes o
  // nome de quem concluiu, escritos no log do servidor.
  console.warn("[conteudo/dados-certificado] verificar falhou", String(detalhe).slice(0, MAX_DETALHE_LOG));
}

function naoEncontrado(codigo: string): CertificadoPublico {
  return { conectado: true, motivo: "", encontrado: false, codigo, aluno: "", trilha: "", emitidoEm: "" };
}

function semConexao(codigo: string): CertificadoPublico {
  return { conectado: false, motivo: MOTIVO_SEM_CONEXAO, encontrado: false, codigo, aluno: "", trilha: "", emitidoEm: "" };
}

/** A linha crua da função. Cada campo passa por um mapeador, nunca por `as`. */
type Linha = Record<string, unknown>;

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor : "";
}

/**
 * O certificado de um código, ou "não encontrei".
 *
 * `unknown` na assinatura porque o valor vem do segmento de uma URL pública:
 * pode ser qualquer coisa que caiba num endereço.
 */
export async function verificarCertificado(codigoBruto: unknown): Promise<CertificadoPublico> {
  const codigo = normalizarCodigo(codigoBruto);

  // Recusado ANTES de existir cliente de banco. Quem chega com lixo na URL —
  // um varredor, um link quebrado, uma tentativa — não gera consulta.
  if (!codigoValido(codigo)) return naoEncontrado("");

  if (!supabaseConfigurado()) return semConexao(codigo);

  try {
    const s = criarSupabaseServer();
    const { data, error } = await s.rpc("verificar_certificado", { p_codigo: codigo });

    if (error) {
      avisar((error as { code?: string }).code ?? "sem-codigo");
      return semConexao(codigo);
    }

    // Função que retorna `table` chega como array pelo PostgREST; aceitar
    // também o objeto direto evita que uma diferença de formato de resposta
    // vire "certificado não encontrado" na cara de quem está conferindo.
    const linha: Linha | null = Array.isArray(data) ? ((data[0] as Linha) ?? null) : ((data as Linha) ?? null);
    if (!linha) return naoEncontrado(codigo);

    return {
      conectado: true,
      motivo: "",
      encontrado: true,
      codigo,
      aluno: texto(linha.aluno),
      trilha: texto(linha.trilha),
      emitidoEm: texto(linha.emitido_em),
    };
  } catch (excecao) {
    avisar(excecao instanceof Error ? excecao.name : "excecao");
    return semConexao(codigo);
  }
}
