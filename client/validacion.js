import { readFileSync } from 'node:fs';
import YAML from 'yaml';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const contrato = YAML.parse(readFileSync(new URL('../contracts/openapi.yaml', import.meta.url), 'utf8'));
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
const validadores = new Map();
const rutas = Object.entries(contrato.paths)
  .map(([ruta, operaciones]) => ({
    ruta,
    operaciones,
    patron: new RegExp(
      '^' +
        ruta
          .split('/')
          .map((p) => (p.startsWith('{') ? '[^/]+' : p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
          .join('/') +
        '$',
    ),
  }))
  .sort((a, b) => (a.ruta.includes('{') ? 1 : 0) - (b.ruta.includes('{') ? 1 : 0));

export function erroresFormulario(metodo, ruta, body) {
  const recurso = rutas.find((r) => r.patron.test('/' + ruta.split('?')[0]));
  const operacion = recurso?.operaciones[metodo.toLowerCase()];
  const esquema = operacion?.requestBody?.content?.['application/json']?.schema;
  if (!esquema) return [];
  const clave = metodo + recurso.ruta;
  let validar = validadores.get(clave);
  if (!validar) {
    validar = ajv.compile({ components: contrato.components, ...esquema });
    validadores.set(clave, validar);
  }
  if (validar(body)) return [];
  return validar.errors.map((e) => ({
    campo: e.instancePath || e.params.missingProperty || '',
    mensaje: e.keyword === 'required' ? 'Completa los campos obligatorios.' : 'Revisa el formato o valor del campo.',
  }));
}
