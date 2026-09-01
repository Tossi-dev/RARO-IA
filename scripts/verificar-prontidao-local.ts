import { execFileSync } from "node:child_process";
import { auditoriaDeArquivosRastreados } from "../src/lib/operacao/prontidao-local";

// Não lê .env nem outro arquivo do projeto: pergunta ao Git somente pelos
// nomes rastreados e devolve nomes, nunca conteúdo ou variáveis.
const saida = execFileSync("git", ["ls-files"], { encoding: "utf8" });
const auditoria = auditoriaDeArquivosRastreados(saida.split(/\r?\n/));

if (auditoria.aprovado) {
  console.log("Prontidão local aprovada: nenhum segredo ou artefato gerado está rastreado.");
} else {
  console.error("Prontidão local bloqueada. Remova do índice os caminhos abaixo, sem abrir arquivos sensíveis:");
  for (const caminho of auditoria.segredos) console.error(`- segredo potencial: ${caminho}`);
  for (const caminho of auditoria.artefatos) console.error(`- artefato gerado: ${caminho}`);
  process.exitCode = 1;
}
