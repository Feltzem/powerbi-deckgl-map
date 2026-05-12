import powerbiVisualsConfigs from "eslint-plugin-powerbi-visuals";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
export default [
    powerbiVisualsConfigs.configs.recommended,
    {
        languageOptions: {
            parserOptions: {
                project: "./tsconfig.eslint.json",
                tsconfigRootDir: process.cwd(),
            },
        },
    },
    {
        ignores: ["node_modules/**", "dist/**", ".vscode/**", ".tmp/**", "webpack.config.js"],
    },
];
