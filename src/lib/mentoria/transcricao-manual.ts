import { podeRegistrar, type ConsentimentosAtendimento } from "./consentimento";
import { podeExibirParaCliente, type VisibilidadeAtendimento } from "./visibilidade-atendimento";

/** Entrada local colada/digitada por uma pessoa. Nenhum fornecedor é usado. */
export type EntradaTranscricaoManual = Readonly<{
  texto: unknown;
  visibilidade: unknown;
  consentimentos: ConsentimentosAtendimento | null | undefined;
  /** A camada de acesso deve informar explicitamente que a sessão pertence ao ator. */
  acessoPermitido: boolean;
}>;

export type TranscricaoManualAutorizada = Readonly<{
  texto: string;
  origem: "manual";
  visibilidade: VisibilidadeAtendimento;
  compartilhavel: boolean;
}>;

export type ResultadoTranscricaoManual =
  | Readonly<{ ok: true; valor: TranscricaoManualAutorizada }>
  | Readonly<{ ok: false; erro: string }>;

export const MOTIVO_TRANSCRICAO_MANUAL_VAZIA = "Escreva a transcrição antes de salvar.";
export const MOTIVO_TRANSCRICAO_MANUAL_SEM_CONSENTIMENTO =
  "A transcrição não pode ser registrada sem consentimento explícito.";
export const MOTIVO_TRANSCRICAO_MANUAL_ACESSO_NEGADO =
  "Você não tem acesso a esta sessão.";
export const MOTIVO_TRANSCRICAO_MANUAL_VISIBILIDADE_INVALIDA =
  "Escolha uma visibilidade válida para a transcrição.";

/**
 * Valida e prepara a anotação manual. A função não lê nem escreve banco e
 * não retorna texto em nenhum ramo de erro; a decisão de consentimento é
 * feita com a fotografia explícita recebida da camada autorizada.
 */
export function prepararTranscricaoManual(entrada: EntradaTranscricaoManual): ResultadoTranscricaoManual {
  if (entrada.acessoPermitido !== true) {
    return { ok: false, erro: MOTIVO_TRANSCRICAO_MANUAL_ACESSO_NEGADO };
  }

  const consentimentos = entrada.consentimentos;
  if (!consentimentos || !podeRegistrar("transcricao", consentimentos)) {
    return { ok: false, erro: MOTIVO_TRANSCRICAO_MANUAL_SEM_CONSENTIMENTO };
  }

  if (entrada.visibilidade !== "privada_profissional" && entrada.visibilidade !== "compartilhavel") {
    return { ok: false, erro: MOTIVO_TRANSCRICAO_MANUAL_VISIBILIDADE_INVALIDA };
  }

  const texto = typeof entrada.texto === "string" ? entrada.texto : "";
  if (texto.trim() === "") {
    return { ok: false, erro: MOTIVO_TRANSCRICAO_MANUAL_VAZIA };
  }

  const visibilidade = entrada.visibilidade as VisibilidadeAtendimento;
  const compartilhavel = visibilidade === "compartilhavel";
  if (compartilhavel && !podeExibirParaCliente(visibilidade, "transcricao", consentimentos)) {
    return { ok: false, erro: MOTIVO_TRANSCRICAO_MANUAL_SEM_CONSENTIMENTO };
  }

  return { ok: true, valor: { texto, origem: "manual", visibilidade, compartilhavel } };
}

/**
 * Projeção segura para o grafo: só a referência e seu estado de autorização.
 * O texto deliberadamente não existe no tipo nem no objeto devolvido.
 */
export function referenciaTranscricaoParaGrafo(
  id: string,
  clienteId: string,
  autorizada: boolean,
): { id: string; clienteId: string; tipo: "transcricao_referencia"; transcricaoAutorizada: boolean } {
  return { id, clienteId, tipo: "transcricao_referencia", transcricaoAutorizada: autorizada };
}
