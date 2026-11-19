import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const archivos = [fileURLToPath(new URL('../../../.env', import.meta.url))];
if (process.env.NODE_ENV === 'development')
  archivos.push(fileURLToPath(new URL('../../../.env.example', import.meta.url)));
// Las pruebas reciben su entorno explícito; no leen credenciales locales del desarrollador.
if (process.env.NODE_ENV !== 'test' && !process.env.NODE_TEST_CONTEXT) dotenv.config({ path: archivos, quiet: true });

// Docker secrets: el archivo tiene precedencia sobre el valor del entorno.
for (const nombre of ['BD_CLAVE', 'SC_JWT', 'ADMIN_PASSWORD', 'GMAIL_PASS', 'SMTP_PASS', 'RESTORE_CLAVE']) {
  if (process.env[`${nombre}_FILE`]) {
    process.env[nombre] = readFileSync(process.env[`${nombre}_FILE`], 'utf8').trimEnd();
  }
}
