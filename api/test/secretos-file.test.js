import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('Docker secrets tienen precedencia y conservan espacios interiores', async () => {
  const temporal = await mkdtemp(path.join(tmpdir(), 'lonja-secreto-'));
  try {
    const archivo = path.join(temporal, 'secreto');
    await writeFile(archivo, 'valor de prueba\n');
    const nombres = ['BD_CLAVE', 'SC_JWT', 'ADMIN_PASSWORD', 'GMAIL_PASS'];
    const env = { ...process.env };
    for (const nombre of nombres) {
      env[nombre] = 'valor previo';
      env[`${nombre}_FILE`] = archivo;
    }
    const codigo = `import './shared/config/entorno.js'; console.log(JSON.stringify(${JSON.stringify(nombres)}.map(n => process.env[n])));`;
    const resultado = spawnSync(process.execPath, ['--input-type=module', '-e', codigo], { env, encoding: 'utf8' });
    assert.equal(resultado.status, 0, resultado.stderr);
    assert.deepEqual(
      JSON.parse(resultado.stdout),
      nombres.map(() => 'valor de prueba'),
    );
  } finally {
    await rm(temporal, { recursive: true, force: true });
  }
});
