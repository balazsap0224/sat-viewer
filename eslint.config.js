import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// Imports that would pull I/O, DOM, Node or a framework into packages/core (SPEC.md 2.2,
// CLAUDE.md rule 3). The tsconfig already leaves out DOM and Node types; this makes the
// boundary explicit and catches packages added by mistake.
const impureImports = [
  { group: ['node:*'], message: 'core must stay free of Node APIs.' },
  {
    group: ['fs', 'fs/*', 'path', 'os', 'child_process', 'http', 'https', 'net', 'crypto'],
    message: 'core must stay free of Node APIs.',
  },
  {
    group: ['react', 'react-dom', 'react/*', 'react-dom/*', 'three', 'three/*', '@react-three/*'],
    message: 'core must stay free of DOM and framework code.',
  },
  {
    group: ['@sat-viewer/*'],
    message: 'core is the bottom layer; it must not import the other packages.',
  },
];

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', '**/public/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    // Plain JavaScript files are not part of any tsconfig; lint them without types.
    files: ['**/*.js', '**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ['packages/core/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: impureImports }] },
  },
);
