import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import YAML from 'yaml';
import { randomUUID } from 'node:crypto';
import { db, modelos } from './ayuda.js';
import app from '../app.js';
import { validarRespuesta } from './contrato.js';
import { fijarTransporteParaPruebas } from '../shared/helpers/email.js';
import { iniciarColaTrabajos, detenerColaTrabajos, esperarColaTrabajos } from '../shared/helpers/colaTrabajos.js';
import '../shared/helpers/procesadoresTrabajos.js';

const contrato = YAML.parse(readFileSync(new URL('../../contracts/openapi.yaml', import.meta.url), 'utf8'));
const rutas = Object.keys(contrato.paths).sort(
  (a, b) => b.replace(/\{[^}]+\}/g, '').length - a.replace(/\{[^}]+\}/g, '').length,
);
export function regresionRest({ preparar } = {}) {
  const contexto = {
    modelos,
    db,
    enviados: [],
    fallarCorreos: new Set(),
    usuarios: {},
    tokens: {},
    esperarCorreos: esperarColaTrabajos,
  };
  let servidor, base;
  contexto.pedir = async (metodo, ruta, cuerpo, { actor = 'admin', headers = {} } = {}) => {
    const respuesta = await fetch(base + ruta, {
      method: metodo,
      headers: {
        Accept: 'application/json',
        ...(actor && { Authorization: 'Bearer ' + contexto.tokens[actor] }),
        ...(cuerpo !== undefined && { 'Content-Type': 'application/json' }),
        ...headers,
      },
      ...(cuerpo !== undefined && { body: JSON.stringify(cuerpo) }),
    });
    const media = respuesta.headers.get('content-type') || '';
    const datos =
      respuesta.status === 204
        ? null
        : media.includes('pdf')
          ? Buffer.from(await respuesta.arrayBuffer())
          : media.includes('csv')
            ? await respuesta.text()
            : await respuesta.json();
    const pathname = ruta.split('?')[0];
    const plantilla = rutas.find((p) => new RegExp('^' + p.replace(/\{[^}]+\}/g, '[^/]+') + '$').test(pathname));
    assert.ok(plantilla, `Ruta documentada: ${metodo} ${pathname}`);
    validarRespuesta(metodo, plantilla, respuesta, Buffer.isBuffer(datos) ? datos.toString('base64') : datos);
    return { status: respuesta.status, datos, headers: respuesta.headers };
  };
  contexto.crearUsuario = async (nombre, cambios = {}) => {
    const codigo = randomUUID().slice(0, 8);
    const correo = `${nombre}-${codigo}@example.test`;
    const rol = cambios.rol || 'comprador';
    const comprador =
      rol === 'comprador' && cambios.codigo_cpr !== null
        ? await modelos.Comprador.create({ nombre, apellido_paterno: 'Regresión', correo })
        : null;
    return modelos.Usuario.create({
      usuario: nombre + '-' + codigo,
      nombre_completo: nombre + ' Regresión',
      correo,
      password: 'Regresion123',
      rol,
      email_verificado: true,
      recibir_avisos: false,
      ...(comprador && { codigo_cpr: comprador.codigo_cpr }),
      ...cambios,
    });
  };
  contexto.entrar = async (usuario, password = 'Regresion123') => {
    const r = await contexto.pedir('POST', '/auth/sesion', { usuario: usuario.usuario, password }, { actor: null });
    assert.equal(r.status, 200);
    return r.datos.access;
  };
  contexto.lote = async ({
    nombre = 'Pargo Regresión',
    kilos = 10,
    precio = '20.00',
    tipo,
    fecha,
    especies = 1,
  } = {}) => {
    tipo ||= await modelos.Tipo.create({ nombre: 'Tipo ' + randomUUID().slice(0, 6) });
    const catalogo = await modelos.EspecieCatalogo.create({
      nombre: nombre + ' ' + randomUUID().slice(0, 5),
      id_tpo: tipo.id_tpo,
    });
    const lote = await modelos.Lote.create({
      kilos,
      numero_cajas: 1,
      precio_kilo_salida: precio,
      ...(fecha && { fecha }),
    });
    for (let i = 0; i < especies; i++)
      await modelos.Especie.create({
        id_lte: lote.id_lte,
        id_cat: catalogo.id_cat,
        id_tpo: tipo.id_tpo,
        nombre: catalogo.nombre + (i ? ' ' + i : ''),
      });
    return { lote, catalogo, tipo };
  };
  contexto.comprar = async (lote, usuario = contexto.usuarios.comprador) => {
    await contexto.pedir('POST', '/carrito/items', { id_lte: lote.id_lte }, { actor: 'comprador' });
    const creado = await contexto.pedir(
      'POST',
      '/pedidos',
      { entrega: 'recoger' },
      { actor: 'comprador', headers: { 'Idempotency-Key': randomUUID() } },
    );
    assert.equal(creado.status, 201);
    assert.equal(creado.datos.datos.id_usuario, usuario.id);
    const pagado = await contexto.pedir(
      'POST',
      `/pedidos/${creado.datos.datos.id_ped}/pago`,
      { metodo: 'transferencia' },
      { actor: 'comprador', headers: { 'Idempotency-Key': randomUUID() } },
    );
    assert.equal(pagado.status, 200);
    return pagado.datos.datos;
  };
  before(async () => {
    process.env.CLIENTE_URL = 'https://cliente.regresion.test';
    await db.sync({ force: true });
    fijarTransporteParaPruebas({
      async sendMail(datos) {
        if (contexto.fallarCorreos.has(datos.to)) throw new Error('SMTP de prueba no disponible');
        contexto.enviados.push(datos);
        return { messageId: 'regresion-' + contexto.enviados.length };
      },
    });
    servidor = app.listen(0);
    base = `http://127.0.0.1:${servidor.address().port}/api/v1`;
    for (const rol of ['admin', 'capturista', 'comprador']) {
      contexto.usuarios[rol] = await contexto.crearUsuario('reg-' + rol, { rol });
      contexto.tokens[rol] = await contexto.entrar(contexto.usuarios[rol]);
    }
    await iniciarColaTrabajos();
    if (preparar) await preparar(contexto);
  });
  after(async () => {
    await detenerColaTrabajos();
    fijarTransporteParaPruebas(null);
    if (servidor) await new Promise((resolve) => servidor.close(resolve));
    await db.close();
  });
  return contexto;
}
