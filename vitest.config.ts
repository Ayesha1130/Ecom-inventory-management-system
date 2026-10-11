import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } }, // tsconfig uses "preserve" for Next; tests need a real JSX transform
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: { include: ["tests/**/*.test.{ts,tsx}"], testTimeout: 30_000 },
});
