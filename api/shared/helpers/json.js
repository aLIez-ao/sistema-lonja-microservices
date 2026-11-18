const importes = new Set([
  'precio_kilo_salida',
  'precio_kilo_final',
  'precio_total',
  'precio_kilo',
  'subtotal',
  'costo_envio',
  'envio',
  'precio_salida',
  'precio_final',
  'precioPromedio',
  'precioMedio',
]);
const totalMonetario = (obj) =>
  obj &&
  typeof obj === 'object' &&
  (obj.id_ped !== undefined ||
    obj.id_lte !== undefined ||
    obj.precio_final !== undefined ||
    obj.precioPromedio !== undefined ||
    obj.precioMedio !== undefined ||
    (obj.kilos !== undefined && obj.compras !== undefined) ||
    Array.isArray(obj.compras) ||
    (obj.nombre !== undefined && obj.id_lista === undefined && obj.id_tpo === undefined));

/** Los conteos de meta/listas siguen siendo enteros; solo se convierten importes. */
export function jsonApi(clave, valor) {
  if (typeof valor === 'number' && (importes.has(clave) || (clave === 'total' && totalMonetario(this))))
    return valor.toFixed(2);
  if (
    valor &&
    typeof valor === 'object' &&
    !Array.isArray(valor) &&
    !Object.hasOwn(valor, 'moneda') &&
    Object.keys(valor).some((k) => importes.has(k) && valor[k] !== null)
  )
    return { ...valor, moneda: 'MXN' };
  return valor;
}
