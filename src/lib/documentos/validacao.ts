// Validação de arquivo antes de qualquer upload — módulo PURO: nada de Next,
// nada de Supabase, nada de `Date.now()`. Mesma razão de sempre para isolar
// isto da Server Action (ver `src/lib/mentoria/validacao.ts`): 1) regra pura
// testa em milissegundos, sem dublê nenhum; 2) a ação que sobe o arquivo fica
// fina, só orquestra.
//
// POR QUE ESTE ARQUIVO EXISTE, EM UMA FRASE POR FUNÇÃO
// ----------------------------------------------------
// `nomeSeguro` — o nome do arquivo vem do computador de quem envia e é
// atacante em potencial mesmo sem ninguém mal-intencionado no meio: um
// navegador que mande `../../etc/passwd`, ou um `\` de caminho do Windows,
// vira PASTA dentro do bucket quando concatenado numa chave de Storage. É a
// mesma família de guardas de `travessiaSuspeita` em `src/lib/papeis.ts`
// (`%`, `\`, `;`, `..`) e pelo mesmo motivo declarado lá: quando o texto não
// pode ser lido sem ambiguidade, ele não é decodificado e comparado de novo
// — decodificar poderia, ele mesmo, introduzir outra ambiguidade (dupla
// codificação). Aqui a diferença é que o resultado não é sim/não, é o nome
// SANEADO; quando não sobra nada utilizável, devolve string vazia — recusa,
// nunca um nome inventado (a casa não inventa dado).
//
// `tipoPermitido` — lista fechada de sete formatos E concordância entre o
// `mime` declarado e a extensão do nome. Os dois lados são declarados pelo
// cliente e nenhum deles é prova de nada sozinho; exigir que CONCORDEM é o
// que fecha o truque clássico de mandar `application/pdf` num `.exe` (ou o
// contrário) e depender de qual dos dois o próximo programa da cadeia vai
// acreditar. `.svg` fica de fora de propósito, mesmo sendo imagem: SVG é XML
// e carrega `<script>`, então servi-lo de volta do Storage é XSS no domínio
// de quem abrir.
//
// `tamanhoPermitido` — corte em 10 MB. O limite foi escolhido para caber no
// plano gratuito de 1 GB do Storage com folga (uns cem documentos no pior
// caso, e o caso real é PDF de contrato com centenas de KB). 0 byte é recusa
// porque arquivo vazio não é documento, é upload que falhou no meio — e a
// coluna `bytes` do 0015 tem `check (bytes > 0)` dizendo a mesma coisa do
// lado do banco.
//
// `chaveDeStorage` — monta `<workspace_id>/<categoria>/<identificador>/<arquivo>`,
// no formato que a migração `supabase/migrations/0015_documento.sql` exige:
// `storage.objects` não tem coluna `workspace_id`, então é a PRIMEIRA PASTA da
// chave que toda política do bucket confere, e a CHECK
// `documento_caminho_no_workspace` obriga a linha da tabela a apontar para a
// pasta do próprio inquilino. Uma chave que comece com `/` ou que contenha
// `..` quebra as duas coisas de uma vez, então a função prefere devolver vazio
// (recusa) a devolver um caminho que ela não consegue garantir.
//
// O `identificador` (o uuid do documento) é a pasta que garante UNICIDADE, e
// ele não é enfeite: sem ele a chave era só `<workspace>/<categoria>/<arquivo>`
// e duas anamneses chamadas `anamnese.pdf`, de mentorados diferentes do mesmo
// workspace, nasciam no MESMO objeto. O upload do Storage é upsert, então o
// segundo sobrescreve o arquivo do primeiro; a linha do primeiro segue
// publicada apontando para aquele caminho, e a política de leitura do 0015 —
// que casa objeto com linha por igualdade de texto — confere corretamente que
// a linha é do primeiro mentorado e entrega a ele o arquivo clínico do
// segundo, sem erro em tela nenhuma. O saneamento do nome ainda AUMENTAVA a
// chance disso ("Contrato Jefson.pdf" e "Contrato;Jefson.pdf" viram o mesmo
// nome seguro). Como o módulo é puro, o uuid não é sorteado aqui: quem chama
// gera e passa — e é o mesmo valor que vai para `documento.id`.
//
// `workspaceId` e `identificador` são CONFERIDOS contra o formato uuid, não
// saneados. As duas colunas são `uuid` no 0015; sanear um id torto produziria
// uma chave bem-formada apontando para uma pasta que não é de ninguém, e o
// erro só apareceria depois, no banco, como violação genérica de CHECK.

// ============================================================
// Categoria — espelha o enum `categoria_documento` do 0015
// ============================================================

export type CategoriaDocumento = "contrato" | "anamnese" | "material" | "outro";

