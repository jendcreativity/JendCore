import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default [
  // `vite.config.verify.ts` is a local, git-ignored verification config (see
  // .gitignore) — it is not part of the build and is not linted.
  { ignores: ['dist', 'vite.config.verify.ts'] },
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // Teardown and best-effort media paths deliberately `catch {}` and carry
      // on — stopping tracks, clearing timers, releasing a camera lock. An
      // empty catch is the intended shape there, so only empty blocks
      // elsewhere are reported.
      'no-empty': ['error', { allowEmptyCatch: true }],
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      // Underscore-prefixed identifiers are intentionally unused — e.g. the
      // deprecated `facing` prop retained on VideoTile for API compatibility.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
];
