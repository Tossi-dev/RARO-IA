import { beforeEach, describe, expect, it, vi } from "vitest";

const signUp = vi.hoisted(() => vi.fn());
const resetPasswordForEmail = vi.hoisted(() => vi.fn());
const getUser = vi.hoisted(() => vi.fn());
const updateUser = vi.hoisted(() => vi.fn());
const criarSupabaseServer = vi.hoisted(() => vi.fn(() => ({ auth: { signUp, resetPasswordForEmail, getUser, updateUser } })));
const supabaseConfigurado = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("./data", () => ({ supabaseConfigurado }));
vi.mock("./supabase/server", () => ({ criarSupabaseServer }));

import { criarContaSaas, redefinirSenha, solicitarRedefinicaoSenha } from "./acoes-acesso";

function formulario(campos: Record<string, string>) {
  const dados = new FormData();
  for (const [chave, valor] of Object.entries(campos)) dados.set(chave, valor);
  return dados;
}

describe("criarContaSaas", () => {
  beforeEach(() => {
    signUp.mockReset().mockResolvedValue({ error: null });
    resetPasswordForEmail.mockReset().mockResolvedValue({ error: null });
    getUser.mockReset().mockResolvedValue({ data: { user: { id: "u-1" } }, error: null });
    updateUser.mockReset().mockResolvedValue({ error: null });
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

describe("recuperação de senha", () => {
  beforeEach(() => {
    resetPasswordForEmail.mockReset().mockResolvedValue({ error: null });
    getUser.mockReset().mockResolvedValue({ data: { user: { id: "u-1" } }, error: null });
    updateUser.mockReset().mockResolvedValue({ error: null });
    criarSupabaseServer.mockClear();
    supabaseConfigurado.mockReturnValue(true);
    redirect.mockReset();
    process.env.NEXT_PUBLIC_SITE_URL = "https://raro-ia.vercel.app";
  });

  it("pede ao Supabase um link que retorna apenas à tela de redefinição", async () => {
    await solicitarRedefinicaoSenha(formulario({ email: "marina@example.com" }));

    expect(resetPasswordForEmail).toHaveBeenCalledWith("marina@example.com", {
      redirectTo: "https://raro-ia.vercel.app/auth/confirm?next=%2Fredefinir-senha",
    });
    expect(redirect).toHaveBeenCalledWith("/esqueci-senha?sucesso=1");
  });

  it("não chama o provedor quando o e-mail de recuperação é inválido", async () => {
    await solicitarRedefinicaoSenha(formulario({ email: "nao-e-email" }));

    expect(resetPasswordForEmail).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/esqueci-senha?erro=campos");
  });

  it("só atualiza uma senha após confirmar sessão de recuperação", async () => {
    await redefinirSenha(formulario({ senha: "senha-segura-123", confirmarSenha: "senha-segura-123" }));

    expect(getUser).toHaveBeenCalledOnce();
    expect(updateUser).toHaveBeenCalledWith({ password: "senha-segura-123" });
    expect(redirect).toHaveBeenCalledWith("/login?redefinida=1");
  });

  it("falha fechada quando o link não gerou uma sessão", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    await redefinirSenha(formulario({ senha: "senha-segura-123", confirmarSenha: "senha-segura-123" }));

    expect(updateUser).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/login?erro=recuperacao");
  });
});
