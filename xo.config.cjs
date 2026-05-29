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
    // -- Scope: lint only the code that ships in the npm package + its tests.
    //    Everything below is either a sibling-owned app (`playground/`), a
    //    vendored shadcn-style component library (`playground/ui-library/`),
    //    or a ground-truth corpus copied verbatim from elevenlabs/packages
    //    (`docs/research/elevenlabs-widget-ui/external/source/`). None of it
    //    ships in `dist/`; the `prepublishOnly` chain should not gate on it.
    ignores: [
      'dist/**',
      'node_modules/**',
      'playground/**',
      'docs/research/**',
      'reports/**',
      'out/**',
      '**/*.min.js',
    ],
  },
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
      'unicorn/text-encoding-identifier-case': 'off', // fs API accepts utf-8 and utf8
      camelcase: 'off',
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/naming-convention': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/restrict-plus-operands': 'off',
      // -- Node features: project pins Node 20+ via bun-types, so the n/* rules
      //    that complain about "unsupported features" mis-trigger.
      'n/prefer-global/process': 'off',
      'n/prefer-global/buffer': 'off',
      // -- Imports: bundler resolution + bun handles extensionless imports.
      'import-x/extensions': 'off',
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
];
