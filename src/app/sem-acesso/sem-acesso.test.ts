// Teste de módulo puro (padrão de src/app/erro-texto.test.ts): só o que é
// TEXTO e DECISÃO — sem render, sem Supabase, sem cookies.
//
// O teste mais importante deste arquivo não é o primeiro nem o segundo: é o
// último. Ele existe para segurar a REGRA 1 do comentário no topo de
// page.tsx (a tela não pode vazar qual papel a pessoa tem, nem qual papel
// seria necessário) contra uma edição futura bem-intencionada — alguém que,
// tentando deixar o texto "mais claro", escreve "esta área é só para o
// gestor" sem perceber que acabou de dar um mapa de quem pode ver o quê.

import { describe, expect, it } from "vitest";
import { PAPEL_PADRAO, primeiraRotaDe, rotaPermitida, type Papel } from "@/lib/papeis";
import { destinoDeVolta, TEXTO_SEM_ACESSO } from "./texto";

const TODOS_PAPEIS: readonly Papel[] = [
  "dono",
  "gestor",
  "comercial",
  "mentorado",
  "afiliado",
  "aluno",
];

describe("destinoDeVolta", () => {
  it("sem sessão (modo sem Supabase configurado), volta para a raiz", () => {
    expect(destinoDeVolta(null).href).toBe("/");
  });

  it.each(TODOS_PAPEIS)("para o papel %s, volta para a primeira rota do papel", (papel) => {
    expect(destinoDeVolta(papel).href).toBe(primeiraRotaDe(papel));
  });

  it.each(TODOS_PAPEIS)(
    "para o papel %s, o próprio papel pode abrir o destino devolvido (senão o botão 'voltar' joga de novo em /sem-acesso)",
    (papel) => {
      const { href } = destinoDeVolta(papel);
      expect(rotaPermitida(papel, href)).toBe(true);
    }
  );

  it("também funciona para o papel padrão (quem não tem profiles.papel preenchido)", () => {
    expect(destinoDeVolta(PAPEL_PADRAO).href).toBe(primeiraRotaDe(PAPEL_PADRAO));
  });
});

describe("TEXTO_SEM_ACESSO", () => {
  // Nomes de papel (e sinônimos), código HTTP e nome de rota protegida — nada
  // disso pode aparecer no texto que a pessoa barrada lê. Comparação sem
  // diferenciar maiúsculas: "Dono" ou "DONO" vazam tanto quanto "dono".
  const TERMOS_PROIBIDOS = [
    "dono",
    "gestor",
    "comercial",
    "mentorado",
    "afiliado",
    "aluno",
    "403",
    "financeiro",
    "crm",
  ];

  const textoCompleto = Object.values(TEXTO_SEM_ACESSO).join(" ").toLowerCase();

  it.each(TERMOS_PROIBIDOS)("não menciona '%s'", (termo) => {
    expect(textoCompleto.includes(termo.toLowerCase())).toBe(false);
  });

  it("tem título, explicação e rodapé não vazios", () => {
    expect(TEXTO_SEM_ACESSO.titulo.trim().length).toBeGreaterThan(0);
    expect(TEXTO_SEM_ACESSO.explicacao.trim().length).toBeGreaterThan(0);
    expect(TEXTO_SEM_ACESSO.rodape.trim().length).toBeGreaterThan(0);
  });
});
