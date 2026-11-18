import { ESTADOS } from '../../../shared/helpers/mexico.js';
import { telefonoValido } from '../../../shared/helpers/validacion.js';
const CP = /^\d{5}$/;
export const MAX_DIRECCIONES = 10;

export const datosDireccion = (b) => ({
  alias: String(b.alias ?? '').trim(),
  destinatario: String(b.destinatario ?? '').trim(),
  telefono: String(b.telefono ?? '').trim(),
  calle: String(b.calle ?? '').trim(),
  num_ext: String(b.num_ext ?? '').trim(),
  num_int: String(b.num_int ?? '').trim() || null,
  colonia: String(b.colonia ?? '').trim(),
  cp: String(b.cp ?? '').trim(),
  municipio: String(b.municipio ?? '').trim(),
  estado: String(b.estado ?? '').trim(),
  referencias: String(b.referencias ?? '').trim() || null,
});

export function erroresDireccion(d) {
  const errs = [];
  const largo = (valor, max, etiqueta) => {
    if (!valor) errs.push(`${etiqueta} es obligatorio`);
    else if (valor.length > max) errs.push(`${etiqueta}: máximo ${max} caracteres`);
  };
  largo(d.alias, 30, 'El alias');
  largo(d.destinatario, 60, 'El destinatario');
  largo(d.calle, 80, 'La calle');
  largo(d.num_ext, 10, 'El número exterior');
  largo(d.colonia, 60, 'La colonia');
  largo(d.municipio, 60, 'El municipio');
  if (!d.estado) errs.push('Selecciona el estado');
  else if (!ESTADOS.includes(d.estado)) errs.push('El estado seleccionado no es válido');
  if (!telefonoValido(d.telefono)) errs.push('El teléfono debe tener entre 7 y 20 caracteres');
  if (!CP.test(d.cp)) errs.push('El código postal debe tener exactamente 5 dígitos');
  if (d.num_int && d.num_int.length > 10) errs.push('El número interior admite máximo 10 caracteres');
  if (d.referencias && d.referencias.length > 200) errs.push('Las referencias admiten máximo 200 caracteres');
  return errs;
}
