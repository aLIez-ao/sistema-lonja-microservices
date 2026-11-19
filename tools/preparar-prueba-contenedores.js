import { mkdir, writeFile, chmod } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';

const destino = path.resolve(process.argv[2] || '');
const temporales = [os.tmpdir(), process.env.RUNNER_TEMP].filter(Boolean).map((directorio) => path.resolve(directorio));
if (!temporales.some((temporal) => destino.startsWith(temporal + path.sep))) {
  throw new Error('Los secretos de prueba deben estar en el temporal.');
}
await mkdir(destino, { recursive: true, mode: 0o700 });
const archivos = ['bd_clave', 'bd_root', 'sc_jwt', 'admin_password', 'gmail_pass'];
for (const archivo of archivos) {
  await chmod(path.join(destino, archivo), 0o600).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
  await writeFile(path.join(destino, archivo), randomBytes(32).toString('hex'), { mode: 0o600 });
  // Compose monta estos archivos en /run/secrets; node (UID 1000) debe poder leerlos.
  // El directorio padre 0700 mantiene los secretos inaccesibles a otros usuarios del host.
  await chmod(path.join(destino, archivo), 0o444);
}
await writeFile(
  path.join(destino, 'compose.env'),
  [
    `REGISTRO=${process.env.REGISTRO}`,
    `VERSION=${process.env.VERSION}`,
    'DOMINIO=localhost',
    ...archivos.map(
      (archivo) => `SECRETO_${archivo.toUpperCase()}=${path.join(destino, archivo).replaceAll('\\', '/')}`,
    ),
  ].join('\n') + '\n',
  { mode: 0o600 },
);
console.log('Configuración temporal de contenedores preparada.');
