import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const workspace = process.argv[2];
if (!['api', 'client'].includes(workspace)) throw new Error('Workspace inválido.');
const raiz = fileURLToPath(new URL('../', import.meta.url));
const cwd = path.join(raiz, workspace);
const require = createRequire(import.meta.url);
const c8 = path.join(path.dirname(require.resolve('c8/package.json')), 'bin', 'c8.js');
const informe = mkdtempSync(path.join(tmpdir(), `lonja-cobertura-${workspace}-`));
const pruebas = readdirSync(path.join(cwd, 'test'))
  .filter((f) => f.endsWith('.test.js'))
  .map((f) => path.join('test', f));
if (workspace === 'client') pruebas.push('../test/system/client-api.test.js');
const resultado = spawnSync(
  process.execPath,
  [
    c8,
    '--all',
    '--src',
    '.',
    '--include',
    '**/*.js',
    '--exclude',
    'test/**',
    '--exclude',
    'public/**',
    '--exclude',
    'storage/**',
    '--reports-dir',
    informe,
    '--reporter',
    'text-summary',
    '--reporter',
    'json-summary',
    '--check-coverage',
    '--lines',
    '80',
    process.execPath,
    '--test',
    ...pruebas,
  ],
  { cwd, stdio: 'inherit' },
);
if (resultado.error) throw resultado.error;
console.log(`Cobertura de ${workspace}: ${informe}`);
process.exitCode = resultado.status ?? 1;
