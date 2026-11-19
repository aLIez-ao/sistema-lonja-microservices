import { registro } from './shared/helpers/registro.js';
import './shared/config/entorno.js';
import db from './shared/config/db.js';
import './models/index.js';
import Sesion from './models/Sesion.js';
import { Op } from 'sequelize';
import app from './app.js';
import { crearAdministradorInicial, crearTiposIniciales } from './modules/accounts/index.js';
import { asegurarEsquema, comprobarEsquema } from './migrations/ejecutor.js';
import { verificarCorreoInicio, verificarTransporte, estadoCorreo } from './shared/helpers/email.js';
import { liberarPedidosVencidos } from './modules/orders/index.js';
import { validarSecretosInicio } from './shared/config/validacionSecretos.js';
import { detenerColaTrabajos, iniciarColaTrabajos } from './shared/helpers/colaTrabajos.js';
import './shared/helpers/procesadoresTrabajos.js';

const port = process.env.API_PORT || 2900;
let servidor;
let barridoReservas;

const apagar = (senal) => {
  if (!servidor) return;
  clearInterval(barridoReservas);
  servidor.close(async (error) => {
    if (error) {
      registro.error(`Error al cerrar el servidor tras ${senal}:`, error);
      process.exitCode = 1;
    }
    try {
      await detenerColaTrabajos();
      await db.close();
    } catch (errorDb) {
      registro.error('Error al cerrar la conexión a la base de datos:', errorDb);
      process.exitCode = 1;
    }
  });
};

process.once('SIGINT', () => apagar('SIGINT'));
process.once('SIGTERM', () => apagar('SIGTERM'));

(async () => {
  try {
    const validacion = validarSecretosInicio();
    for (const aviso of validacion.avisos) registro.warn(`Configuración de seguridad: ${aviso}`);
    if (validacion.errores.length)
      throw new Error(`Configuración de seguridad inválida: ${validacion.errores.join(' ')}`);
    await db.authenticate();
    registro.info('Conexión a la base de datos establecida.');

    // BD_SYNC: safe (solo crea lo que falta) | alter | force (borra todo)
    const modo = process.env.BD_SYNC || 'safe';
    if (process.env.NODE_ENV === 'production' && ['alter', 'force'].includes(modo)) {
      throw new Error('BD_SYNC=alter/force está prohibido en producción.');
    }
    if (process.env.NODE_ENV === 'production') await comprobarEsquema();
    else {
      await db.sync(modo === 'force' ? { force: true } : modo === 'alter' ? { alter: true } : {});
      await asegurarEsquema();
      registro.info(`Modelos sincronizados (${modo}).`);
    }
    const correo = await verificarCorreoInicio();
    await iniciarColaTrabajos({ esperar: false });
    await crearAdministradorInicial();
    await crearTiposIniciales();

    // Producción rechaza simulación y errores permanentes; los transitorios se reintentan.
    if (correo.configurado && !correo.error) registro.info('Correo configurado');
    else if (correo.error) registro.warn('Correo temporalmente degradado; se reintentará', { error: correo.error });
    else registro.warn('Correo no configurado; se usará el simulador');

    barridoReservas = setInterval(() => {
      if (estadoCorreo().disponible === false) {
        verificarTransporte()
          .then((resultado) => {
            if (resultado.configurado && !resultado.error) registro.info('Transporte de correo recuperado');
          })
          .catch(() => registro.warn('No se pudo comprobar el transporte de correo'));
      }
      liberarPedidosVencidos().catch((error) =>
        registro.warn('No se pudieron limpiar reservas vencidas:', error.message),
      );
      Sesion.destroy({ where: { expira: { [Op.lte]: new Date() } } }).catch((error) =>
        registro.warn('No se pudieron limpiar sesiones vencidas', { error }),
      );
    }, 60_000);
    barridoReservas.unref();

    servidor = app.listen(port, () => {
      registro.info(`Servidor corriendo en \x1b[36mhttp://localhost:${port}\x1b[0m`);
    });
  } catch (err) {
    registro.error('Error al iniciar:', err);
    process.exit(1);
  }
})();
