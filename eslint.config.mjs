import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts", "docs/**", "playwright-report/**", "test-results/**"] },
  ...nextVitals,
  ...nextTs,
  {
    // Database results are untyped jsonb; `any` is the honest type for assertions in tests. Strict everywhere else.
    files: ["tests/**", "e2e/**"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
];
export default config;
