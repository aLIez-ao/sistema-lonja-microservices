import { createClient } from 'redis';
import { randomUUID } from 'node:crypto';
import { ErrorApi } from './api.js';
import { registro } from './helpers/registro.js';

const liberar = "if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0";
const confirmar =
  "if redis.call('GET',KEYS[1]) == ARGV[1] and redis.call('EXISTS',KEYS[2]) == 1 then redis.call('SET',KEYS[2],ARGV[2],'PX',ARGV[3]);return 1 end return 0";
const usuario =
  "local s=redis.call('GET',KEYS[1]);if not s then return 0 end;local d=cjson.decode(s);d.usuario=cjson.decode(ARGV[1]);redis.call('SET',KEYS[1],cjson.encode(d),'KEEPTTL');return 1";

/** Un Redis compartido coordina sesiones y renovación entre procesos del cliente. */
export async function crearAlmacenRedis(url, { prefix = 'lonja:sesion:' } = {}) {
  const redis = createClient({ url, disableOfflineQueue: true, socket: { connectTimeout: 5000 } });
  redis.on('error', (error) => registro.error('Almacén de sesiones no disponible', { error }));
  await redis.connect();
  const key = (id) => prefix + id;
  const get = async (id) => {
    const texto = await redis.get(key(id));
    return texto ? JSON.parse(texto) : null;
  };
  return {
    get,
    async set(id, sesion) {
      await redis.set(key(id), JSON.stringify(sesion), { PX: Math.max(1, sesion.expira - Date.now()) });
    },
    delete: (id) => redis.del(key(id)),
    usuario: (id, datos) => redis.eval(usuario, { keys: [key(id)], arguments: [JSON.stringify(datos)] }),
    ping: () => redis.ping(),
    cerrar: () => redis.close(),
    async rotar(id, refreshEsperado, renovar) {
      const lock = key(id) + ':lock';
      const owner = randomUUID();
      const limite = Date.now() + 22000;
      while ((await redis.set(lock, owner, { NX: true, PX: 20000 })) !== 'OK') {
        if (Date.now() >= limite) throw new ErrorApi(503);
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
      try {
        const actual = await get(id);
        if (!actual || actual.expira <= Date.now()) throw new ErrorApi(401);
        if (actual.refresh !== refreshEsperado) return actual;
        const resultado = { ...actual, ...(await renovar(actual.refresh)) };
        const guardado = await redis.eval(confirmar, {
          keys: [lock, key(id)],
          arguments: [owner, JSON.stringify(resultado), String(Math.max(1, resultado.expira - Date.now()))],
        });
        if (guardado !== 1) throw new ErrorApi(401);
        return resultado;
      } finally {
        await redis.eval(liberar, { keys: [lock], arguments: [owner] });
      }
    },
  };
}
