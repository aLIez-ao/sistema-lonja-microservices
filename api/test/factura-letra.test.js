import test from 'node:test';
import assert from 'node:assert/strict';
import { importeConLetra } from '../shared/helpers/factura.js';

test('el importe con letra cubre apócopes, cientos y millones', () => {
  const casos = {
    0: 'CERO PESOS 00/100 M.N.',
    1: 'UN PESO 00/100 M.N.',
    21: 'VEINTIÚN PESOS 00/100 M.N.',
    100: 'CIEN PESOS 00/100 M.N.',
    101.5: 'CIENTO UN PESOS 50/100 M.N.',
    1000: 'MIL PESOS 00/100 M.N.',
    10906: 'DIEZ MIL NOVECIENTOS SEIS PESOS 00/100 M.N.',
    21000: 'VEINTIÚN MIL PESOS 00/100 M.N.',
    1000000: 'UN MILLÓN DE PESOS 00/100 M.N.',
    2345678.99: 'DOS MILLONES TRESCIENTOS CUARENTA Y CINCO MIL SEISCIENTOS SETENTA Y OCHO PESOS 99/100 M.N.',
    1000000000: 'MIL MILLONES DE PESOS 00/100 M.N.',
    9999999999.99:
      'NUEVE MIL NOVECIENTOS NOVENTA Y NUEVE MILLONES NOVECIENTOS NOVENTA Y NUEVE MIL NOVECIENTOS NOVENTA Y NUEVE PESOS 99/100 M.N.',
  };
  for (const [importe, esperado] of Object.entries(casos)) assert.equal(importeConLetra(Number(importe)), esperado);
});

test('rechaza importes inválidos o fuera del rango de la columna monetaria', () => {
  for (const importe of [-1, NaN, Infinity, 10000000000]) assert.throws(() => importeConLetra(importe), RangeError);
});
