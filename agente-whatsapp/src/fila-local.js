// A fila que sobrevive a queda de internet e ao fechamento da tampa.
//
// POR QUE EM DISCO, E NAO EM MEMORIA
// ----------------------------------
// A regra do produto e "nunca perder mensagem por falha de rede". Fila em
// memoria cumpre isso enquanto o processo vive — e este processo morre o tempo
// todo, porque ele morre junto com o notebook fechando. Mensagem que chegou as
// 18h59, com o wi-fi fora, e o notebook fechado as 19h, precisa subir amanha.
// Entao a fila e um arquivo.
//
// POR QUE A ESCRITA E EM DOIS PASSOS
// ----------------------------------
// Escrever direto por cima do arquivo tem um instante em que ele esta pela
// metade. Se a maquina hibernar exatamente ali, o arquivo volta corrompido e a
// fila inteira se perde — que e o unico jeito de este programa perder mensagem.
// Por isso: grava num temporario, depois renomeia. Renomear no mesmo disco e
// atomico: ou o arquivo antigo esta inteiro, ou o novo esta inteiro.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Teto de itens guardados. Existe porque um erro de configuração (URL errada,
 * segredo trocado) faz a fila crescer para sempre, e um arquivo de gigabytes no
 * Mac do dono é um problema pior que o original.
 *
 * Quando estoura, o descarte é pelo MAIS ANTIGO: com o histórico já defasado, a
 * conversa de hoje vale mais para o CRM que a de duas semanas atrás.
 */
export const LIMITE_PADRAO_FILA = 5000;

export class FilaLocal {
  /**
   * `chaveDe` é o que impede a mesma mensagem de entrar duas vezes quando o
   * agente reconecta e varre o histórico de novo. O servidor também deduplica,
   * mas deixar a duplicata chegar até lá gastaria a rede do dono à toa.
   */
  constructor({ caminho, limite = LIMITE_PADRAO_FILA, chaveDe }) {
    this.caminho = caminho;
    this.limite = limite;
    this.chaveDe = chaveDe ?? ((item) => JSON.stringify(item));
    this.itens = [];
    this.carregada = false;
  }

  /**
   * Lê o arquivo. Arquivo ausente é o estado normal da primeira execução, e
   * arquivo ilegível é tratado como vazio de propósito: começar do zero é ruim,
   * mas um agente que se recusa a subir por causa de um byte torto é pior — ele
   * para de capturar TUDO, inclusive o que ainda nem aconteceu.
   */
  async carregar() {
    try {
      const cru = await readFile(this.caminho, "utf8");
      const lido = JSON.parse(cru);
      this.itens = Array.isArray(lido) ? lido : [];
    } catch {
      this.itens = [];
    }
    this.carregada = true;
    return this.itens.length;
  }

  get tamanho() {
    return this.itens.length;
  }

  /** Os `n` primeiros, sem tirar da fila: só saem depois que o servidor
   *  confirmar que recebeu. */
  espiar(n) {
    return this.itens.slice(0, Math.max(0, n));
  }

  /**
   * Acrescenta e persiste. Devolve quantos entraram de fato — o que já estava
   * na fila é ignorado em silêncio.
   */
  async adicionar(novos) {
    if (!this.carregada) await this.carregar();

    const conhecidas = new Set(this.itens.map((i) => this.chaveDe(i)));
    let entraram = 0;
    for (const item of Array.isArray(novos) ? novos : [novos]) {
      if (item === undefined || item === null) continue;
      const chave = this.chaveDe(item);
      if (conhecidas.has(chave)) continue;
      conhecidas.add(chave);
      this.itens.push(item);
      entraram += 1;
    }

    const excedente = this.itens.length - this.limite;
    let descartados = 0;
    if (excedente > 0) {
      this.itens.splice(0, excedente);
      descartados = excedente;
    }

    await this.gravar();
    return { entraram, descartados };
  }

  /** Tira da fila o que o servidor já confirmou. */
  async remover(itensOuChaves) {
    if (!this.carregada) await this.carregar();
    const alvo = new Set(
      (Array.isArray(itensOuChaves) ? itensOuChaves : [itensOuChaves]).map((i) =>
        typeof i === "string" ? i : this.chaveDe(i)
      )
    );
    const antes = this.itens.length;
    this.itens = this.itens.filter((i) => !alvo.has(this.chaveDe(i)));
    await this.gravar();
    return antes - this.itens.length;
  }

  async gravar() {
    await mkdir(dirname(this.caminho), { recursive: true });
    const temporario = `${this.caminho}.tmp`;
    await writeFile(temporario, JSON.stringify(this.itens), "utf8");
    await rename(temporario, this.caminho);
  }
}
