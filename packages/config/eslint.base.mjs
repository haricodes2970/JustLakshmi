import js from "@eslint/js";
import tseslint from "typescript-eslint";

/** Shared ESLint flat config for TypeScript Node packages (api, shared). */
export function createNodeEslintConfig(ignores = []) {
  return tseslint.config(
    { ignores: ["dist/**", "node_modules/**", ...ignores] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
      rules: {
        "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
        "no-console": "off",
      },
    },
  );
}
