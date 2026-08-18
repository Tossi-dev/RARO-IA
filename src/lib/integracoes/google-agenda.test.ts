// Testes de `google-agenda.ts` focados no que a Tarefa 15 mudou: o escopo
// pedido na tela de consentimento do Google.
//
// POR QUE ESTE ARQUIVO EXISTE (ALTO 2 do laudo do revisor independente):
// antes deste teste, NADA no repositório afirmava o valor de
// `ESCOPO_AGENDA` nem a querystring que `urlDeConsentimento` produz — um
// revisor comprovou por mutação que revertendo `ESCOPO_AGENDA` para só
// `calendar.readonly` a suíte inteira continuava verde. A mudança que dá
// nome à tarefa (pedir também `calendar.events`) podia ser desfeita por
// qualquer refactor futuro sem um único teste vermelho. Estes dois testes
// existem para matar esse mutante.

import { describe, expect, it } from "vitest";
import { ESCOPO_AGENDA, urlDeConsentimento } from "./google-agenda";

describe("ESCOPO_AGENDA", () => {
  it("pede leitura E escrita de eventos, readonly primeiro", () => {
    // Asserção de igualdade exata, não `toContain`: um mutante que troca
    // a ORDEM ou insere/mescla escopos errados também precisa morrer, não
    // só um mutante que apaga o escopo de escrita inteiro.
    expect(ESCOPO_AGENDA).toBe(
      "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events"
    );
  });

  it("contém as duas permissões como escopos INDEPENDENTES, separados por espaço", () => {
    const escopos = ESCOPO_AGENDA.split(" ");
    expect(escopos).toHaveLength(2);
    expect(escopos).toContain("https://www.googleapis.com/auth/calendar.readonly");
    expect(escopos).toContain("https://www.googleapis.com/auth/calendar.events");
  });
});

describe("urlDeConsentimento", () => {
  it("carrega as duas permissões na querystring que de fato chega ao Google", () => {
    const url = new URL(urlDeConsentimento("estado-de-teste", "https://exemplo.com"));
    expect(url.hostname).toBe("accounts.google.com");

    // O parâmetro `scope` chega URL-encoded com "+" no lugar do espaço —
    // `URLSearchParams` já decodifica isso para nós; comparar a STRING
    // decodificada (não a querystring crua) é o que garante que o teste
    // não depende de qual codificação de espaço o `URLSearchParams` do
    // motor JS escolheu (`%20` vs `+` são equivalentes, e ambos válidos).
    const scope = url.searchParams.get("scope");
    expect(scope).toBe(ESCOPO_AGENDA);
    expect(scope).toContain("calendar.readonly");
    expect(scope).toContain("calendar.events");
  });
});
