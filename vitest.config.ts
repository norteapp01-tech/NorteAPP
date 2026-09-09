// Config separado do vite.config.ts de propósito — aquele é gerenciado pelo
// @lovable.dev/vite-tanstack-config e explicitamente pede pra não adicionar plugins
// manualmente. O Vitest não precisa do TanStack Start/Nitro pra rodar testes de
// unidade/componente, só de React + resolução do alias "@/*" já usado no app.
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // O client é construído em alguns testes de unidade. Valores deliberadamente
    // inertes mantêm a suíte local executável sem exigir credenciais reais.
    env: {
      VITE_SUPABASE_URL: "https://example.supabase.co",
      VITE_SUPABASE_ANON_KEY: "test-anon-key",
    },
  },
});
