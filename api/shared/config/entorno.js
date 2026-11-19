import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const archivos = [fileURLToPath(new URL('../../../.env', import.meta.url))];
if (process.env.NODE_ENV === 'development')
  archivos.push(fileURLToPath(new URL('../../../.env.example', import.meta.url)));
dotenv.config({ path: archivos, quiet: true });

// Docker secrets: el archivo tiene precedencia sobre el valor del entorno.
for (const nombre of ['BD_CLAVE', 'SC_JWT', 'ADMIN_PASSWORD', 'GMAIL_PASS', 'RESTORE_CLAVE']) {
  if (process.env[`${nombre}_FILE`]) {
    process.env[nombre] = readFileSync(process.env[`${nombre}_FILE`], 'utf8').trimEnd();
  }
}
