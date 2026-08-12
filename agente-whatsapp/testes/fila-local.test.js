// O que estes testes protegem: a promessa "nunca perde mensagem por falha de
// rede". A fila usa disco de verdade aqui (pasta temporária) e não um disco de
// mentira, porque o que se quer provar é justamente que o dado sobrevive ao
// processo morrer — e processo de mentira não morre.

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FilaLocal } from "../src/fila-local.js";

let pasta;
let caminho;
/** O mesmo arquivo, mas na raiz da pasta temporária (sem o subdiretório).
 *  Montado com `join` e não com troca de texto: no Windows o separador é "\\"
 *  e um `replace("/sub/", "/")` não encontrava nada — o teste tentava escrever
 *  dentro de uma pasta que não existe e quebrava só naquele sistema. */
let caminhoNaRaiz;

beforeEach(async () => {
  pasta = await mkdtemp(join(tmpdir(), "raro-fila-"));
  caminho = join(pasta, "sub", "fila.json");
  caminhoNaRaiz = join(pasta, "fila.json");
});

afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});

function novaFila(extra = {}) {
  return new FilaLocal({ caminho, chaveDe: (m) => `${m.idExterno}|${m.direcao}`, ...extra });
}

describe("FilaLocal", () => {
  it("guarda em disco e outro processo lê de volta", async () => {
    const fila = novaFila();
    await fila.adicionar([{ idExterno: "A", direcao: "recebida", texto: "oi" }]);

    // Instância nova = processo novo depois de o notebook fechar.
    const depoisDoReinicio = novaFila();
    await depoisDoReinicio.carregar();
    expect(depoisDoReinicio.tamanho).toBe(1);
    expect(depoisDoReinicio.espiar(10)[0].texto).toBe("oi");
  });

  it("cria a pasta sozinha na primeira execução", async () => {
    const fila = novaFila();
    await fila.adicionar([{ idExterno: "A", direcao: "recebida" }]);
    expect(JSON.parse(await readFile(caminho, "utf8"))).toHaveLength(1);
  });

  it("não guarda a mesma mensagem duas vezes", async () => {
    const fila = novaFila();
    const m = { idExterno: "A", direcao: "recebida" };
    expect((await fila.adicionar([m])).entraram).toBe(1);
    expect((await fila.adicionar([m])).entraram).toBe(0);
    expect(fila.tamanho).toBe(1);
  });

  it("separa as duas direções da mesma mensagem", async () => {
    const fila = novaFila();
    await fila.adicionar([
      { idExterno: "A", direcao: "recebida" },
      { idExterno: "A", direcao: "enviada" },
    ]);
    expect(fila.tamanho).toBe(2);
  });

  it("só tira da fila o que foi confirmado, mantendo o resto", async () => {
    const fila = novaFila();
    await fila.adicionar([
      { idExterno: "A", direcao: "recebida" },
      { idExterno: "B", direcao: "recebida" },
      { idExterno: "C", direcao: "recebida" },
    ]);

    const lote = fila.espiar(2);
    expect(await fila.remover(lote)).toBe(2);
    expect(fila.tamanho).toBe(1);
    expect(fila.espiar(10)[0].idExterno).toBe("C");
  });

  it("espiar não tira nada: item só sai depois da confirmação", async () => {
    const fila = novaFila();
    await fila.adicionar([{ idExterno: "A", direcao: "recebida" }]);
    fila.espiar(10);
    fila.espiar(10);
    expect(fila.tamanho).toBe(1);
  });

  it("no estouro do limite, descarta o mais antigo e avisa quantos", async () => {
    const fila = novaFila({ limite: 3 });
    await fila.adicionar([
      { idExterno: "A", direcao: "recebida" },
      { idExterno: "B", direcao: "recebida" },
    ]);
    const r = await fila.adicionar([
      { idExterno: "C", direcao: "recebida" },
      { idExterno: "D", direcao: "recebida" },
    ]);

    expect(r.descartados).toBe(1);
    expect(fila.espiar(10).map((m) => m.idExterno)).toEqual(["B", "C", "D"]);
  });

  it("arquivo corrompido não impede o agente de subir", async () => {
    await writeFile(caminhoNaRaiz, "x");
    const fila = novaFila({ caminho: caminhoNaRaiz });
    expect(await fila.carregar()).toBe(0);
    // E continua funcionando a partir dali, em vez de travar para sempre.
    await fila.adicionar([{ idExterno: "A", direcao: "recebida" }]);
    expect(fila.tamanho).toBe(1);
  });

  it("a gravação passa por arquivo temporário e não deixa sujeira", async () => {
    const fila = novaFila();
    await fila.adicionar([{ idExterno: "A", direcao: "recebida" }]);
    await expect(readFile(`${caminho}.tmp`, "utf8")).rejects.toThrow();
  });
});
