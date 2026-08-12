// A porta compartilhada pelas quatro rotas do agente local.
//
// POR QUE UM ARQUIVO SÓ, E NÃO O MESMO `if` COPIADO EM CADA ROTA
// --------------------------------------------------------------
// São quatro rotas com exatamente a mesma regra de entrada. Copiada quatro
// vezes, ela vira quatro regras que começam iguais — e a quinta rota que
// alguém acrescentar amanhã, com pressa, é a que esquece o `if`. Uma rota sem
// porta neste conjunto expõe a conversa inteira dos clientes do dono.
//
// POR QUE NÃO REUSA `src/lib/guarda-api.ts`: aquela guarda protege rota que o
// PRÓPRIO app chama a partir do navegador, e por isso confere cookie de sessão.
// Do outro lado desta porta não há navegador nem cookie — há um programa. Duas
// portas diferentes porque as duas chaves são diferentes; o que elas dividem é
// a exigência de comparar em tempo constante e de nunca explicar a recusa.
//
// FALHA FECHADO, SEMPRE: sem `RARO_AGENTE_SEGREDO` configurado, as rotas
// respondem 503 dizendo que a integração não está ativada. Elas NUNCA liberam
// por falta de configuração — é a mesma regra de `acesso.ts`, pelo mesmo
// motivo: erro de configuração pode custar uma integração parada; nunca pode
// custar os dados do cliente.

import { NextResponse } from "next/server";
import { HEADER_AGENTE, integracaoAtivada, segredoConfere, segredoConfigurado } from "@/lib/atendimento/segredo";

/**
 * Confere o header e devolve a resposta de recusa quando for o caso; `null`
 * quando pode seguir. Quem chama escreve `const recusa = conferirAgente(req);
 * if (recusa) return recusa;` — três linhas que não dá para esquecer pela
 * metade.
 */
export function conferirAgente(req: Request): NextResponse | null {
  const esperado = segredoConfigurado();

  if (!integracaoAtivada(esperado)) {
    return NextResponse.json(
      {
        erro: "Integração com o WhatsApp não está ativada neste servidor.",
        // Diz o que FALTA (nome da variável), nunca o que ela deveria conter.
        proximo_passo: "Definir RARO_AGENTE_SEGREDO no ambiente e reiniciar o servidor.",
      },
      { status: 503 }
    );
  }

  if (!segredoConfere(req.headers.get(HEADER_AGENTE), esperado)) {
    // Mensagem seca de propósito: "tamanho errado" ou "header ausente" seriam
    // pistas para quem está adivinhando. Quem tem o segredo não precisa de
    // explicação; quem não tem, não merece uma.
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  return null;
}

/** Corpo JSON, ou `null` quando não é JSON válido — sem lançar. */
export async function corpoJson(req: Request): Promise<unknown | null> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
