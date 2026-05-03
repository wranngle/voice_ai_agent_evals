/**
 * xo configuration. xo 1.x discovers `xo.config.{js,cjs,mjs,ts,cts,mts}`
 * via cosmiconfig — the legacy `.xo-config.cjs` filename is NOT picked up,
 * so this file MUST be named `xo.config.cjs` (do not rename).
 *
 * xo 1.x (ESLint flat config) does not accept the legacy `overrides` key
 * inside package.json, so we use the flat-config-friendly array form here.
 */
module.exports = [
  {
    space: 2,
    semicolon: true,
    prettier: false,
    rules: {
      // -- Convention rules: project uses snake_case in JSON fixtures, env vars,
      //    DB columns, third-party API payloads. Naming rules misfire on these.
      'unicorn/no-process-exit': 'off',
      'unicorn/prefer-top-level-await': 'off',
      'unicorn/prevent-abbreviations': 'off',
      'unicorn/no-null': 'off',
      'unicorn/prefer-module': 'off',
      'unicorn/prefer-node-protocol': 'off',
      'unicorn/no-anonymous-default-export': 'off',
      'unicorn/text-encoding-identifier-case': 'off', // fs API accepts utf-8 and utf8
      'unicorn/no-array-for-each': 'off',
      'unicorn/prefer-structured-clone': 'off',
      'unicorn/prefer-single-call': 'off',
      'unicorn/no-nested-ternary': 'off',
      camelcase: 'off',
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/naming-convention': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/no-redundant-type-constituents': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/restrict-plus-operands': 'off',
      '@typescript-eslint/no-base-to-string': 'off',
      // ESLint type-narrowing disagrees with tsc here — removing the cast
      // breaks `tsc --noEmit` (string vs literal-union widening).
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      // -- Node features: project pins Node 20+ via bun-types, so the n/* rules
      //    that complain about "unsupported features" mis-trigger.
      'n/prefer-global/process': 'off',
      'n/prefer-global/buffer': 'off',
      'n/file-extension-in-import': 'off',
      // -- Imports: bundler resolution + bun handles extensionless imports;
      //    rule renamed from `import/extensions` to `import-x/extensions`.
      'import/extensions': 'off',
      'import-x/extensions': 'off',
      'import-x/no-unassigned-import': 'off',
      // -- Style preferences (prettier-style nits xo --fix could not resolve).
      '@stylistic/max-statements-per-line': 'off',
      '@stylistic/no-mixed-operators': 'off',
      'logical-assignment-operators': 'off',
      // -- Idiomatic test/runner patterns.
      'promise/prefer-await-to-then': 'off',
      'promise/param-names': 'off', // `r => setTimeout(r, ms)` is idiomatic
      'no-promise-executor-return': 'off', // same idiom
      // -- Project conventions.
      'no-await-in-loop': 'off',
      'max-depth': 'off',
      complexity: 'off',
      'capitalized-comments': 'off',
    },
  },
  {
    files: ['hooks/**/*.ts'],
    rules: {
      'unicorn/no-process-exit': 'off',
    },
  },
  {
    files: ['**/*.test.ts', '**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    // XSS / security probes legitimately need `javascript:` URLs as fixtures.
    files: ['tests/n8n-postcall/framework/**/*.{ts,js}'],
    rules: {
      'no-script-url': 'off',
    },
  },
];