/** Ordem e valores idênticos a `create type categoria_documento` no 0015. */
export const CATEGORIA_DOCUMENTO_VALORES: readonly CategoriaDocumento[] = [
  "contrato",
  "anamnese",
  "material",
  "outro",
];

// ============================================================
// nomeSeguro
// ============================================================

/**
 * Teto de tamanho do nome. Não é regra de segurança, é de compatibilidade: a
 * chave inteira (`workspace/categoria/arquivo`) precisa caber com folga no
 * limite de nome de objeto do Storage, e um nome de 500 caracteres vindo de
 * um "salvar como" descuidado estouraria isso sem nenhum aviso legível.
 */
const LIMITE_NOME = 120;

/**
 * Nome de arquivo seguro para virar pedaço de chave de Storage.
 *
 * Devolve `""` quando não sobra nada utilizável — quem chama trata isso como
 * recusa. A alternativa (inventar `"arquivo.pdf"`) esconderia de quem enviou
 * que o nome dele foi jogado fora.
 */
export function nomeSeguro(nome: string): string {
  const bruto = typeof nome === "string" ? nome.trim() : "";
  if (bruto === "") return "";

  // 1) Fica só o último segmento: `/` e `\` contam como separador aqui,
  //    porque o nome pode ter vindo de um Windows. "../../etc/passwd" perde
  //    as pastas e sobra "passwd"; "a/b/" não tem nome nenhum e sobra "".
  const segmentos = bruto.split(/[/\\]/);
  const ultimo = segmentos[segmentos.length - 1] ?? "";

  // 2) Acento fora ANTES do filtro de caracteres. Não é preciosismo de
  //    ASCII: o mesmo "ção" pode chegar em NFC ou NFD dependendo do sistema
  //    de quem enviou, e as duas formas são bytes DIFERENTES. Se a chave
  //    gravada em `documento.caminho_storage` sair numa forma e o objeto do
  //    bucket na outra, a política de leitura do mentorado — que casa objeto
  //    com linha por igualdade de texto — nunca mais bate, e o arquivo fica
  //    invisível sem nenhum erro na tela.
  const semAcento = ultimo.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // 3) Lista de PERMITIDOS, não de proibidos: letra, número, ponto, hífen e
  //    sublinhado passam; todo o resto (`%`, `;`, aspas, espaço, controle,
  //    dois-pontos, `*`, `?`, `|`, o que mais aparecer) vira hífen. Bloquear
  //    por lista de proibidos exigiria acertar o conjunto inteiro na primeira
  //    tentativa — e o custo de errar é caminho de arquivo, não cosmético.
  //    `%` NÃO é decodificado antes, de propósito: "x%2fy" vira "x-2fy", não
  //    "x/y" (a mesma decisão de `travessiaSuspeita`).
  const filtrado = semAcento.replace(/[^A-Za-z0-9._-]/g, "-").replace(/-{2,}/g, "-");

  // 4) Ponto repetido colapsa em um só: é isto que faz `..` deixar de existir
  //    em qualquer posição, inclusive no meio ("a..b" vira "a.b").
  const semPontoDuplo = filtrado.replace(/\.{2,}/g, ".");

  // 5) Ponto ou hífen sobrando nas pontas viram nada: nome começando com
  //    ponto é arquivo oculto, e terminando com ponto é nome inválido em
  //    boa parte dos sistemas de arquivo.
  const aparado = semPontoDuplo.replace(/^[.-]+/, "").replace(/[.-]+$/, "");
  if (aparado === "") return "";

  if (aparado.length <= LIMITE_NOME) return aparado;

  // 6) Corte preservando a extensão — cortar pelo fim jogaria fora justamente
  //    o pedaço que `tipoPermitido` usa para decidir.
  const posicaoPonto = aparado.lastIndexOf(".");
  const extensao = posicaoPonto > 0 ? aparado.slice(posicaoPonto) : "";
  const base = posicaoPonto > 0 ? aparado.slice(0, posicaoPonto) : aparado;
  const cortado = base.slice(0, Math.max(1, LIMITE_NOME - extensao.length)) + extensao;
  return cortado.replace(/[.-]+$/, "");
}

// ============================================================
// tipoPermitido
// ============================================================

/**
 * Os sete formatos aceitos, cada mime com as extensões que PODEM acompanhá-lo.
 *
 * `.jpeg` está junto de `.jpg` porque é o mesmo formato, com o mesmo mime e os
 * mesmos bytes iniciais — separá-los não acrescentaria segurança nenhuma e
 * recusaria metade do que sai de câmera e de celular. Já `.exe`, `.sh` e
 * `.svg` não aparecem em lugar nenhum desta tabela, e é assim que são
 * recusados: o padrão aqui é NEGAR, então basta não estar na lista.
 */
