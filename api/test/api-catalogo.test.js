import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { db, modelos } from './ayuda.js';
const { default: app } = await import('../app.js');
import { crearAdministradorInicial } from '../modules/accounts/index.js';
import { validarRespuesta } from './contrato.js';
import sharp from 'sharp';

let servidor, base, access, tipo, catalogo, lote;
before(async () => {
  await db.sync({ force: true });
  await crearAdministradorInicial();
  servidor = app.listen(0);
  base = `http://127.0.0.1:${servidor.address().port}/api/v1`;
  const login = await fetch(base + '/auth/sesion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: 'admin', password: 'AdminPrueba123' }),
  });
  access = (await login.json()).access;
});
after(async () => {
  await new Promise((resolve) => servidor.close(resolve));
  await db.close();
});

async function pedir(metodo, ruta, datos, extras = {}) {
  const r = await fetch(base + ruta, {
    method: metodo,
    headers: { Authorization: `Bearer ${access}`, ...(datos && { 'Content-Type': 'application/json' }), ...extras },
    ...(datos && { body: JSON.stringify(datos) }),
  });
  const cuerpo = r.status === 204 ? null : await r.json();
  const contratoRuta = ruta.split('?')[0].replace(/\/\d+(?=\/|$)/g, '/{id}');
  validarRespuesta(metodo, contratoRuta, r, cuerpo);
  return { r, cuerpo };
}

test('CRUD de tipos y catálogo devuelve Location, datos y paginación conforme al contrato', async () => {
  const t = await pedir('POST', '/tipos', { nombre: 'Pescado API' });
  assert.equal(t.r.status, 201);
  tipo = t.cuerpo.datos;
  assert.equal(t.r.headers.get('location'), `/api/v1/tipos/${tipo.id_tpo}`);
  const c = await pedir('POST', '/catalogo', { nombre: 'Sierra API', id_tpo: tipo.id_tpo });
  assert.equal(c.r.status, 201);
  catalogo = c.cuerpo.datos;
  assert.equal((await pedir('POST', '/catalogo', { nombre: 'sierra api', id_tpo: tipo.id_tpo })).r.status, 409);
  assert.equal((await pedir('POST', '/tipos', { nombre: 'Inválido', extra: true })).r.status, 422);
  assert.equal((await pedir('GET', '/catalogo?tamano=1')).cuerpo.meta.total, 1);
  assert.equal((await pedir('GET', '/catalogo?tamano=999')).r.status, 422);
});

test('lotes conservan especies del catálogo y exigen If-Match actualizado', async () => {
  const creado = await pedir('POST', '/lotes', {
    kilos: 10,
    numero_cajas: 1,
    precio_kilo_salida: '20.50',
    especies: [catalogo.id_cat],
  });
  assert.equal(creado.r.status, 201);
  lote = creado.cuerpo.datos;
  assert.equal(lote.precio_kilo_salida, '20.50');
  assert.equal(lote.especies[0].nombre, catalogo.nombre);
  assert.equal((await pedir('PATCH', `/lotes/${lote.id_lte}`, { kilos: 12 })).r.status, 428);
  const actualizado = await pedir(
    'PATCH',
    `/lotes/${lote.id_lte}`,
    { kilos: 12 },
    { 'If-Match': creado.r.headers.get('etag') },
  );
  assert.equal(actualizado.r.status, 200);
  assert.equal(Number(actualizado.cuerpo.datos.kilos), 12);
  assert.equal(
    (await pedir('PATCH', `/lotes/${lote.id_lte}`, { kilos: 13 }, { 'If-Match': creado.r.headers.get('etag') })).r
      .status,
    412,
  );
  assert.equal(
    (
      await pedir(
        'PATCH',
        `/lotes/${lote.id_lte}`,
        { precio_kilo_salida: '-1' },
        { 'If-Match': actualizado.r.headers.get('etag') },
      )
    ).r.status,
    422,
  );
});

test('la tienda solo publica datos de lotes disponibles y cumple el contrato', async () => {
  const lista = await pedir('GET', '/tienda/lotes');
  assert.equal(lista.cuerpo.datos.length, 1);
  assert.equal(lista.cuerpo.meta.total, 1);
  assert.equal((await pedir('GET', `/tienda/lotes/${lote.id_lte}`)).r.status, 200);
  assert.equal((await pedir('GET', '/tienda/sugerencias?q=Sierra')).cuerpo.datos[0].id, lote.id_lte);
});

