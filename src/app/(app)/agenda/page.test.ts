// Teste de TEXTO da tela /agenda — mesmo padrão de `privacidade/page.test.ts`
// e do teste de cabeçalho em `google-agenda-escrita.test.ts`: lê o arquivo cru
// e trava a frase. Renderizar esta página exigiria dublê de cookie, de fetch e
// de `next/headers` só para conferir uma frase — e a frase é o defeito.
//
// POR QUE ESTE ARQUIVO EXISTE (Tarefa 15, rodada 3): a Tarefa 15 fez o app
// pedir `calendar.events` (criar/atualizar/cancelar evento), corrigiu o
// comentário de `google-agenda.ts` e a política de privacidade — mas a MESMA
// frase falsa sobreviveu aqui, no pior lugar possível: a cinco linhas do
// `href="/api/agenda/google/entrar"`, que é o botão que leva à tela de
// consentimento do Google. A pessoa lia "a permissão pedida é somente leitura
// — o sistema não consegue criar, mover nem apagar compromisso nenhum" e a
// tela seguinte, a do Google, pedia permissão de criar, editar e apagar.
// Consentimento informado é o único tipo de consentimento que vale; texto de
// tela que mente sobre a permissão pedida invalida o consentimento inteiro.
//
// Os testes abaixo travam TRÊS coisas diferentes, de propósito:
//   1. as frases falsas específicas não voltam (nem com outra quebra de linha
//      — por isso todo o arquivo é normalizado antes de comparar);
//   2. a frase que fica ao lado do BOTÃO diz a verdade sobre a escrita;
//   3. qualquer promessa de "só leitura" que sobrar na página precisa estar
//      a poucos caracteres da palavra "iCal" — porque o caminho do iCal é o
//      único que continua sendo só leitura de verdade.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const CAMINHO_AGENDA = path.join(__dirname, "page.tsx");
const CAMINHO_INTEGRACOES = path.join(__dirname, "..", "integracoes", "page.tsx");

/** JSX quebra frase no meio da linha o tempo todo; comparar texto de tela sem
 *  normalizar espaço deixaria o teste passar só porque o Prettier moveu uma
 *  palavra de linha. */
function normalizar(caminho: string): string {
  return readFileSync(caminho, "utf-8").replace(/\s+/g, " ");
}

const agenda = normalizar(CAMINHO_AGENDA);

describe("tela /agenda — não promete mais 'somente leitura'", () => {
  it("declara a superfície de agenda para a interface de acompanhamento", () => {
    expect(agenda).toContain('data-agenda-workspace="true"');
    expect(agenda).toContain('data-agenda-event="true"');
  });

  it("nenhuma das frases falsas da versão anterior sobreviveu", () => {
    expect(agenda).not.toContain("somente leitura");
    expect(agenda).not.toContain("não consegue criar");
    expect(agenda).not.toContain("A leitura é só leitura");
    expect(agenda).not.toContain("a plataforma nunca escreve");
    expect(agenda).not.toContain("plataforma só lê, nunca escreve");
  });

  it("o texto que fica junto do botão de consentimento diz que o app também escreve", () => {
    // Recorte deliberado: o que importa não é a página ter em ALGUM lugar uma
    // frase verdadeira, é a frase que a pessoa lê ANTES de clicar no botão que
    // abre a tela do Google. Por isso a asserção é sobre o trecho que precede
    // o `href` do consentimento, e não sobre o arquivo inteiro.
    const posicaoDoBotao = agenda.indexOf('href="/api/agenda/google/entrar"');
    expect(posicaoDoBotao).toBeGreaterThan(-1);
    const antesDoBotao = agenda.slice(Math.max(0, posicaoDoBotao - 900), posicaoDoBotao);

    expect(antesDoBotao).toMatch(/escrita|escrever|escreve/i);
    expect(antesDoBotao).toMatch(/criar, atualizar e cancelar/i);
    expect(antesDoBotao).not.toMatch(/somente leitura|só leitura|apenas leitura/i);
  });

  it("promete o limite que o código impõe: só o evento das sessões sincronizadas", () => {
    // `atualizarEventoDaSessao`/`cancelarEventoDaSessao` conferem a marca de
    // origem antes de escrever (ver `google-agenda-escrita.ts`). A tela pode
    // dizer isso porque o código impõe — se um dia a conferência sair, este
    // teste continua verde, mas o de `google-agenda-escrita.test.ts` que exige
    // o GET antes do PATCH fica vermelho.
    expect(agenda).toMatch(/sess(ão|ões)/i);
    expect(agenda).toMatch(/sincroniz/i);
  });

  it("toda promessa de 'só leitura' que sobrou fala do caminho iCal, não da plataforma", () => {
    // Guarda generalizada: em vez de listar as frases proibidas de hoje,
    // exige que QUALQUER promessa de leitura-apenas esteja a poucos
    // caracteres da palavra "iCal" — o único caminho desta tela que de fato
    // não escreve nada (o endereço secreto é um GET num arquivo .ics).
    const promessa = /(só|somente|apenas)\s+(de\s+)?leitura|só permite leitura|só lê/gi;
    const achados: string[] = [];
    for (const m of agenda.matchAll(promessa)) {
      const i = m.index ?? 0;
      const vizinhanca = agenda.slice(Math.max(0, i - 200), i + 200);
      if (!/iCal/i.test(vizinhanca)) achados.push(vizinhanca);
    }
    expect(achados).toEqual([]);
  });
});

describe("tela /integracoes — a linha do Google Calendar diz de qual caminho fala", () => {
  it("não afirma 'só leitura' sem dizer que fala da conexão por variável de ambiente", () => {
    const integracoes = normalizar(CAMINHO_INTEGRACOES);
    // A frase antiga ("Criar reunião pelo app ainda não escreve no Google (só
    // leitura está ligada)") era verdadeira sobre a integração por
    // GOOGLE_REFRESH_TOKEN (`integracoes/calendar.ts`), mas ficava ao lado da
    // linha da agenda do Google e induzia a ler "este sistema não escreve na
    // sua agenda" — o que deixou de ser verdade no caminho do cookie.
    expect(integracoes).not.toContain("ainda não escreve no Google (só leitura está ligada)");
    const posicao = integracoes.indexOf('id: "calendar"');
    expect(posicao).toBeGreaterThan(-1);
    const bloco = integracoes.slice(posicao, posicao + 900);
    expect(bloco).toMatch(/GOOGLE_REFRESH_TOKEN|variável de ambiente/i);
  });
});
