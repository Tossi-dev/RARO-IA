// Teste de TEXTO da política de privacidade — mesmo padrão do teste de
// cabeçalho em `google-agenda-escrita.test.ts`: lê o arquivo cru e trava a
// frase, em vez de renderizar a página (a política é texto jurídico para
// humano lê, não comportamento de componente).
//
// POR QUE ESTE TESTE EXISTE (Tarefa 15, ALTO 3 do laudo do revisor): até
// aqui a política dizia "só de leitura (escopo técnico calendar.readonly)
// — o sistema enxerga a agenda, mas não cria, edita nem apaga nada nela".
// Isso ficou FALSO quando `google-agenda-escrita.ts` passou a existir —
// mesma classe de defeito que a Tarefa 15 corrigiu em comentário de código,
// só que aqui é declaração pública de tratamento de dado, e por isso mais
// grave. Sem este teste, nada trava a frase de voltar a mentir num refactor
// futuro.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const texto = readFileSync(path.join(__dirname, "page.tsx"), "utf-8");

describe("política de privacidade — agenda do Google", () => {
  it("não promete mais 'só de leitura' sozinho: o app também escreve na agenda", () => {
    // Mata o mutante "reverter a frase para a versão antiga": a asserção
    // negativa sozinha não bastaria (poderia sobreviver removendo a
    // palavra "só" e mantendo o resto da mentira) — por isso também exige
    // as duas afirmações positivas abaixo.
    expect(texto).not.toContain("só de leitura");
    expect(texto).not.toMatch(/não cria, edita nem apaga/);
  });

  it("declara o escopo verdadeiro: leitura E escrita de eventos", () => {
    expect(texto).toContain("calendar.readonly");
    expect(texto).toContain("calendar.events");
  });

  it("descreve o que as três funções realmente fazem: criar, atualizar, cancelar — só a sessão sincronizada", () => {
    expect(texto).toMatch(/cria(r)?,?\s*atualiza(r)?\s*e\s*cancela(r)?/i);
    // A promessa de escopo restrito ao evento da própria sessão precisa
    // continuar explícita — o app não vira "acesso total à agenda".
    expect(texto).toMatch(/nenhum outro evento/i);
  });

  it("a promessa de 'nenhum outro evento' vem acompanhada do mecanismo que a impõe", () => {
    // Rodada 3: até aqui esta frase era só uma promessa — `atualizar` e
    // `cancelar` faziam PATCH em qualquer id. Agora o código marca o evento
    // que cria e confere a marca antes de escrever
    // (`CHAVE_ORIGEM_EVENTO`/`conferirOrigem` em
    // `src/lib/integracoes/google-agenda-escrita.ts`). O texto público diz
    // COMO a promessa é cumprida, para que não volte a ser só uma frase.
    expect(texto).toMatch(/marca/i);
    expect(texto).toMatch(/confere/i);
  });
});
