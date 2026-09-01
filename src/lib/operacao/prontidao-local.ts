export type AuditoriaDeArquivos = {
  aprovado: boolean;
  /** Somente caminhos: a auditoria nunca abre nem imprime conteúdo. */
  segredos: string[];
  artefatos: string[];
};

function caminhoNormalizado(caminho: string): string {
  return caminho.replace(/\\/g, "/").replace(/^\.\//, "").trim();
}

function eExemploDeAmbiente(caminho: string): boolean {
  return /(^|\/)\.env\.example$/i.test(caminho);
}

function eSegredoPotencial(caminho: string): boolean {
  if (eExemploDeAmbiente(caminho)) return false;
  return /(^|\/)\.env(?:$|\.)/i.test(caminho) || /\.env$/i.test(caminho) || /\.(?:key|pem)$/i.test(caminho);
}

function eArtefatoGerado(caminho: string): boolean {
  return /(^|\/)(?:\.next|node_modules|coverage)(?:\/|$)/i.test(caminho) || /\.tsbuildinfo$/i.test(caminho);
}

/**
 * Classifica somente nomes já rastreados pelo Git. Não toca no disco e não
 * tem acesso a variáveis de ambiente: é seguro usá-la antes de um commit.
 */
export function auditoriaDeArquivosRastreados(arquivos: readonly string[]): AuditoriaDeArquivos {
  const unicos = [...new Set(arquivos.filter((arquivo) => typeof arquivo === "string").map(caminhoNormalizado).filter(Boolean))];
  const segredos = unicos.filter(eSegredoPotencial).sort((a, b) => a.localeCompare(b, "en"));
  const artefatos = unicos.filter(eArtefatoGerado).sort((a, b) => a.localeCompare(b, "en"));
  return { aprovado: segredos.length === 0 && artefatos.length === 0, segredos, artefatos };
}
