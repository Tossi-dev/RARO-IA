import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // `scripts/**` entra aqui porque `scripts/migrar-planilha-para-supabase.ts`
    // não é código do app (não roda dentro do Next) — é um script standalone,
    // e por isso mora fora de `src`. O teste dele precisa do mesmo runner.
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
