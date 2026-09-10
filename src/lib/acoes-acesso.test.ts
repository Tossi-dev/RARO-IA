import { beforeEach, describe, expect, it, vi } from "vitest";

const signUp = vi.hoisted(() => vi.fn());
const criarSupabaseServer = vi.hoisted(() => vi.fn(() => ({ auth: { signUp } })));
const supabaseConfigurado = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("./data", () => ({ supabaseConfigurado }));
vi.mock("./supabase/server", () => ({ criarSupabaseServer }));

import { criarContaSaas } from "./acoes-acesso";

function formulario(campos: Record<string, string>) {
  const dados = new FormData();
  for (const [chave, valor] of Object.entries(campos)) dados.set(chave, valor);
  return dados;
}

describe("criarContaSaas", () => {
  beforeEach(() => {
    signUp.mockReset().mockResolvedValue({ error: null });
    criarSupabaseServer.mockClear();
    supabaseConfigurado.mockReturnValue(true);
    redirect.mockReset();
    process.env.NEXT_PUBLIC_SITE_URL = "https://raro-ia.vercel.app";
  });

  it("cria a intenção SaaS sem permitir papel ou workspace escolhido pelo navegador", async () => {
    await criarContaSaas(
      formulario({
        nome: "Marina Costa",
        workspaceNome: "Mentoria Marina",
        email: "marina@example.com",
        senha: "senha-segura-123",
        confirmarSenha: "senha-segura-123",
        papel: "dono",
        workspace_id: "nao-pode-entrar",
      }),
    );

    expect(signUp).toHaveBeenCalledWith({
      email: "marina@example.com",
      password: "senha-segura-123",
      options: {
        data: {
          nome: "Marina Costa",
          workspace_nome: "Mentoria Marina",
          criar_workspace: true,
        },
        emailRedirectTo: "https://raro-ia.vercel.app/auth/confirm?next=%2Flogin%3Fconfirmado%3D1",
      },
    });
    expect(redirect).toHaveBeenCalledWith("/criar-conta?sucesso=1");
  });

  it("recusa senha curta ou divergente antes de tocar no Supabase", async () => {
    await criarContaSaas(
      formulario({
        nome: "Marina Costa",
        workspaceNome: "Mentoria Marina",
        email: "marina@example.com",
        senha: "curta",
        confirmarSenha: "outra",
      }),
    );

    expect(criarSupabaseServer).not.toHaveBeenCalled();
    expect(signUp).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/criar-conta?erro=campos");
  });

  it("responde igual ao sucesso quando o provedor recusa o cadastro", async () => {
    signUp.mockResolvedValue({ error: { message: "User already registered" } });

    await criarContaSaas(
      formulario({
        nome: "Marina Costa",
        workspaceNome: "Mentoria Marina",
        email: "marina@example.com",
        senha: "senha-segura-123",
        confirmarSenha: "senha-segura-123",
      }),
    );

    expect(redirect).toHaveBeenCalledWith("/criar-conta?sucesso=1");
  });
});
