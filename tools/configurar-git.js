import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const exclude = path.resolve(git('rev-parse', '--git-path', 'info/exclude'));
const existentes = readFileSync(exclude, 'utf8');
const patrones = [
  'node_modules/',
  '.env',
  '.env.*',
  '!.env.example',
  'secrets/',
  '*.log',
  'coverage/',
  '/reports/',
  '.gitignore',
  '.gitattributes',
  '.prettierrc.json',
  '.prettierignore',
  'docs/.plan/',
  'docs/.reports/',
  'docs/code-guide/',
  'api/storage/uploads/*',
  '!api/storage/uploads/.gitkeep',
];
const faltantes = patrones.filter((p) => !existentes.split(/\r?\n/).includes(p));
mkdirSync(path.dirname(exclude), { recursive: true });
if (faltantes.length)
  writeFileSync(exclude, existentes.trimEnd() + '\n# Configuración local de Lonja\n' + faltantes.join('\n') + '\n');
git('config', '--local', 'core.autocrlf', 'input');
git('config', '--local', 'fetch.prune', 'true');
git('config', '--local', 'pull.ff', 'only');
console.log('Git configurado; se conservaron las exclusiones locales existentes.');
