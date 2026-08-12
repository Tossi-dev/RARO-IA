// Correspondência de telefone brasileiro — o alicerce do CRM automático.
//
// POR QUE ESTE ARQUIVO É O PRIMEIRO A EXISTIR
// -------------------------------------------
// Todo o resto depende de uma pergunta: "esta mensagem que chegou é de quem?".
// Se a resposta errar, a conversa vai para o cliente errado, ou pior, vira um
// lead novo em cima de um cliente que já existe — e o dono passa a ver duas
// fichas da mesma pessoa sem entender por quê. Isso não é bug que aparece:
// é bug que apodrece.
//
// O PROBLEMA DO NONO DÍGITO
// -------------------------
// O Brasil acrescentou um 9 na frente dos celulares. O resultado é que a MESMA
// pessoa aparece escrita de várias formas, dependendo de quem cadastrou e
// quando:
//
//   (14) 99123-4567        cadastrado à mão pelo dono
//   +55 14 99123-4567      copiado do contato do celular
//   5514991234567          como o WhatsApp entrega
//   551491234567           registro antigo, sem o nono dígito
//
// São quatro textos e uma pessoa só. Comparar string com string erra em três
// dos quatro casos. Por isso existe a CHAVE: uma forma canônica que todas as
// escritas colapsam, usada só para comparar — nunca para exibir nem para
// enviar mensagem.
//
// A REGRA DO 9, COM O CUIDADO QUE ELA EXIGE
// -----------------------------------------
// A chave descarta o 9 inicial do número local quando ele tem 9 dígitos. Só
// que fixo brasileiro tem 8 dígitos e começa com 2, 3, 4 ou 5 — celular começa
// com 6, 7, 8 ou 9. Descartar dígito de fixo transformaria dois fixos
// diferentes na mesma chave, então a regra só vale para o caso de 9 dígitos
// começando com 9. Fixo passa intacto.

/** Só os dígitos, sem DDI, sem máscara, sem zero de operadora. */
function apenasDigitos(texto: string): string {
  return String(texto ?? "").replace(/\D/g, "");
}

/**
 * Número completo, pronto para DISCAR ou abrir conversa: 55 + DDD + número,
 * preservando o nono dígito quando ele veio. Devolve "" quando não dá para
 * afirmar que é um telefone — string vazia é "não sei", e é melhor que um
 * número remendado.
 */
export function normalizarTelefone(telefone: string): string {
  let d = apenasDigitos(telefone);
  if (!d) return "";

  // "011" digitado como DDD, ou 0 de operadora na frente.
  d = d.replace(/^0+/, "");

  // Já veio com DDI do Brasil: 55 + 10 ou 11 dígitos.
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return d;

  // DDD + número, sem DDI.
  //
  // AMBIGUIDADE ASSUMIDA: onze dígitos soltos podem ser um celular brasileiro
  // com DDD (14 99123-4567) ou um número americano com código de área
  // (1 415 555-0101). Não há como distinguir sem contexto, e o contexto deste
  // produto é uma empresa brasileira atendendo clientes brasileiros — então
  // onze dígitos é Brasil. Quem tiver número de fora precisa cadastrar com o
  // DDI na frente, e aí cai na regra seguinte.
  if (d.length === 10 || d.length === 11) return `55${d}`;

  // Número com DDI de outro país. Passa como veio: nenhuma regra brasileira
  // se aplica a ele.
  //
  // POR QUE O TETO É 13 E NÃO 15, QUE É O DO E.164
  // ----------------------------------------------
  // Porque existe uma coisa com cara de telefone que não é telefone: o `@lid`
  // do WhatsApp. Desde 2025 o WhatsApp endereça conversa por um identificador
  // interno ("36533109289004@lid") — quatorze a dezessete dígitos, formato
  // idêntico ao de um número internacional. Com o teto em 15, esse
  // identificador virava "cliente estrangeiro": entrou no CRM do dono como
  // uma ficha chamada Tossi com telefone 36533109289004, que não disca, não
  // recebe mensagem e não casa com o cadastro real da pessoa.
  //
  // O E.164 permite 15 dígitos, mas nenhum país ATRIBUI número tão longo: o
  // maior número discável do mundo hoje tem 13 dígitos contando o DDI. Então
  // 14 dígitos não é um cliente de fora — é um identificador interno. Cortar
  // aqui devolve "" ("não sei"), e "não sei" faz a mensagem ser descartada em
  // vez de criar ficha falsa.
  if (d.length >= 12 && d.length <= 13) return d;

  // Curto demais: ramal, número incompleto ou lixo. Não inventamos DDI.
  return "";
}

