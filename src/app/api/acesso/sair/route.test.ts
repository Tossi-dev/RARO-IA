import { describe, expect, it } from "vitest";
import { COOKIE_ACESSO } from "@/lib/acesso";
import { POST } from "./route";

describe("POST /api/acesso/sair", () => {
  it("apaga somente o cookie local de acesso e redireciona para /acesso", async () => {
    const resposta = await POST(
      new Request("https://mentoros.exemplo.test/api/acesso/sair", {
        method: "POST",
        headers: { cookie: `${COOKIE_ACESSO}=selo-antigo; outro=preservar` },
      }) as never,
    );

    expect(resposta.status).toBe(307);
    expect(resposta.headers.get("location")).toBe("https://mentoros.exemplo.test/acesso");
    expect(resposta.headers.get("set-cookie")).toContain(`${COOKIE_ACESSO}=`);
    // O Next representa `cookies.delete()` com uma data de expiração no
    // passado; o protocolo também aceita Max-Age=0, mas não é a forma que a
    // resposta real escolhe aqui.
    expect(resposta.headers.get("set-cookie")).toMatch(/expires=thu, 01 jan 1970/i);
  });
});
