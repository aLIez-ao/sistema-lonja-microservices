import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('../', import.meta.url));
const archivos = (dir) =>
  readdirSync(path.join(raiz, dir), { withFileTypes: true }).flatMap((e) => {
    const nombre = `${dir}/${e.name}`;
    return e.isDirectory() ? archivos(nombre) : [nombre];
  });
const versionados = new Set(
  execFileSync('git', ['ls-files', '-z', '--', 'client/views'], { cwd: raiz, encoding: 'utf8' }).split('\0'),
);
const errores = [];
for (const vista of archivos('client/views').filter((f) => f.endsWith('.ejs'))) {
  if (!versionados.has(vista)) errores.push(`Vista fuera de Git: ${vista}`);
}
for (const fuente of ['client/app.js', ...archivos('client/routes')].filter((f) => f.endsWith('.js'))) {
  const contenido = readFileSync(path.join(raiz, fuente), 'utf8');
  for (const coincidencia of contenido.matchAll(/\brender\(\s*['"]([^'"]+)['"]/g)) {
    const vista = `client/views/${coincidencia[1]}.ejs`;
    if (!existsSync(path.join(raiz, vista)) || !versionados.has(vista))
      errores.push(`${fuente}: falta ${vista} en Git`);
  }
}
if (errores.length) {
  console.error([...new Set(errores)].join('\n'));
  process.exitCode = 1;
} else console.log('Vistas EJS presentes y versionadas.');
