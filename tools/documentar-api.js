import { readFileSync, writeFileSync } from 'node:fs';
import YAML from 'yaml';
import { format } from 'prettier';

const contrato = YAML.parse(readFileSync(new URL('../contracts/openapi.yaml', import.meta.url), 'utf8'));
const lineas = [
  '# Referencia de Lonja API',
  '',
  'Generado desde `contracts/openapi.yaml` con `node tools/documentar-api.js`. No editar el inventario manualmente.',
  'Contrato completo: [OpenAPI 3.1](../../contracts/openapi.yaml).',
  '',
  'Versión ' +
    contrato.info.version +
    '. Prefijo `/api/v1`. Documentación interactiva en `/api/docs` únicamente en desarrollo.',
  '',
  'Las rutas privadas reciben `Authorization: Bearer <access>`. El access vence en 15 minutos; el refresh opaco vence a las ocho horas y rota una sola vez por uso. La API no autentica cookies.',
  '',
  'Colecciones: `{datos, meta: {pagina, tamano, total}}`; `tamano` máximo 100. Los importes son cadenas decimales y la moneda es MXN. Los errores usan `application/problem+json` y `X-Request-Id`.',
  '',
  '`Idempotency-Key` es obligatorio al crear pedidos, pagar y cobrar. Reutiliza la misma clave para el mismo intento; cambiar el cuerpo con esa clave devuelve 409. La edición de lotes y compras exige `If-Match` con el ETag de la lectura (428 si falta, 412 si cambió).',
  '',
  'El registro público crea compradores. Catálogo, compradores, ventas y reportes requieren personal; usuarios y operaciones administrativas requieren admin. Los recursos de una cuenta ajena responden 404. El contrato enumera 401/403; los permisos se comprueban siempre en el servidor.',
  '',
  '## Operaciones',
  '',
];
const resolver = (valor) => {
  if (!valor?.$ref) return valor;
  return valor.$ref
    .slice(2)
    .split('/')
    .reduce((objeto, clave) => objeto?.[clave], contrato);
};
for (const [ruta, item] of Object.entries(contrato.paths)) {
  lineas.push('### `' + ruta + '`', '');
  for (const [metodo, operacion] of Object.entries(item)) {
    if (!['get', 'post', 'put', 'patch', 'delete'].includes(metodo)) continue;
    const seguridad = operacion.security ?? contrato.security ?? [];
    const acceso = seguridad.length ? 'Bearer' : 'pública';
    lineas.push(
      `- **${metodo.toUpperCase()}** · ${acceso} · respuestas: ${Object.keys(operacion.responses).join(', ')}.`,
    );
    if (operacion.summary) lineas.push('  ' + operacion.summary);
    const parametros = [...(item.parameters || []), ...(operacion.parameters || [])].map(resolver);
    if (parametros.length)
      lineas.push(
        '  Parámetros: ' +
          parametros.map((p) => `\`${p.name}\` (${p.in}${p.required ? ', obligatorio' : ''})`).join(', ') +
          '.',
      );
    const cuerpo = resolver(operacion.requestBody);
    if (cuerpo) {
      lineas.push(
        `  Cuerpo ${cuerpo.required ? 'obligatorio' : 'opcional'}: ${Object.keys(cuerpo.content || {}).join(', ')}.`,
      );
      const esquema = resolver(cuerpo.content?.['application/json']?.schema);
      if (esquema?.properties)
        lineas.push(
          '  Campos JSON: ' +
            Object.keys(esquema.properties)
              .map((p) => `\`${p}\`${esquema.required?.includes(p) ? ' (obligatorio)' : ''}`)
              .join(', ') +
            '.',
        );
    }
  }
  lineas.push('');
}
const destino = new URL('../api/docs/03-rutas-y-permisos.md', import.meta.url);
const { prettier } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const contenido = await format(lineas.join('\n'), { ...prettier, parser: 'markdown' });
if (process.argv.includes('--check')) {
  if (readFileSync(destino, 'utf8').replaceAll('\r\n', '\n') !== contenido) {
    console.error('Referencia REST desactualizada. Ejecuta npm run docs:api.');
    process.exitCode = 1;
  } else console.log('Referencia REST vigente.');
} else {
  writeFileSync(destino, contenido);
  console.log('Referencia de API actualizada desde OpenAPI.');
}
