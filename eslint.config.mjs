import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

const frameworkPackages = [
  '@nestjs/*',
  'typeorm',
  'pg',
  'express',
  'class-validator',
  'class-transformer',
  'nestjs-pino',
  'pino',
  'pino-http',
  'zod',
];

const boundary = (extra = []) => ({
  'no-restricted-imports': [
    'error',
    {
      patterns: [
        {
          group: frameworkPackages,
          message:
            'Hexagonal boundary: domain/application must not depend on frameworks, ORM or HTTP libraries.',
        },
        ...extra,
      ],
    },
  ],
});

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    languageOptions: { globals: { ...globals.node, ...globals.jest } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/domain/**/*.ts'],
    rules: boundary([
      {
        group: ['**/application/**', '**/infrastructure/**'],
        message: 'Hexagonal boundary: the domain depends on nothing else in the project.',
      },
    ]),
  },
  {
    files: ['src/application/**/*.ts'],
    rules: boundary([
      {
        group: ['**/infrastructure/**'],
        message: 'Hexagonal boundary: application talks to infrastructure only through ports.',
      },
    ]),
  },
  {
    files: ['**/*.mjs'],
    languageOptions: { sourceType: 'module' },
  },
  {
    files: ['**/*.js'],
    languageOptions: { sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
