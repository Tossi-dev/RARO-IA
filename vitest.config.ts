import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // ALTO 3 — `.tsx` entrando na suíte (ver `include` abaixo) precisa de
  // transform de JSX; `tsconfig.json` usa `"jsx": "preserve"` (Next faz o
  // transform de verdade via SWC), mas o Vite/esbuild que roda o Vitest não
  // lê essa opção do mesmo jeito — sem isto, todo arquivo `.tsx` falha em
  // runtime com "React is not defined" (esbuild caindo no transform clássico
  // sem o import automático). `"automatic"` é o MESMO runtime que o Next usa
  // (React 17+, sem precisar de `import React` em cada arquivo).
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    // `scripts/**` entra aqui porque `scripts/migrar-planilha-para-supabase.ts`
    // não é código do app (não roda dentro do Next) — é um script standalone,
    // e por isso mora fora de `src`. O teste dele precisa do mesmo runner.
    //
    // ALTO 3 da auditoria — `src/**/*.test.tsx` (achado que faltava): sem
    // ele, NENHUM `.tsx` rodava, e a tela do portal (`(app)/portal/page.tsx`)
    // não tinha um teste sequer — cinco mutantes de vazamento (url sem
    // validar, papel impresso, telefone impresso, transcrição impressa,
    // estado "não é mentorado" trocado pelo portal cheio) sobreviveriam
    // indefinidamente porque não havia suíte nenhuma capaz de os matar.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
