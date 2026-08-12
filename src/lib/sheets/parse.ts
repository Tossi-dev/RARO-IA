// Conversores entre a celula da planilha (texto no formato brasileiro) e o
// tipo que o codigo usa -- e a volta, do codigo para a celula.
//
// MODULO NEUTRO (sem diretiva de cliente): funcoes puras usadas na leitura no
// servidor e na montagem do payload de escrita.
//
// Este e o arquivo onde integracao de planilha costuma mentir numero: se o
// separador decimal for lido errado, "1.234,56" vira 1,23456 ou 123456 e o
// painel exibe o valor errado SEM ERRO NENHUM. Por isso cada regra abaixo esta
// escrita explicitamente e coberta por teste.

/** Marcas de acentuacao combinantes (resultado do normalize NFD). */
const DIACRITICOS = /[\u0300-\u036f]/g;

/**
 * Minusculo, sem acento, espacos colapsados, sem sobra nas pontas.
 * Serve para casar o texto da celula com as listas da aba CONFIG: o dono digita
 * "Cartao de credito" numa aba e "cartão de crédito" na outra, e as duas
 * precisam cair no mesmo balde.
 */
export function normalizar(s: string): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(DIACRITICOS, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Texto da celula sem sobra nas pontas; ausente vira string vazia. */
export function lerTexto(v: string | undefined | null): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Decide qual caractere e o separador DECIMAL e devolve o numero em ponto
 * flutuante.
 *
 * DE ONDE VEM O TEXTO: a leitura usa `tqx=out:csv`, e esse endpoint NAO devolve
 * o numero cru da celula -- ele devolve o TEXTO JA FORMATADO, na localidade da
 * planilha. A planilha do dono e pt-BR: as celulas do bloco PARAMETROS (aba
 * CONFIG) voltaram literalmente como "6,0%" e "R$ 0,00". Ou seja, o separador
 * decimal e a VIRGULA e o separador de milhar e o PONTO. Ler ponto como decimal
 * por padrao (suposicao do endpoint JSON, que nao e o que usamos) transformava
 * "150.480" em 150,48 -- erro de MIL VEZES, silencioso, com o build verde.
 *
 * Heuristica, na ordem:
 *
 *  1. Tem VIRGULA -> a virgula e o decimal e TODO ponto e milhar.
 *     "1.234.567,89" -> 1234567.89; "1234,56" -> 1234.56.
 *  2. Sem virgula, com PONTO -> o ponto e MILHAR quando o desenho e de
 *     agrupamento: o primeiro grupo tem de 1 a 3 digitos e TODOS os grupos
 *     seguintes tem exatamente 3. "1.234" -> 1234; "150.480" -> 150480;
 *     "1.234.567" -> 1234567. Fora disso o ponto e decimal: "1234.56" -> 1234.56;
 *     "1.5" -> 1.5; "0.06" -> 0.06.
 *  3. Sem ponto e sem virgula -> inteiro direto.
 *
 * A AMBIGUIDADE DE "1.234" FOI RESOLVIDA A FAVOR DE MIL DUZENTOS E TRINTA E
 * QUATRO. Ela e mesmo ambigua isoladamente, mas a origem nao e: a planilha e
 * pt-BR e o gviz devolve texto formatado -- a prova esta no "R$ 0,00" e no
 * "6,0%" que a propria planilha devolveu. Num numero formatado em pt-BR, um
 * ponto seguido de exatamente tres digitos e agrupamento de milhar; ler 1,234
 * ali erraria por mil em todo investimento de midia e todo valor de venda de
 * quatro digitos. Quem quiser decimal escreve "1,234", que a regra 1 pega.
 *
 * Alem disso: aceita simbolo de moeda e espacos; trata parenteses como negativo
 * (padrao contabil) SO quando eles envolvem o valor inteiro -- "(1.234,56)" e
 * -1234,56, mas "Venda (parcelada) 100" e +100; e so conta o sinal `-` que
 * aparece antes do primeiro digito ("-R$ 50,00" -> -50), nunca um traco depois
 * do numero. Vazio, nulo ou sem digito nenhum -> 0.
 */
export function lerNumero(v: string | undefined | null): number {
  const bruto = lerTexto(v);
  if (bruto === "") return 0;

  // Parentese so e sinal contabil quando ENVOLVE o valor inteiro. Aceitar
  // qualquer parentese fazia "Venda (parcelada) 100" virar -100: o texto ao
  // redor do numero nao pode inverter o sinal do numero.
  const semEspacos = bruto.replace(/\s+/g, "");
  const negativoPorParenteses = semEspacos.startsWith("(") && semEspacos.endsWith(")");
  // so conta o sinal que vem ANTES do primeiro digito ("-R$ 50,00", "R$ -50,00").
  // Um traco depois do numero costuma ser separador de anotacao, nao sinal.
  const negativoPorSinal = /^[^0-9]*-/.test(bruto);

  // sobra so o que pode compor o numero: digitos e os dois separadores
  let limpo = bruto.replace(/[^0-9.,]/g, "");
  if (!/[0-9]/.test(limpo)) return 0;

  if (limpo.includes(",")) {
    // Regra 1: virgula manda. Os pontos sao agrupamento e simplesmente somem.
    // A ultima virgula e a decimal -- havendo mais de uma, as outras sao ruido
    // de digitacao e valem como agrupamento tambem.
    const semPontos = limpo.replace(/\./g, "");
    const corte = semPontos.lastIndexOf(",");
    limpo = `${semPontos.slice(0, corte).replace(/,/g, "")}.${semPontos.slice(corte + 1)}`;
  } else if (limpo.includes(".")) {
    // Regra 2: ponto e milhar so quando o desenho e de agrupamento.
    const grupos = limpo.split(".");
    const primeiro = grupos[0];
    const agrupamento =
      primeiro.length >= 1 &&
      primeiro.length <= 3 &&
      grupos.slice(1).every((g) => g.length === 3);
    limpo = agrupamento
      ? grupos.join("")
      : // mantem apenas o ultimo ponto como decimal
        `${grupos.slice(0, -1).join("")}.${grupos[grupos.length - 1]}`;
  }

  const n = Number(limpo);
  if (!Number.isFinite(n)) return 0;
  return negativoPorParenteses || negativoPorSinal ? -Math.abs(n) : n;
}

/**
 * Igual a `lerNumero`, porem distingue "celula vazia" de "celula com zero".
 * Existe porque em campo opcional (saldo inicial, meta) zero e uma afirmacao e
 * vazio e ausencia de informacao -- tratar os dois como 0 apaga essa diferenca.
 */
export function lerNumeroOuNulo(v: string | undefined | null): number | null {
  const bruto = lerTexto(v);
  if (bruto === "" || !/[0-9]/.test(bruto)) return null;
  return lerNumero(bruto);
}

/**
 * Percentual SEMPRE em PONTOS PERCENTUAIS, igual ao resto do projeto
 * (`fmtPct` e `formatarValor` recebem 18.4 para exibir "18,4%").
 *
 * A planilha grava a aliquota como `6,0%` e o gviz devolve o TEXTO FORMATADO --
 * por isso basta remover o simbolo e ler o numero. Nao ha adivinhacao de
 * fracao: se algum dia a celula vier como `0.06`, o resultado sera 0,06 e o
 * painel mostrara "0,1%", que e um erro VISIVEL. Converter fracao em pontos por
 * heuristica transformaria isso num erro silencioso -- e uma aliquota de 6% que
 * vira 600% (ou 0,06%) sem ninguem perceber e pior que uma que aparece torta.
 */
export function lerPercentual(v: string | undefined | null): number {
  return lerNumero(lerTexto(v).replace(/%/g, ""));
}

/** Confere se ano/mes/dia formam data real (rejeita 31/02) e devolve o ISO. */
function iso(ano: number, mes: number, dia: number): string {
  if (!Number.isInteger(ano) || !Number.isInteger(mes) || !Number.isInteger(dia)) return "";
  if (ano < 1000 || ano > 9999 || mes < 1 || mes > 12 || dia < 1 || dia > 31) return "";
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return "";
  return `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Ano de dois digitos: "26" -> 2026. A planilha nao tem dado do seculo XX. */
function anoCompleto(n: number): number {
  return n < 100 ? 2000 + n : n;
}

/**
 * Data SEMPRE em ISO "aaaa-mm-dd". Formatos aceitos:
 *  - "31/12/2026" e "31/12/26" (o que o dono digita)
 *  - "2026-12-31" e "2026-12-31T00:00:00Z" (ISO, com ou sem hora)
 *  - "Date(2026,11,31)" -- DEFESA, nao o caminho usual. Esse e o formato do
 *    endpoint JSON do gviz; com `tqx=out:csv`, que e o que a leitura usa, a data
 *    chega ja formatada ("31/12/2026") e este ramo nunca dispara. Ele fica de
 *    proposito: custa um regex e cobre a troca de endpoint sem virar bug de data.
 *    ATENCAO: o MES do gviz e BASE ZERO, entao 11 e dezembro. Somar 1 aqui e a
 *    diferenca entre fechar o mes certo e jogar a venda para o mes seguinte.
 *
 * Data invalida devolve "" -- nunca "Invalid Date" e nunca a data de hoje.
 * Cair no dia de hoje seria o pior desfecho possivel: o registro entraria no
 * periodo corrente e sujaria o fechamento sem deixar rastro.
 */
export function lerData(v: string | undefined | null): string {
  const bruto = lerTexto(v);
  if (bruto === "") return "";

  const gviz = bruto.match(/^Date\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*[,)]/i);
  if (gviz) return iso(Number(gviz[1]), Number(gviz[2]) + 1, Number(gviz[3]));

  // corta hora: "31/12/2026 14:32" e "2026-12-31T00:00:00Z"
  const soData = bruto.split(/[T\s]/)[0];

  const barra = soData.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (barra) return iso(anoCompleto(Number(barra[3])), Number(barra[2]), Number(barra[1]));

  const traco = soData.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (traco) return iso(Number(traco[1]), Number(traco[2]), Number(traco[3]));

  return "";
}

/** Igual a `lerData`, porem devolve `null` no lugar de "" (campo opcional). */
export function lerDataOuNulo(v: string | undefined | null): string | null {
  return lerData(v) || null;
}

/** Aceita as varias formas de "sim" que aparecem em coluna Ativo/Ativa. */
const VERDADEIROS = new Set(["sim", "s", "true", "verdadeiro", "v", "1", "x", "ok"]);

/** Qualquer coisa fora da lista de verdadeiros e falso -- inclusive vazio. */
export function lerBooleano(v: string | undefined | null): boolean {
  return VERDADEIROS.has(normalizar(lerTexto(v)));
}

/**
 * Numero no formato que vai PARA a celula: decimal com virgula, sem separador
 * de milhar e sem simbolo de moeda. Mandar "R$ 1.234,56" faria a planilha
 * guardar TEXTO, e a formula do Tossi somaria zero em cima de texto.
 * Valor nao finito vira "0" -- celula numerica nao aceita NaN.
 *
 * ESTA FUNCAO E PARA TEXTO DE APRESENTACAO, nao para gravar dinheiro. Valor
 * monetario vai para a planilha como `number` cru pelo mapeamento (`mapear.ts`),
 * que e o unico caminho seguro.
 *
 * O arredondamento para 2 casas nao e cosmetico: o `paraNumero` do
 * raro-sync.gs so reconhece virgula decimal com UMA ou DUAS casas, entao
 * "1234,567" seria lido la como separador de milhar e viraria 1234567 -- mil
 * vezes o valor certo. Cortar a terceira casa aqui fecha essa porta.
 */
export function escreverNumero(n: number): string {
  if (!Number.isFinite(n)) return "0";
  // `+(...)` derruba o "-0" e as casas decimais sobrando de "10.00".
  return String(+n.toFixed(2)).replace(".", ",");
}

/** Data ISO -> "dd/mm/aaaa", que e como a planilha reconhece data pt-BR. */
export function escreverData(iso: string): string {
  const normalizada = lerData(iso);
  if (normalizada === "") return "";
  const [ano, mes, dia] = normalizada.split("-");
  return `${dia}/${mes}/${ano}`;
}
