/**
 * ESLint configuration for the React and TypeScript project.
 * Defines linting rules, parser options, environments, and plugins.
 * 
 * @type {import('eslint').Linter.Config}
 */
module.exports = {
  // Prevent ESLint from searching for configurations in parent folders
  root: true,
  // Specify environments where the code is designed to run
  env: { browser: true, es2020: true },
  // Base configurations to extend for JS, TS, and React Hooks rules
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  // Exclude build artifacts and configuration files from linting
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  // Configure parser for TypeScript files
  parser: '@typescript-eslint/parser',
  // Enable React Refresh plugin for Hot Module Replacement validation
  plugins: ['react-refresh'],
  // Custom rule adjustments
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
  },
}