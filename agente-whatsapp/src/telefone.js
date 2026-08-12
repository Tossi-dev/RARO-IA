// Telefone brasileiro, do jeito que o WhatsApp entrega.
//
// POR QUE ESTE ARQUIVO REPETE REGRAS QUE JA EXISTEM NO CRM
// -------------------------------------------------------
// `src/lib/atendimento/telefone.ts` do Raro.ia tem as mesmas regras, e isso e
// duplicacao consciente: aquele arquivo e TypeScript dentro de um app Next que
// e compilado e publicado na Vercel; este programa e um processo separado, que
// roda no MacBook do dono, instalado por um duplo clique, sem build. Importar
// atravessando os dois mundos amarraria a instalacao do Mac ao ciclo de vida do
// site — e o dia em que o CRM trocasse de bundler seria o dia em que o WhatsApp
// dele pararia.
//
// A duplicacao e segura porque quem decide de quem e a mensagem e o SERVIDOR:
// aqui o telefone so precisa sair em formato que o servidor reconheca. Se as
// duas regras divergirem um dia, o servidor continua sendo o dono da verdade.

/** Só os dígitos: sem máscara, sem "+", sem espaço. */
function apenasDigitos(texto) {
  return String(texto ?? "").replace(/\D/g, "");
}

/**
 * Número pronto para o servidor: 55 + DDD + número, preservando o nono dígito
 * quando ele veio. Devolve "" quando não dá para afirmar que é telefone —
 * string vazia é "não sei", e é melhor que um número remendado que vai parar na
 * ficha da pessoa errada.
 */
export function normalizarTelefone(telefone) {
  let d = apenasDigitos(telefone);
  if (!d) return "";

  // Zero de operadora ou "011" digitado como DDD.
  d = d.replace(/^0+/, "");

  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return d;

  // Onze dígitos soltos são Brasil: o produto atende empresa brasileira, e
  // quem tem número de fora precisa vir com DDI (cai na regra seguinte).
  if (d.length === 10 || d.length === 11) return `55${d}`;

  // Número estrangeiro: passa como veio, porque nenhuma regra brasileira se
  // aplica a ele.
  //
  // O TETO É 13, E NÃO OS 15 DO E.164, POR CAUSA DO `@lid`
  // ------------------------------------------------------
  // O identificador interno do WhatsApp ("36533109289004") tem catorze
  // dígitos e cara de número internacional. Com o teto em 15 ele passava por
  // aqui e virava um cliente no CRM do dono — telefone que não disca, ficha
  // que não casa com ninguém, e uma nova a cada tentativa de gravar. Nenhum
  // país atribui número discável com mais de treze dígitos contando o DDI,
  // então catorze é identificador, não telefone.
  if (d.length >= 12 && d.length <= 13) return d;

  return "";
}

/**
 * O telefone de um identificador do WhatsApp ("5514991234567@c.us").
 *
 * Devolve "" para tudo que não é conversa com uma pessoa — e cada caso tem
 * motivo próprio:
 *
 *   · `@g.us`        grupo: a mensagem não pertence à ficha de nenhum cliente;
 *   · `@broadcast`   status/lista de transmissão: não é conversa;
 *   · `@newsletter`  canal: o dono é leitor, não há atendimento ali;
 *   · `@lid`         identidade anônima nova do WhatsApp, que NÃO carrega
 *                    telefone — inventar um número a partir dela criaria
 *                    cliente fantasma no CRM.
 */
export function telefoneDoJid(jid) {
  const bruto = String(jid ?? "");
  if (bruto === "") return "";
  if (
    bruto.includes("@g.us") ||
    bruto.includes("@broadcast") ||
    bruto.includes("@newsletter") ||
    bruto.includes("@lid")
  ) {
    return "";
  }
  const antes = bruto.split("@")[0] ?? "";
  // O WhatsApp às vezes acrescenta ":N" (número do aparelho) antes do @.
  return normalizarTelefone(antes.split(":")[0] ?? "");
}

/** O caminho inverso, para mandar mensagem em um número que veio da fila. */
export function jidDoTelefone(telefone) {
  const n = normalizarTelefone(telefone);
  return n ? `${n}@c.us` : "";
}
