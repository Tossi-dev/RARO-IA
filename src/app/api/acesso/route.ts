// Confere a senha compartilhada (RARO_SENHA) e, se bater, grava o cookie que
// o middleware vai conferir daqui pra frente.
//
// POR QUE COMPARAR SELOS E NÃO AS SENHAS: um `===` entre strings compara
// caractere a caractere e para no primeiro que difere — a diferença de
// tempo entre "errou na primeira letra" e "errou na última" é medível pela
// rede e dá pra descobrir a senha uma letra de cada vez. `selo()` já resolve
// isso (é HMAC + comparação em tempo constante, ver src/lib/acesso.ts); a
// função `seloConfere` existente foi escrita para comparar um selo contra
// uma senha, e aqui as duas pontas já chegam como selo — dá pra reusá-la sem
// tocar no módulo congelado: `seloConfere(await selo(digitada), configurada)`
// deixa a comparação de tempo constante inteira dentro do núcleo já testado.

import { NextResponse, type NextRequest } from "next/server";
import {
  ambienteAtual,
  COOKIE_ACESSO,
  selo,
  seloConfere,
  VALIDADE_ACESSO_SEGUNDOS,
} from "@/lib/acesso";
import { rotaSegura } from "@/lib/portao";

export const dynamic = "force-dynamic";

// --- freio de força bruta ---------------------------------------------
//
// Um mapa em memória de processo, por IP. NÃO é um freio perfeito: em
// produção serverless cada instância do processo tem o seu próprio mapa, e
// escalar horizontalmente significa que 10 tentativas por instância podem
// virar bem mais que 10 tentativas reais contra a senha. Isto aqui é
// redução de dano contra um script ingênuo batendo na mesma instância, não
// uma defesa completa — quem carrega a defesa de verdade é o tamanho da
// senha (mínimo de 10 caracteres, ver TAMANHO_MINIMO_SENHA em acesso.ts):
// nem 10 milhões de tentativas chegam perto de um espaço de busca desses.
const LIMITE_TENTATIVAS = 10;
const JANELA_MS = 10 * 60 * 1000;
const tentativasPorIp = new Map<string, { contagem: number; desde: number }>();

function ipDoPedido(req: NextRequest): string {
  // `x-forwarded-for` pode chegar com uma lista ("cliente, proxy1, proxy2");
  // o primeiro item é o mais próximo do cliente real.
  const encaminhado = req.headers.get("x-forwarded-for");
  if (encaminhado) return encaminhado.split(",")[0].trim();
  // Sem proxy configurado (ex.: `next start` local) nenhum dos dois existe —
  // agrupar em "desconhecido" ainda limita a 10 tentativas totais, o que é
  // aceitável: pior caso é um pouco mais restritivo, nunca mais permissivo.
  return req.ip ?? "desconhecido";
}

function bloqueadoPorExcesso(ip: string): boolean {
  const registro = tentativasPorIp.get(ip);
  if (!registro) return false;
  if (Date.now() - registro.desde > JANELA_MS) {
    tentativasPorIp.delete(ip); // janela expirou: começa a contar de novo
    return false;
  }
  return registro.contagem >= LIMITE_TENTATIVAS;
}

function registrarFalha(ip: string): void {
  const agora = Date.now();
  const registro = tentativasPorIp.get(ip);
  if (!registro || agora - registro.desde > JANELA_MS) {
    tentativasPorIp.set(ip, { contagem: 1, desde: agora });
    return;
  }
  registro.contagem += 1;
}

// -----------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const ip = ipDoPedido(req);

  if (bloqueadoPorExcesso(ip)) {
    return NextResponse.json(
      { erro: "Muitas tentativas erradas. Espere alguns minutos e tente de novo." },
      { status: 429 }
    );
  }

  const form = await req.formData();
  const senhaDigitada = String(form.get("senha") ?? "");
  // Validado aqui de novo (não só na tela): esta rota também pode ser
  // chamada direto, sem passar pelo formulário, e "de" vira o destino do
  // redirect — sem checar, um link malicioso com `de=//site-falso` faria o
  // próprio sistema mandar quem acabou de digitar a senha certa para fora.
  const de = rotaSegura(String(form.get("de") ?? ""));
  const senhaConfigurada = ambienteAtual().senha;

  const ok =
    senhaDigitada.length > 0 && (await seloConfere(await selo(senhaDigitada), senhaConfigurada));

  if (!ok || !senhaConfigurada) {
    registrarFalha(ip);
    // Sem detalhe: nem "senha não configurada", nem contagem de tentativas
    // restantes. Confirmar qualquer coisa aqui ajuda quem está tentando
    // adivinhar, não quem esqueceu a senha.
    return NextResponse.redirect(new URL("/acesso?erro=1", req.url));
  }

  const resposta = NextResponse.redirect(new URL(de, req.url));
  resposta.cookies.set(COOKIE_ACESSO, await selo(senhaConfigurada), {
    httpOnly: true, // não pode ser lido por script no navegador
    secure: req.nextUrl.protocol === "https:", // local em http ainda funciona
    sameSite: "lax",
    path: "/",
    maxAge: VALIDADE_ACESSO_SEGUNDOS,
  });
  return resposta;
}
