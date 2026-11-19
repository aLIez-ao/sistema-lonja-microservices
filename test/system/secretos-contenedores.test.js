import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, stat, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('el generador protege el directorio y permite leer los secretos montados al usuario del contenedor', async () => {
  const carpeta = await mkdtemp(path.join(os.tmpdir(), 'lonja-secrets-test-'));
  assert.ok(
    path.resolve(carpeta).startsWith(path.resolve(os.tmpdir()) + path.sep),
    'Temporal fuera del directorio previsto.',
  );
  const herramienta = fileURLToPath(new URL('../../tools/preparar-prueba-contenedores.js', import.meta.url));
  try {
    const preparar = () =>
      execFileSync(process.execPath, [herramienta, carpeta], {
        env: { ...process.env, REGISTRO: 'ensayo-local', VERSION: 'local' },
        stdio: 'pipe',
      });
    preparar();
    preparar();
    for (const nombre of ['bd_clave', 'bd_root', 'sc_jwt', 'admin_password', 'gmail_pass']) {
      assert.match(await readFile(path.join(carpeta, nombre), 'utf8'), /^[a-f0-9]{64}$/);
      if (process.platform !== 'win32') assert.equal((await stat(path.join(carpeta, nombre))).mode & 0o777, 0o444);
    }
    if (process.platform !== 'win32') {
      assert.equal((await stat(carpeta)).mode & 0o777, 0o700);
      assert.equal((await stat(path.join(carpeta, 'compose.env'))).mode & 0o777, 0o600);
    }
  } finally {
    await rm(carpeta, { recursive: true, force: true });
  }
});
