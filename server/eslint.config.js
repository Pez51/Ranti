import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/**', 'coverage/**', 'dist/**', 'build/**', 'uploads/**', 'logs/**'] },
  js.configs.recommended,
  { files: ['**/*.js'], languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.node } },
];