const TIPOS_PERMITIDOS: Readonly<Record<string, readonly string[]>> = {
  "application/pdf": ["pdf"],
  "image/png": ["png"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/webp": ["webp"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "text/csv": ["csv"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
};

/**
 * Extensão do nome, já saneada e em minúsculas. `""` quando não há extensão
 * — e sem extensão o arquivo é recusado, porque não há como confrontar com o
 * mime declarado.
 */
function extensaoDe(nome: string): string {
  const seguro = nomeSeguro(nome);
  const posicao = seguro.lastIndexOf(".");
  // `posicao <= 0` cobre "sem ponto" e "ponto na primeira casa" (que
  // `nomeSeguro` já não produz, mas a checagem não custa nada).
  if (posicao <= 0) return "";
  return seguro.slice(posicao + 1).toLowerCase();
}

/** O par (mime declarado, extensão do nome) está na lista E concorda entre si? */
export function tipoPermitido(mime: string, nome: string): boolean {
  // `text/csv; charset=utf-8` é um mime válido: o parâmetro depois do `;` não
  // muda o tipo, então ele é descartado antes da comparação.
  const tipo = (typeof mime === "string" ? mime : "").split(";")[0].trim().toLowerCase();
  if (tipo === "") return false;

  // `hasOwnProperty` em vez de indexar direto: o `mime` vem do cliente, e
  // `"__proto__"`, `"constructor"` ou `"toString"` achariam uma propriedade
  // HERDADA de `Object.prototype` — um valor truthy que não é lista de
  // extensões, e a comparação seguinte lançaria TypeError. Numa Server Action
  // isso vira 500 com stack; a regra da casa é fail-closed, não fail-throw.
  if (!Object.prototype.hasOwnProperty.call(TIPOS_PERMITIDOS, tipo)) return false;
  const extensoes = TIPOS_PERMITIDOS[tipo];
  if (!extensoes) return false;

  const extensao = extensaoDe(nome);
  if (extensao === "") return false;

  return extensoes.includes(extensao);
}

// ============================================================
// tamanhoPermitido
// ============================================================

/** 10 MB em bytes. Exportado porque a tela precisa dizer o limite em números. */
export const LIMITE_BYTES = 10 * 1024 * 1024;

/** Entre 1 byte e 10 MB, inclusive nas duas pontas. */
export function tamanhoPermitido(bytes: number): boolean {
  // `Number.isInteger` já derruba `NaN`, `Infinity` e quebrado — contagem de
  // byte não tem casa decimal, e um valor desses aqui significa que quem
  // chamou leu o tamanho errado, não que o arquivo é grande.
  if (!Number.isInteger(bytes)) return false;
  return bytes > 0 && bytes <= LIMITE_BYTES;
}

// ============================================================
// chaveDeStorage
// ============================================================

/**
 * Formato de uuid como o Postgres aceita — só o desenho, sem exigir versão:
 * o workspace semente do 0006 é `00000000-0000-0000-0000-000000000001`, que
 * não tem nibble de versão nenhum e mesmo assim é o uuid real da coluna.
 */
const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `<workspace_id>/<categoria>/<identificador>/<arquivo>` — o formato que o
 * 0015 exige, com a pasta do documento garantindo que dois arquivos de mesmo
 * nome nunca ocupem o mesmo objeto.
 *
 * Devolve `""` quando qualquer uma das quatro partes não sobrevive à
 * conferência. Fail-closed pelo mesmo motivo do resto da casa: uma chave
 * parcial ("//a.pdf", "ws/../a.pdf") não seria recusada pelo Storage, seria
 * ACEITA apontando para outro lugar — e aí o arquivo de um inquilino nasce
 * na pasta de outro.
 *
 * @param identificador uuid do documento, gerado por quem chama (o mesmo que
 * vai para `documento.id`). É o que separa dois `anamnese.pdf` de mentorados
 * diferentes; sem ele o segundo upload sobrescreveria o primeiro.
 */
export function chaveDeStorage(
  workspaceId: string,
  categoria: CategoriaDocumento,
  nome: string,
  identificador: string
): string {
  // Workspace e identificador são conferidos, não saneados — ver o cabeçalho:
  // id torto tem que virar recusa aqui na borda, não pasta plausível.
  const pastaWorkspace = typeof workspaceId === "string" ? workspaceId.trim().toLowerCase() : "";
  if (!FORMATO_UUID.test(pastaWorkspace)) return "";

  const pastaDocumento = typeof identificador === "string" ? identificador.trim().toLowerCase() : "";
  if (!FORMATO_UUID.test(pastaDocumento)) return "";

  // Categoria não é saneada, é CONFERIDA contra o enum: qualquer valor fora
  // dos quatro viraria uma pasta que nenhuma tela lista e nenhum filtro
  // encontra.
  if (!CATEGORIA_DOCUMENTO_VALORES.includes(categoria)) return "";

  const arquivo = nomeSeguro(nome);
  if (arquivo === "") return "";

  return `${pastaWorkspace}/${categoria}/${pastaDocumento}/${arquivo}`;
}