/** As partes de um número brasileiro já normalizado. */
interface PartesBR {
  ddd: string;
  local: string;
}

function partesBrasil(numero: string): PartesBR | null {
  if (!numero.startsWith("55")) return null;
  const resto = numero.slice(2);
  if (resto.length !== 10 && resto.length !== 11) return null;
  return { ddd: resto.slice(0, 2), local: resto.slice(2) };
}

/**
 * A chave de correspondência. Duas escritas da mesma linha telefônica dão a
 * mesma chave; linhas diferentes nunca colidem.
 *
 * Use para COMPARAR e para indexar. Nunca para mostrar na tela nem para
 * enviar mensagem — para isso existe `normalizarTelefone`, que preserva o
 * número como ele é de verdade.
 */
export function chaveTelefone(telefone: string): string {
  const numero = normalizarTelefone(telefone);
  if (!numero) return "";

  const partes = partesBrasil(numero);
  if (!partes) return numero; // número estrangeiro: comparado como veio

  // Nono dígito fora da chave — e só dele, só quando é celular.
  const local =
    partes.local.length === 9 && partes.local.startsWith("9")
      ? partes.local.slice(1)
      : partes.local;

  return `55${partes.ddd}${local}`;
}

/** Os dois textos apontam para a mesma linha telefônica? */
export function mesmoTelefone(a: string, b: string): boolean {
  const ka = chaveTelefone(a);
  const kb = chaveTelefone(b);
  // Chave vazia é "não sei": duas ignorâncias não são uma igualdade.
  return ka !== "" && ka === kb;
}

/**
 * O identificador que o WhatsApp usa ("5514991234567@c.us" para pessoa,
 * "...@g.us" para grupo). Devolve o telefone; grupo devolve "" de propósito —
 * mensagem de grupo não pertence a um cliente e não pode virar interação na
 * ficha de ninguém.
 */
export function telefoneDoJid(jid: string): string {
  const bruto = String(jid ?? "");
  if (bruto.includes("@g.us")) return "";
  const antes = bruto.split("@")[0] ?? "";
  // O WhatsApp às vezes acrescenta ":N" (número do dispositivo) antes do @.
  return normalizarTelefone(antes.split(":")[0] ?? "");
}

/** O caminho inverso, para mandar mensagem por um número guardado no cadastro. */
export function jidDoTelefone(telefone: string): string {
  const n = normalizarTelefone(telefone);
  return n ? `${n}@c.us` : "";
}

/** Como mostrar na tela: (14) 99123-4567. Número estrangeiro sai como veio. */
export function formatarTelefone(telefone: string): string {
  const numero = normalizarTelefone(telefone);
  const partes = partesBrasil(numero);
  if (!partes) return numero || String(telefone ?? "");
  const { ddd, local } = partes;
  const meio = local.length === 9 ? local.slice(0, 5) : local.slice(0, 4);
  const fim = local.length === 9 ? local.slice(5) : local.slice(4);
  return `(${ddd}) ${meio}-${fim}`;
}

/**
 * Acha o cliente dono de um telefone dentro de uma lista já carregada.
 *
 * Recebe a lista pronta (e não vai ao banco) porque quem chama costuma ter
 * centenas de mensagens para casar de uma vez: uma consulta por mensagem
 * seria uma tempestade de leituras na planilha por nada.
 */
export function acharPorTelefone<T extends { telefone: string }>(
  pessoas: T[],
  telefone: string
): T | null {
  const chave = chaveTelefone(telefone);
  if (chave === "") return null;
  return pessoas.find((p) => chaveTelefone(p.telefone) === chave) ?? null;
}
