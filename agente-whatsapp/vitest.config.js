import { defineConfig } from "vitest/config";

// Config propria (e nao a do projeto pai) porque este programa e outro pacote:
// ele roda no Mac do dono, com outro ciclo de vida e outras dependencias. Se os
// testes daqui entrassem na suite do Next, uma quebra do agente pararia o deploy
// do CRM — e sao coisas que quebram por motivos diferentes.
export default defineConfig({
  test: {
    environment: "node",
    include: ["testes/**/*.test.js"],
  },
});
