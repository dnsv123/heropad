/**
 * ESLint for the API.
 *
 * One rule matters more here than anywhere else: no-floating-promises. A
 * dropped await in a route handler does not crash — it returns a response
 * while the database write is still in flight, which is the shape of bug that
 * only shows up as "the stamp did not appear" weeks later.
 */
module.exports = {
  root: true,
  env: { node: true, es2022: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    project: ['./tsconfig.json'],
    tsconfigRootDir: __dirname,
  },
  plugins: ['@typescript-eslint'],
  // scripts/ are one-off operator tools outside the build tsconfig.
  ignorePatterns: ['dist', 'node_modules', '*.cjs', 'scripts'],
  rules: {
    '@typescript-eslint/no-floating-promises': 'error',
    // Express route handlers are async by convention here; the rule's
    // void-return check flags every single one of them.
    '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    // This is a server. Structured logging is the observability we have.
    'no-console': 'off',
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-unsafe-call': 'off',
    '@typescript-eslint/no-unsafe-argument': 'off',
    '@typescript-eslint/no-unsafe-return': 'off',
    '@typescript-eslint/restrict-template-expressions': 'off',
  },
};
