import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/.next*/**', '**/dist/**', '.pgdata/**', 'storage-data/**', '**/coverage/**', '**/next-env.d.ts', 'packages/db/prisma/migrations/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-irregular-whitespace': ['error', { skipStrings: true, skipRegExps: true, skipTemplates: true, skipComments: true }],
    },
  },
  { files: ['**/*.mjs', '**/*.js'], languageOptions: { globals: { process: 'readonly', console: 'readonly' } } },
  { files: ['apps/api/**/*.ts'], rules: { '@typescript-eslint/no-extraneous-class': 'off' } },
);
