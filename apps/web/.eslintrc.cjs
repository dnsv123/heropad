/**
 * ESLint for the web app.
 *
 * The rules that are errors here are the ones that have actually cost us:
 * a missing hook dependency (the scanner restarting the camera on every
 * render), and a floating promise (an unawaited fetch whose rejection went
 * nowhere). Everything stylistic is left to Prettier and to review.
 *
 * Type-aware linting is deliberately ON: without a `project`, the rules that
 * catch unhandled promises cannot see enough types to fire at all.
 */
module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:react-hooks/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    project: ['./tsconfig.json'],
    tsconfigRootDir: __dirname,
  },
  plugins: ['@typescript-eslint', 'react-refresh'],
  ignorePatterns: ['dist', 'node_modules', '*.cjs', '*.config.js', '*.config.ts', 'public'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    'react-hooks/exhaustive-deps': 'error',
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/no-misused-promises': [
      'error',
      { checksVoidReturn: { attributes: false } },
    ],
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    // storageService is async by design: the signature is the contract, so
    // swapping localStorage for IndexedDB later touches no caller.
    '@typescript-eslint/require-await': 'off',
    // Too noisy against the Supabase/Privy surface to be worth it right now.
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-unsafe-call': 'off',
    '@typescript-eslint/no-unsafe-argument': 'off',
    '@typescript-eslint/no-unsafe-return': 'off',
    '@typescript-eslint/restrict-template-expressions': 'off',
  },
};
