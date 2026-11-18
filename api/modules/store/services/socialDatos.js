import * as consultas from './socialConsultas.js';
import { prepararLote, imagenDeEspecie } from '../../../shared/helpers/tiendaVista.js';
import { disponibilidadDeLotes } from '../../catalog/index.js';
import { ESTADO_PEDIDO } from '../../../models/Pedido.js';
import { ErrorDeUsuario } from '../../../shared/helpers/utiles.js';
export async function datosListas(usuario) {
  const favoritas = await consultas.favoritas_findOne(usuario);
  if (!favoritas) await consultas.consulta_create(usuario);
  const filas = await consultas.filas_findAll(usuario);
  const items = filas.flatMap((lista) => lista.items || []);
  const idsLotes = items.filter((item) => item.tipo === 'lote').map((item) => item.id_ref);
  const idsEspecies = items.filter((item) => item.tipo === 'especie').map((item) => item.id_ref);
  const [lotes, especies] = await Promise.all([
    idsLotes.length ? consultas.consulta_findAll(idsLotes) : [],
    idsEspecies.length ? consultas.consulta_findAll2(idsEspecies) : [],
  ]);
  const elementos = new Map([
    ...lotes.map((lote) => [`lote:${lote.id_lte}`, lote]),
    ...especies.map((especie) => [`especie:${especie.id_cat}`, especie]),
  ]);
  const listas = filas.map((lista) => {
    const listaItems = lista.items || [];
    const vistaPrevia = listaItems.slice(0, 3).flatMap((item) => {
      const elemento = elementos.get(`${item.tipo}:${item.id_ref}`);
      if (!elemento) return [];
      const plain = typeof elemento.get === 'function' ? elemento.get({ plain: true }) : elemento;
      return [
        {
          tipo: item.tipo,
          nombre: item.tipo === 'lote' ? `Lote #${plain.id_lte}` : plain.nombre,
          imagen: item.tipo === 'lote' ? prepararLote(plain).imagen : plain.imagen || imagenDeEspecie(plain),
        },
      ];
    });
    return { ...lista.get({ plain: true }), total: listaItems.length, vistaPrevia };
  });
  return { listas };
}

export async function datosLista(usuario, id) {
  const lista = await consultas.lista_findOne({ id }, usuario);
  if (!lista) throw new ErrorDeUsuario('No encontramos esa lista.', 404);
  const items = await consultas.items_findAll(lista);
  const idsLotes = [...new Set(items.filter((item) => item.tipo === 'lote').map((item) => Number(item.id_ref)))];
  const idsEspecies = [...new Set(items.filter((item) => item.tipo === 'especie').map((item) => Number(item.id_ref)))];
  const [lotes, especies, disponibilidad] = await Promise.all([
    idsLotes.length ? consultas.consulta_findAll3(idsLotes) : [],
    idsEspecies.length ? consultas.consulta_findAll4(idsEspecies) : [],
    disponibilidadDeLotes(idsLotes, { usuarioId: usuario.id }),
  ]);
  const elementos = new Map([
    ...lotes.map((lote) => [`lote:${lote.id_lte}`, lote]),
    ...especies.map((especie) => [`especie:${especie.id_cat}`, especie]),
  ]);
  const datos = items.map((i) => {
    const elemento = elementos.get(`${i.tipo}:${i.id_ref}`);
    if (!elemento) return null;
    const loteState = i.tipo === 'lote' ? disponibilidad.get(Number(i.id_ref)) : null;
    const plain = typeof elemento.get === 'function' ? elemento.get({ plain: true }) : elemento;
    const publico = { ...plain };
    delete publico.compra;
    const vista =
      i.tipo === 'lote' ? prepararLote(publico) : { ...publico, imagen: plain.imagen || imagenDeEspecie(plain) };
    return {
      tipo: i.tipo,
      elemento: vista,
      vendido: i.tipo === 'lote' && (Boolean(plain.compra) || loteState?.motivo === 'vendido'),
      reservado: i.tipo === 'lote' && ['reservado', 'reservado_propio'].includes(loteState?.motivo),
      disponible: i.tipo === 'lote' && !loteState?.motivo,
      especieDesactivada: i.tipo === 'especie' && !plain.activo,
    };
  });
  return { lista, items: datos.filter(Boolean) };
}

export async function datosOpiniones(usuario) {
  const opiniones = await consultas.opiniones_findAll(usuario);
  const compras = usuario.codigo_cpr ? await consultas.compras_findAll(usuario) : [];
  const estadosPagados = new Set([
    ESTADO_PEDIDO.PAGADO,
    ESTADO_PEDIDO.PREPARANDO,
    ESTADO_PEDIDO.ENVIADO,
    ESTADO_PEDIDO.ENTREGADO,
  ]);
  const yaOpino = new Set(opiniones.map((o) => Number(o.id_cat)));
  const pendientes = new Map();
  for (const compra of compras) {
    if (compra.id_ped && !estadosPagados.has(compra.pedido?.estado)) continue;
    for (const especie of compra.lote?.especies || []) {
      const ficha = especie.catalogo;
      if (ficha && !yaOpino.has(Number(ficha.id_cat))) pendientes.set(Number(ficha.id_cat), ficha);
    }
  }
  return { opiniones, pendientes: [...pendientes.values()] };
}
