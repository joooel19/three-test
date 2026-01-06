// @ts-expect-error
import arrayFunc from 'eslint-plugin-array-func';
// @ts-expect-error
import comments from '@eslint-community/eslint-plugin-eslint-comments/configs';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import js from '@eslint/js';
// @ts-expect-error
import promise from 'eslint-plugin-promise';
import sonarjs from 'eslint-plugin-sonarjs';
import ts from 'typescript-eslint';
import unicorn from 'eslint-plugin-unicorn';

/* eslint-disable @typescript-eslint/no-unsafe-argument */
export default defineConfig(
  // General configuration.
  {
    ...js.configs.all,
    rules: {
      ...js.configs.all.rules,
      curly: ['error', 'multi', 'consistent'],
      'func-style': [
        'error',
        'declaration',
        {
          allowArrowFunctions: true,
        },
      ],
      'id-length': [
        'error',
        {
          exceptions: ['_', 'x', 'y', 'z'],
        },
      ],
      'init-declarations': 'off',
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      'max-params': ['error', 5],
      'max-statements': ['error', 100],
      'no-console': [
        'error',
        {
          allow: ['warn', 'error'],
        },
      ],
      'no-continue': 'off',
      'no-inline-comments': [
        'error',
        {
          ignorePattern: String.raw`@type\s.+|@ts-expect-error`,
        },
      ],
      'no-loop-func': 'off',
      'no-magic-numbers': 'off',
      'no-plusplus': 'off',
      'no-ternary': 'off',
      'no-unused-vars': [
        'error',
        {
          varsIgnorePattern: '^_$',
        },
      ],
      'one-var': [
        'error',
        {
          initialized: 'never',
          uninitialized: 'always',
        },
      ],
      'require-atomic-updates': 'off',
    },
  },
  // Array func plugin configuration.
  {
    ...arrayFunc.configs.all,
    rules: {
      ...arrayFunc.configs.all.rules,
      'array-func/prefer-array-from': 'off',
    },
  },
  // Comments plugin configuration.
  {
    ...comments.recommended,
    rules: {
      ...comments.recommended.rules,
      '@eslint-community/eslint-comments/no-unused-disable': 'error',
    },
  },
  // Promise plugin configuration.
  {
    ...promise.configs['flat/recommended'],
  },
  // Sonarjs plugin configuration.
  {
    ...sonarjs.configs.recommended,
    rules: {
      ...sonarjs.configs.recommended.rules,
      'sonarjs/assertions-in-tests': 'off',
      'sonarjs/cognitive-complexity': 'off',
      'sonarjs/no-empty-function': 'off',
      'sonarjs/no-hardcoded-credentials': 'off',
      'sonarjs/no-hardcoded-passwords': 'off',
      'sonarjs/no-misused-promises': 'off',
      'sonarjs/pseudo-random': 'off',
      'sonarjs/redundant-type-aliases': 'off',
    },
  },
  // TypeScript plugin configuration.
  .../** @type {import('eslint').Linter.Config[]} */ (
    ts.configs.strictTypeChecked.map((config) => ({
      ...config,
      rules: {
        ...config.rules,
        '@typescript-eslint/ban-ts-comment': 'off',
        '@typescript-eslint/no-base-to-string': 'off',
        '@typescript-eslint/no-extraneous-class': 'off',
        '@typescript-eslint/no-misused-promises': [
          'error',
          {
            checksVoidReturn: false,
          },
        ],
        '@typescript-eslint/no-misused-spread': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unused-vars': [
          'error',
          {
            varsIgnorePattern: '^_$',
          },
        ],
      },
    }))
  ),
  // Unicorn plugin configuration.
  {
    ...unicorn.configs.all,
    rules: {
      ...unicorn.configs.all.rules,
      'unicorn/no-array-callback-reference': 'off',
      'unicorn/no-array-reduce': 'off',
      'unicorn/no-empty-file': 'off',
      'unicorn/no-for-loop': 'off',
      'unicorn/no-negated-condition': 'off',
      'unicorn/no-null': 'off',
      'unicorn/prefer-query-selector': 'off',
      'unicorn/switch-case-braces': 'off',
    },
  },
  // General settings.
  {
    ignores: ['**/dist/*'],
  },
  {
    languageOptions: {
      ecmaVersion: 'latest',
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        project: ['./tsconfig.json'],
      },
      sourceType: 'module',
    },
  },
);
/* eslint-enable @typescript-eslint/no-unsafe-argument */
