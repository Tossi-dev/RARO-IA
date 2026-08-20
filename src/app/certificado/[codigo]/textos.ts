// Os textos da página pública de certificado — módulo PURO, no mesmo molde de
// `src/app/(app)/mentoria/textos.ts`: a tela desenha, este arquivo escreve.
//
// Por que a formatação da data mora aqui e não em `lib/conteudo/certificado.ts`:
// aquele módulo tem um teste que proíbe `new Date` no fonte inteiro, porque o
// CÓDIGO do certificado não pode ser derivado de relógio nenhum (código
// derivado é código adivinhável). Formatar uma data que chega por parâmetro é
// outra pergunta, e ela é de tela.

/** Fuso do negócio. Um certificado emitido às 22h de São Paulo é do dia em
 *  São Paulo, não do dia seguinte em UTC — e a data impressa num documento
 *  não pode depender de onde o servidor está. */
const FUSO_BRASIL = "America/Sao_Paulo";

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/**
 * A data de um certificado, por extenso: "19 de agosto de 2026".
 *
 * Por extenso porque é um documento, e documento não escreve 08/19 nem
 * 19/08 — os dois se leem errado dependendo de quem lê, e a diferença entre
 * ler certo e errado, num certificado, é a diferença entre conferir e não
 * conferir.
 *
 * Entrada inválida devolve string vazia: a tela mostra o certificado sem a
 * linha da data, e não um "Invalid Date" impresso num documento.
 */
export function dataPorExtensoBr(iso: unknown): string {
  if (typeof iso !== "string" || iso.trim() === "") return "";
  const instante = new Date(iso);
  if (Number.isNaN(instante.getTime())) return "";

  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO_BRASIL,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(instante);

  const pegar = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  const dia = Number(pegar("day"));
  const mes = Number(pegar("month"));
  const ano = pegar("year");
  if (!dia || !mes || !ano) return "";

  return `${dia} de ${MESES[mes - 1]} de ${ano}`;
}
