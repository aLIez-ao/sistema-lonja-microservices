import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('../', import.meta.url));
const documentos = ['README.md', 'api/README.md', 'client/README.md'];
for (const carpeta of ['docs', 'api/docs', 'client/docs']) {
  for (const entrada of readdirSync(path.join(raiz, carpeta), { withFileTypes: true })) {
    if (entrada.isFile() && entrada.name.endsWith('.md')) documentos.push(`${carpeta}/${entrada.name}`);
  }
}
const errores = [];
let enlaces = 0;
for (const documento of documentos) {
  const archivo = path.join(raiz, documento);
  const contenido = readFileSync(archivo, 'utf8').replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '');
  for (const coincidencia of contenido.matchAll(/!?\[[^\]\n]*\]\((<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    const destino = coincidencia[1].replace(/^<|>$/g, '');
    if (/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(destino)) continue;
    enlaces++;
    const ruta = decodeURIComponent(destino.split('#')[0].split('?')[0]);
    if (!existsSync(path.resolve(path.dirname(archivo), ruta))) errores.push(`${documento}: ${destino}`);
  }
}
try {
  execFileSync(process.execPath, [path.join(raiz, 'tools/documentar-api.js'), '--check'], { stdio: 'inherit' });
} catch {
  errores.push('La referencia REST no coincide con OpenAPI o el contrato no pudo leerse.');
}
if (errores.length) {
  console.error(errores.join('\n'));
  process.exitCode = 1;
} else console.log(`${documentos.length} documentos y ${enlaces} enlaces locales verificados.`);
