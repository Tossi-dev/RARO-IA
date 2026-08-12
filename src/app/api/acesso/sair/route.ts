// Apaga o cookie do portão por senha e manda de volta para a tela de acesso.
//
// Só existe para o modo `senha`: em `supabase` quem sai usa o logout do
// Supabase Auth (rota diferente, de outro agente); aqui não há sessão para
// invalidar no servidor, só um cookie local para apagar.

import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_ACESSO } from "@/lib/acesso";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const resposta = NextResponse.redirect(new URL("/acesso", req.url));
  resposta.cookies.delete(COOKIE_ACESSO);
  return resposta;
}
