import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as prettier from 'prettier';
import { getLanguageService } from 'vscode-html-languageservice';
import { TextDocument } from 'vscode-languageserver-textdocument';

const raiz = fileURLToPath(new URL('../', import.meta.url));
const servicioHtml = getLanguageService();
export const opcionesHtml = {
  tabSize: 2,
  insertSpaces: true,
  templating: true,
  wrapLineLength: 120,
  contentUnformatted: 'pre,code,textarea,script',
  preserveNewLines: true,
  maxPreserveNewLines: 2,
  endWithNewline: true,
};

/** El mismo motor de HTML Language Features, conservando las etiquetas de EJS completas. */
export function formatearHtml(texto, nombre = 'plantilla.ejs') {
  const original = texto.replace(/\r\n?/g, '\n');
  let resultado = original;
  let estable = false;
  for (let pasada = 0; pasada < 5; pasada++) {
    const documento = TextDocument.create(pathToFileURL(path.resolve(nombre)).href, 'html', 1, resultado);
    const nuevo = TextDocument.applyEdits(documento, servicioHtml.format(documento, undefined, opcionesHtml));
    if (nuevo === resultado) {
      estable = true;
      break;
    }
    resultado = nuevo;
  }
  if (!estable) throw new Error(`El formato HTML no se estabilizó: ${nombre}. No se escribió el archivo.`);
  if (/\.ejs$/i.test(nombre)) {
    const etiquetas = (s) => s.match(/<%[\s\S]*?%>/g) || [];
    if (JSON.stringify(etiquetas(original)) !== JSON.stringify(etiquetas(resultado)))
      throw new Error(`El formateador alteró etiquetas EJS: ${nombre}. No se escribió el archivo.`);
  }
  return resultado;
}

const soportado = /\.(?:js|mjs|cjs|json|yaml|yml|css|md|html?|ejs)$/i;
// Estas exclusiones públicas funcionan también en clones sin configuración local.
const excluido =
  /^(?:package-lock\.json$|(?:node_modules|coverage|reports|secrets)\/|api\/storage\/|client\/public\/(?:bootstrap|chartjs|uploads)\/|docs\/(?:\.[^/]+|code-guide)\/)/;

async function ejecutar() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg.startsWith('--') && !['--write', '--check'].includes(arg)))
    throw new Error('Uso: node tools/formato.js --write|--check [archivos...]');
  if (args.includes('--write') === args.includes('--check')) throw new Error('Indica --write o --check.');
  const escribir = args.includes('--write');
  const indicados = args.filter((arg) => !arg.startsWith('--'));
  const archivos = indicados.length
    ? indicados
    : execFileSync('git', ['ls-files', '-z'], { cwd: raiz, encoding: 'utf8' }).split('\0').filter(Boolean);
  const { prettier: configuracion } = JSON.parse(readFileSync(path.join(raiz, 'package.json'), 'utf8'));
  const local = path.join(raiz, '.prettierignore');
  const pendientes = [];
  let revisados = 0;
  // Preparar todos los resultados antes de escribir: un error de plantilla no deja un lote a medias.
  for (const nombre of new Set(archivos)) {
    const absoluto = path.resolve(raiz, nombre);
    const relativo = path.relative(raiz, absoluto).replaceAll('\\', '/');
    if (relativo.startsWith('../') || path.isAbsolute(relativo))
      throw new Error('El archivo debe estar en el proyecto.');
    if (!soportado.test(relativo) || excluido.test(relativo)) continue;
    const info = await prettier.getFileInfo(absoluto, { ignorePath: existsSync(local) ? local : undefined });
    if (info.ignored) continue;
    const texto = readFileSync(absoluto, 'utf8');
    const salida = /\.(?:html?|ejs)$/i.test(relativo)
      ? formatearHtml(texto, relativo)
      : await prettier.format(texto, { ...configuracion, filepath: absoluto });
    revisados++;
    if (salida !== texto) pendientes.push({ absoluto, relativo, salida });
  }
  if (escribir) for (const archivo of pendientes) writeFileSync(archivo.absoluto, archivo.salida);
  for (const archivo of pendientes) console.log(`${escribir ? 'Formateado' : 'Sin formato'}: ${archivo.relativo}`);
  console.log(`${revisados} archivos revisados; ${pendientes.length} ${escribir ? 'formateados' : 'con diferencias'}.`);
  if (!escribir && pendientes.length) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url)
  await ejecutar().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
