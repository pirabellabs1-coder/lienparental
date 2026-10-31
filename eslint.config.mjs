// ESLint (configuration « flat », ESLint 9) : règles Next.js (Core Web Vitals) et TypeScript.
// Lancé par `npm run lint`, le hook pre-commit (fichiers indexés) et la CI (.github/workflows/quality.yml).
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FlatCompat } from '@eslint/eslintrc'

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) })

const config = [
  {
    ignores: ['.next/**', 'node_modules/**', 'public/**', 'livrables/**', 'next-env.d.ts', '**/*.min.js'],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    // Gabarits @react-pdf : <Text> rend du texte brut, les apostrophes françaises n'y posent aucun problème.
    files: ['lib/pdf/**/*.tsx'],
    rules: { 'react/no-unescaped-entities': 'off' },
  },
]

export default config
