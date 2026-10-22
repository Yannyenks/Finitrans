// Contrôle bloquant au build : ordre des hooks React (erreur #310 « Rendered more hooks… »)
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config({
  files: ["src/**/*.{ts,tsx}"],
  languageOptions: { parser: tseslint.parser },
  plugins: { "react-hooks": reactHooks, "@typescript-eslint": tseslint.plugin },
  linterOptions: { reportUnusedDisableDirectives: "off" },
  rules: { "react-hooks/rules-of-hooks": "error" },
});