test('especies rechazan duplicados y lotes vendidos; tipos en uso responden 409', async () => {
  assert.equal((await pedir('POST', '/especies', { id_lte: lote.id_lte, id_cat: catalogo.id_cat })).r.status, 409);
  assert.equal((await pedir('DELETE', `/tipos/${tipo.id_tpo}`)).r.status, 409);
  const comprador = await modelos.Comprador.create({
    nombre: 'Cliente',
    apellido_paterno: 'API',
    correo: 'cliente-api@example.com',
    telefono: '2291234567',
  });
  await modelos.Compra.create({
    id_cmp: lote.id_lte,
    codigo_cpr: comprador.codigo_cpr,
    precio_kilo_final: '20.50',
    precio_total: '246.00',
  });
  const actual = await pedir('GET', `/lotes/${lote.id_lte}`);
  assert.equal(
    (await pedir('PATCH', `/lotes/${lote.id_lte}`, { kilos: 14 }, { 'If-Match': actual.r.headers.get('etag') })).r
      .status,
    409,
  );
  assert.equal((await pedir('DELETE', `/lotes/${lote.id_lte}`)).r.status, 409);
  assert.equal((await pedir('DELETE', `/especies/${lote.especies[0].id_epe}`)).r.status, 409);
  assert.equal((await pedir('GET', '/tienda/lotes')).cuerpo.datos.length, 0);
});

test('autorización aplica a las rutas del catálogo y el comprador recibe 403', async () => {
  const sinToken = await fetch(base + '/tipos');
  assert.equal(sinToken.status, 401);
  await modelos.Usuario.create({
    usuario: 'comprador-api',
    nombre_completo: 'Comprador API',
    password: 'Comprador123',
    rol: 'comprador',
  });
  const r = await fetch(base + '/auth/sesion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: 'comprador-api', password: 'Comprador123' }),
  });
  const datos = await r.json();
  const prohibido = await fetch(base + '/tipos', { headers: { Authorization: `Bearer ${datos.access}` } });
  assert.equal(prohibido.status, 403);
});

test('imágenes de catálogo multipart y data URL se recodifican sin EXIF y conservan proporciones', async () => {
  const original = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: '#456789' } })
    .jpeg()
    .withExif({ IFD0: { Artist: 'dato privado', ImageDescription: 'metadatos privados' } })
    .toBuffer();
  assert.ok((await sharp(original).metadata()).exif);
  const ruta = `/catalogo/${catalogo.id_cat}/imagen`;
  const formulario = new FormData();
  formulario.set('imagen', new Blob([original], { type: 'image/jpeg' }), 'foto.jpg');
  const r = await fetch(base + ruta, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${access}` },
    body: formulario,
  });
  const cuerpo = await r.json();
  validarRespuesta('PUT', '/catalogo/{id}/imagen', r, cuerpo);
  assert.equal(r.status, 200);
  const imagen = await fetch(base + '/archivos' + cuerpo.datos.imagen.replace('/uploads', ''));
  assert.equal(imagen.status, 200);
  const comprobar = async (respuesta) => {
    assert.equal(respuesta.headers.get('content-type'), 'image/webp');
    const metadatos = await sharp(Buffer.from(await respuesta.arrayBuffer())).metadata();
    assert.equal(metadatos.width, 1600);
    assert.equal(metadatos.height, 800);
    assert.equal(metadatos.exif, undefined);
    assert.equal(metadatos.xmp, undefined);
    assert.equal(metadatos.orientation, undefined);
  };
  await comprobar(imagen);
  const data = await pedir('PUT', ruta, { imagen_data: 'data:image/jpeg;base64,' + original.toString('base64') });
  assert.equal(data.r.status, 200);
  await comprobar(await fetch(base + '/archivos' + data.cuerpo.datos.imagen.replace('/uploads', '')));
  const falsa = await pedir('PUT', ruta, { imagen_data: 'data:image/png;base64,YXJjaGl2byBmYWxzbw==' });
  assert.equal(falsa.r.status, 400);
});
