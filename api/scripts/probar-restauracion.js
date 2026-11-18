import '../shared/config/entorno.js';
import mariadb from 'mariadb';
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, cp, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

// El esquema de origen solo se lee. El esquema de ensayo nunca se reutiliza.
const origen = process.env.BD_NOMBRE;
const destino = `lonja_restore_${Date.now()}`;
const temporal = await mkdtemp(path.join(os.tmpdir(), 'lonja-restore-'));
function ejecutar(binario, args, env, entrada) {
  return new Promise((resolve, reject) => {
    const hijo = spawn(binario, args, { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let error = '';
    hijo.stderr.on('data', (d) => {
      error += d;
    });
    hijo.stdout.resume();
    hijo.on('error', reject);
    hijo.on('close', (codigo) => (codigo === 0 ? resolve() : reject(new Error(`${binario}: ${error}`))));
    hijo.stdin.on('error', reject);
    hijo.stdin.end(entrada);
  });
}
async function archivos(dir, prefijo = '') {
  const resultado = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const nombre = path.join(prefijo, e.name);
    if (e.isDirectory()) resultado.push(...(await archivos(path.join(dir, e.name), nombre)));
    else
      resultado.push([
        nombre,
        createHash('sha256')
          .update(await readFile(path.join(dir, e.name)))
          .digest('hex'),
      ]);
  }
  return resultado.sort((a, b) => a[0].localeCompare(b[0]));
}
const conexion = await mariadb.createConnection({
  host: process.env.BD_HOST,
  port: Number(process.env.BD_PORT || 3306),
  user: process.env.BD_USUARIO,
  password: process.env.BD_CLAVE,
});
const restauracion = await mariadb.createConnection({
  host: process.env.RESTORE_HOST || process.env.BD_HOST,
  port: Number(process.env.RESTORE_PORT || process.env.BD_PORT || 3306),
  user: process.env.RESTORE_USUARIO || process.env.BD_USUARIO,
  password: process.env.RESTORE_USUARIO ? process.env.RESTORE_CLAVE || '' : process.env.BD_CLAVE,
});
let creado = false;
try {
  const version = (await conexion.query('SELECT VERSION() AS version'))[0].version;
  // Detén escrituras de la aplicación durante el ensayo para comparar filas exactamente.
  const tablas = (
    await conexion.query(
      'SELECT TABLE_NAME AS nombre FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = ?',
      [origen, 'BASE TABLE'],
    )
  ).map((t) => t.nombre);
  if (!tablas.length) throw new Error('La base de origen no contiene tablas.');
  const contar = async (base) => {
    const filas = {};
    for (const tabla of tablas)
      filas[tabla] = String(
        (
          await conexion.query(`SELECT COUNT(*) AS total FROM ${conexion.escapeId(base)}.${conexion.escapeId(tabla)}`)
        )[0].total,
      );
    return filas;
  };
  const antes = await contar(origen);
  await ejecutar(process.execPath, ['scripts/backup.js'], { ...process.env, BACKUP_DIR: temporal });
  const conjunto = (await readdir(temporal)).find((n) => n.startsWith('lonja-'));
  if (!conjunto) throw new Error('No se creó un conjunto de respaldo.');
  const respaldo = path.join(temporal, conjunto);
  await restauracion.query(
    `CREATE DATABASE ${conexion.escapeId(destino)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  creado = true;
  await ejecutar(
    process.env.MARIADB_CLIENT || 'mariadb',
    [
      ...(process.env.MARIADB_SSL === 'off' ? ['--skip-ssl'] : []),
      '--host',
      process.env.RESTORE_HOST || process.env.BD_HOST || '127.0.0.1',
      '--port',
      process.env.RESTORE_PORT || process.env.BD_PORT || '3306',
      '--user',
      process.env.RESTORE_USUARIO || process.env.BD_USUARIO,
      destino,
    ],
    { ...process.env, MYSQL_PWD: process.env.RESTORE_USUARIO ? process.env.RESTORE_CLAVE || '' : process.env.BD_CLAVE },
    await readFile(path.join(respaldo, 'database.sql')),
  );
  const despues = {};
  for (const tabla of tablas)
    despues[tabla] = String(
      (
        await restauracion.query(
          `SELECT COUNT(*) AS total FROM ${conexion.escapeId(destino)}.${conexion.escapeId(tabla)}`,
        )
      )[0].total,
    );
  if (JSON.stringify(antes) !== JSON.stringify(despues)) throw new Error('Los conteos de filas no coinciden.');
  const directorioOriginal = path.resolve(process.env.UPLOADS_DIR || path.join(process.cwd(), 'storage', 'uploads'));
  const restaurados = path.join(temporal, 'uploads-restaurados');
  await mkdir(restaurados);
  await cp(path.join(respaldo, 'uploads'), restaurados, { recursive: true });
  const hashes = await archivos(directorioOriginal);
  if (JSON.stringify(hashes) !== JSON.stringify(await archivos(restaurados)))
    throw new Error('Los archivos restaurados no coinciden.');
  console.log(
    JSON.stringify(
      {
        version,
        tablas: tablas.length,
        filas: despues,
        archivos: hashes.length,
        resultado: 'restauración verificada',
        respaldoConservado: respaldo,
      },
      null,
      2,
    ),
  );
} finally {
  if (creado) await restauracion.query(`DROP DATABASE ${conexion.escapeId(destino)}`);
  await restauracion.end();
  await conexion.end();
}
