import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function proximaRota(valor: string | null, origem: string): string {
  if (!valor) return "/login";

  try {
    const destino = new URL(valor, origem);
    if (destino.origin !== origem) return "/login";
    return `${destino.pathname}${destino.search}${destino.hash}`;
  } catch {
    return "/login";
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const destino = proximaRota(url.searchParams.get("next"), url.origin);

  if (!code) return NextResponse.redirect(new URL("/login?erro=confirmacao", url.origin));

  let resposta = NextResponse.redirect(new URL(destino, url.origin));
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(nome: string) {
          return request.cookies.get(nome)?.value;
        },
        set(nome: string, valor: string, opcoes: Record<string, unknown>) {
          resposta.cookies.set({ name: nome, value: valor, ...opcoes });
        },
        remove(nome: string, opcoes: Record<string, unknown>) {
          resposta.cookies.set({ name: nome, value: "", ...opcoes });
        },
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/login?erro=confirmacao", url.origin));
  return resposta;
}
