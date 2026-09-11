import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', '*.config.js', 'vite.config.ts', 'server/**', '_scratch/**'],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ...js.configs.recommended,
    plugins: {
      'react-hooks': reactHooks,
    },
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        history: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        FormData: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        AbortController: 'readonly',
        WebSocket: 'readonly',
        EventSource: 'readonly',
        CustomEvent: 'readonly',
        addEventListener: 'readonly',
        removeEventListener: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        React: 'readonly',
      },
    },
    rules: {
      // no-undef is unreliable for TS (tsc catches undefined vars);
      // typescript-eslint recommends disabling it.
      'no-undef': 'off',
      'no-unused-vars': 'off', // handled by tsc --noEmit in the same lint script
      'react/react-in-jsx-scope': 'off',
      // react-hooks plugin must be registered (warn level) so that the
      // 'react-hooks/exhaustive-deps' eslint-disable comments in app code
      // resolve; without registration every disable comment errors out.
      'react-hooks/rules-of-hooks': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];
