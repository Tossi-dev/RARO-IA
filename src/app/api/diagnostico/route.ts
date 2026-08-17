// POST /api/diagnostico — as cinco respostas da landing do Jefson.
//
// A ÚNICA ROTA PÚBLICA DE ESCRITA DESTE PROJETO
// ---------------------------------------------
// Todas as outras exigem sessão (cookie) ou o segredo do agente. Esta não
// pode: quem chama é a landing, e a landing não pede cadastro de propósito —
// dono de empresa já sabe o que acontece depois de deixar o telefone num site,
// e pedir contato antes de entregar valor é o gesto que ele associa a vendedor.
// O contato chega por outro caminho: ele mesmo manda a mensagem, do WhatsApp
// dele. Ver `05-funil.md`, seção 2.
//
// Sendo pública, ela carrega quatro travas que as outras não precisam ter:
//
//   1. VEREDITO NO SERVIDOR. `qualificado` é calculado a partir das respostas
//      (`registro.ts`), nunca aceito do corpo. Aceitar deixaria qualquer um
//      entrar na fila de atendimento com uma linha de curl.
//   2. NADA DE CONTATO NO CORPO. O schema abaixo é `.strict()`: um campo
//      `telefone` ou `email` faz a requisição inteira falhar. É o que impede
//      que a promessa "não peço cadastro" vire mentira no dia em que alguém
//      "só acrescentar um campinho" na landing.
//   3. LIMITE POR IP (`limite.ts`).
//   4. RESPOSTA MUDA. Devolve `{ ok: true }` e nada mais — nem id, nem
//      segmento, nem se já existia. Endpoint público que confirma "este código
//      já está no sistema" vira oráculo para adivinhar códigos.
//
// FALHA SILENCIOSA É O COMPORTAMENTO CORRETO DO OUTRO LADO
// --------------------------------------------------------
// A landing chama isto com `.catch(() => {})`. Se esta rota cair, o botão do
// WhatsApp continua funcionando e o código continua viajando dentro do texto —
// o funil degrada para papel e continua fechando venda. Por isso aqui não há
// nenhum retorno que a landing precise ler.

import { NextResponse } from "next/server";
import { z } from "zod";
import { codigoValido } from "@/lib/diagnostico/codigo";
import { conferirLimite, ipDaRequisicao } from "@/lib/diagnostico/limite";
import { gravarDiagnostico } from "@/lib/diagnostico/registro";
import { VARIAVEL_DA_CHAVE } from "@/lib/supabase/servico";

export const dynamic = "force-dynamic";

const Corpo = z
  .object({
    codigo: z.string().min(1).max(32),
    faturamento: z.enum(["F", "A", "B", "C"]),
    // As quatro abaixo aceitam nulo porque quem é recusado na pergunta 1 ou 2
    // nunca chega nas outras. Gravar zero seria inventar resposta que ninguém
    // deu — e depois contar esse zero numa média.
    papel: z.enum(["D", "G", "N"]).nullable(),
    trava: z.enum(["T1", "T2", "T3", "T4", "T5", "T6", "T7"]).nullable(),
    // União de literais em vez de `number().min().max()`: assim o tipo que sai
    // do parse é exatamente `0|1|2|3`, e o compilador — não uma checagem em
    // runtime — garante que só valor de escala válida chega no banco.
    inacabados: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).nullable(),
    urgencia: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).nullable(),
    origem: z.string().max(300).default(""),
  })
  // `.strict()` é a trava nº 2: campo desconhecido reprova a requisição
  // inteira, em vez de ser ignorado em silêncio.
  .strict()
  .refine((c) => codigoValido(c.codigo), {
    path: ["codigo"],
    message: "Código fora do formato do projeto.",
  });

export async function POST(req: Request) {
  const veredito = conferirLimite(ipDaRequisicao(req));
  if (!veredito.permitido) {
    return NextResponse.json(
      { erro: "Muitas tentativas." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((veredito.liberaEm.getTime() - Date.now()) / 1000)) },
      }
    );
  }

  let bruto: unknown;
  try {
    bruto = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo não é JSON válido." }, { status: 400 });
  }

  const lido = Corpo.safeParse(bruto);
  if (!lido.success) {
    // Diz QUE está errado, nunca o que o campo deveria conter: a mensagem
    // detalhada de um schema público é um mapa para quem está adivinhando.
    return NextResponse.json({ erro: "Respostas fora do formato esperado." }, { status: 400 });
  }

  const r = await gravarDiagnostico(lido.data);

  if (r.estado === "sem-configuracao") {
    return NextResponse.json(
      {
        erro: "O diagnóstico não está ligado neste servidor.",
        // Diz o que FALTA (nome da variável), nunca o que ela deveria conter —
        // mesma regra da porta do agente em `api/atendimento/porta.ts`.
        proximo_passo: `Definir ${VARIAVEL_DA_CHAVE} no ambiente e reiniciar o servidor.`,
      },
      { status: 503 }
    );
  }

  if (r.estado === "falhou") {
    return NextResponse.json({ erro: "Falha ao gravar o diagnóstico." }, { status: 500 });
  }

  // 201 tanto para gravado quanto para repetido: o cliente não precisa saber a
  // diferença, e contar a ele qual foi transformaria a rota em oráculo de
  // "este código existe?".
  return NextResponse.json({ ok: true }, { status: 201 });
}
