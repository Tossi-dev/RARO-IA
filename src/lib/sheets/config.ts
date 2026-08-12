// Configuracao da integracao com a planilha do Tossi (Base_Financeira_Operacao).
//
// MODULO NEUTRO de proposito (sem diretiva de cliente): estas funcoes leem
// process.env e sao consumidas por Server Components e por rotas de API. Um
// modulo marcado como cliente nao pode exportar valor de runtime lido no
// servidor -- da "React Client Manifest" e 500 em runtime com o build verde.
//
// TODAS as variaveis abaixo sao SERVER-ONLY: nenhuma leva o prefixo publico do
// Next. O motivo e o segredo do Web App de escrita -- se ele fosse exposto ao
// navegador, qualquer visitante conseguiria gravar na planilha do dono. O id da
// planilha acompanha o mesmo regime por coerencia (uma unica porta de entrada
// de configuracao, sempre no servidor).

/**
 * Planilha Base_Financeira_Operacao. Fica no codigo porque e o unico documento
 * que este produto le -- e nao um segredo: a leitura via gviz e publica.
 * Serve de fallback quando o deploy ainda nao definiu RARO_SHEETS_ID.
 */
export const SHEETS_ID_PADRAO = "14iCAiyR32q_zerKXqbrcLu8WkFFPn1m1gUf5eurtF-8";

/** Le string de ambiente tratando "definida porem vazia" como ausente. */
function env(nome: string): string | null {
  const bruto = process.env[nome];
  if (typeof bruto !== "string") return null;
  const limpo = bruto.trim();
  return limpo === "" ? null : limpo;
}

/** Id da planilha configurado no ambiente. `null` quando o deploy nao definiu. */
export function sheetsId(): string | null {
  return env("RARO_SHEETS_ID");
}

/** URL do Apps Script Web App que faz a ESCRITA (o gviz so le). */
export function sheetsWebAppUrl(): string | null {
  return env("RARO_SHEETS_WEBAPP_URL");
}

/** Segredo compartilhado com o Web App. Nunca pode chegar ao navegador. */
export function sheetsSegredo(): string | null {
  return env("RARO_SHEETS_SEGREDO");
}

/** Da para LER? Basta o id: o endpoint gviz nao pede autenticacao. */
export function sheetsConfigurado(): boolean {
  return sheetsId() !== null;
}

/** Da para ESCREVER? Precisa do trio: id, URL do Web App e segredo. */
export function sheetsEscritaConfigurada(): boolean {
  return sheetsId() !== null && sheetsWebAppUrl() !== null && sheetsSegredo() !== null;
}

/**
 * URL do endpoint publico gviz que devolve uma aba inteira em CSV.
 * `comCabecalho = false` e para abas de layout irregular (CONFIG), onde a
 * primeira linha nao e cabecalho e o gviz nao pode decidir isso por conta.
 * O nome da aba passa por encodeURIComponent porque ha abas com espaco e
 * acento -- sem isso a query quebra silenciosamente e volta HTML de erro.
 */
export function urlCsv(aba: string, comCabecalho = true): string {
  const id = sheetsId() ?? SHEETS_ID_PADRAO;
  const cabecalho = comCabecalho ? "1" : "0";
  return (
    `https://docs.google.com/spreadsheets/d/${id}/gviz/tq` +
    `?tqx=out:csv&sheet=${encodeURIComponent(aba)}&headers=${cabecalho}`
  );
}
