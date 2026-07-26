import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist',
    'dev-dist',
    'convex/_generated',
    'src/routeTree.gen.ts',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    // Vendored UI kits (shadcn/ui and Plate/BlockNote templates) export
    // variants, factories and helpers alongside components; don't hold them to
    // the fast-refresh rule. BlockNote spec files co-locate the static `View`
    // component and the spec factory (the spec's `toExternalHTML` reuses the
    // View), which is the intended single-declaration-per-component pattern.
    files: ['src/components/shadcn/**', 'src/components/plate/**', 'src/components/blocknote/**'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
