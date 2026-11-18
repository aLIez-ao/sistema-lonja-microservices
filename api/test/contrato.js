import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import YAML from 'yaml';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const contrato = YAML.parse(readFileSync(new URL('../../contracts/openapi.yaml', import.meta.url), 'utf8'));
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema({ $id: 'lonja', components: contrato.components });

export function validarRespuesta(metodo, ruta, respuesta, cuerpo) {
  const operacion = contrato.paths[ruta]?.[metodo.toLowerCase()];
  assert.ok(operacion, `${metodo} ${ruta} debe estar documentado`);
  let definida = operacion.responses[respuesta.status];
  assert.ok(definida, `Estado ${respuesta.status} documentado`);
  if (definida.$ref) definida = contrato.components.responses[definida.$ref.split('/').at(-1)];
  if (respuesta.status === 204) return;
  const tipo = respuesta.headers.get('content-type').split(';')[0];
  assert.ok(definida.content?.[tipo], `Tipo ${tipo} documentado`);
  const esquema = definida.content[tipo].schema;
  const validar = esquema.$ref ? ajv.getSchema('lonja' + esquema.$ref) : ajv.compile(esquema);
  assert.ok(validar(cuerpo), JSON.stringify(validar.errors));
  if (respuesta.status >= 400) assert.equal(cuerpo.status, respuesta.status);
}
