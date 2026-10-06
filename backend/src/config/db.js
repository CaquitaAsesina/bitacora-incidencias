// backend/src/config/db.js
//
// Configuración de MySQL para el backend.
//
// Este archivo absorbe lo que antes vivía en ./mysqlSSL.js:
//   1. Cálculo de las opciones TLS a partir de las variables de entorno.
//   2. Parche del SSL Request de mysql2 (efecto secundario necesario para
//      que el handshake TLS funcione contra Aiven).
//   3. Creación del pool y helpers de transacción.
//
// El parche DEBE aplicarse antes de crear el pool, por eso el orden de las
// secciones de abajo no es arbitrario.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

// Cargamos el .env aquí mismo: server.js puede importar este módulo antes
// de que cualquier otro haya llamado a dotenv.config().
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ_BACKEND = path.resolve(__dirname, '../..');

// Perú es UTC-5 todo el año (no aplica horario de verano).
// MySQL2 no acepta "America/Lima"; debe ser un offset numérico.
const ZONA_HORARIA_OFFSET = '-05:00';

/**
 * ============================================================================
 *  1. Opciones TLS del pool (exportadas como `sslOptions`)
 * ============================================================================
 *
 * El backend se conecta a MySQL gestionado en Aiven, que exige TLS y solo
 * acepta clientes con la CA del proyecto. Sin `ssl`, mysql2 hace el handshake
 * en claro y Aiven lo corta: la app nunca conecta.
 *
 * Variables de entorno:
 *   DB_SSL                       "true"/"1" activa TLS (por defecto desactivado,
 *                                para no romper el MySQL local de desarrollo)
 *   DB_SSL_CA                    ruta al CA, relativa a backend/ (default certs/ca.pem)
 *   DB_SSL_REJECT_UNAUTHORIZED   "false" desactiva la verificación de la CA
 */

// TLS activo por defecto salvo que DB_SSL sea un valor "off" explícito.
// Acepta true/1/yes o el marcador REQUIRED que usa el .env de Aiven.
const valorSSL = (process.env.DB_SSL || '').toLowerCase();
const SSL_ACTIVADO = ['', 'false', '0', 'no', 'off'].indexOf(valorSSL) === -1;

const RUTA_CA = path.resolve(
  RAIZ_BACKEND,
  process.env.DB_SSL_CA || 'certs/ca.pem'
);

export const sslOptions = SSL_ACTIVADO
  ? {
      ca: fs.readFileSync(RUTA_CA),
      rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
      verifyIdentity: true,
    }
  : undefined;

/**
 * ============================================================================
 *  2. Parche del SSL Request de mysql2
 * ============================================================================
 *
 * Aiven NO completa el handshake TLS si el paquete SSL Request (36 bytes)
 * llega en un solo segmento TCP: el servidor no responde jamás y la conexión
 * queda muda (timeout a los 10 s). El mismo comando con dos segmentos, con
 * o sin retardo entre ellos, funciona a la primera. Lo mismo ocurre con el
 * cliente oficial `mysql`, por lo que no es un bug de mysql2 sino del
 * front-end de Aiven (lee una sola vez por evento y no vuelve a leer el resto
 * del paquete cuando completo llega en la misma lectura).
 *
 * Fix: enviar el SSL Request en dos `write()` (cabecera de 4 bytes + payload
 * de 32 bytes). Ambos se escriben de forma síncrona y seguida, así que el
 * ClientHello que mysql2 escribe después conserva el orden original.
 *
 * El parche solo actúa sobre el SSL Request (el único paquete de 36 bytes que
 * viaja con sequence-id 1 y la flag CLIENT_SSL); el resto de paquetes sigue
 * el camino original sin cambios.
 */

const require = createRequire(import.meta.url);
const mysqlBase = require('mysql2');

const CLIENT_SSL = 0x800;
const escribirPacketOriginal = mysqlBase.Connection.prototype.writePacket;

mysqlBase.Connection.prototype.writePacket = function escribirPacket(packet) {
  const esSolicitudSSL =
    this.config.ssl &&
    this.sequenceId === 1 &&
    packet.length() === 36 &&
    packet.buffer.length === 36 &&
    (packet.buffer.readUInt32LE(4) & CLIENT_SSL) !== 0;

  if (!esSolicitudSSL) {
    return escribirPacketOriginal.call(this, packet);
  }

  // writeHeader escribe [3 bytes de longitud][sequence-id] en el offset 0
  // del buffer, así que el corte en 4 bytes separa cabecera y payload sin
  // tocar el contenido del paquete.
  packet.writeHeader(this.sequenceId);
  this._bumpSequenceId(1);
  this.write(packet.buffer.subarray(0, 4));
  this.write(packet.buffer.subarray(4));
};

/**
 * ============================================================================
 *  3. Opciones del pool y creación del pool
 * ============================================================================
 */

// Exportado para que server.js construya el pool de sesiones con la misma
// configuración (express-mysql-session filtra las opciones que no conoce,
// entre ellas `ssl`, así que recibe un pool ya preparado).
export const opcionesMySQL = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || process.env.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'bitacora_incidencias',

  // undefined cuando DB_SSL no está activo: mysql2 conecta sin TLS.
  ssl: sslOptions,

  // Devuelve DATE como string "YYYY-MM-DD" en lugar de un Date en UTC.
  dateStrings: ['DATE'],

  // El driver interpretará las fechas del servidor como si estuvieran en este offset.
  timezone: ZONA_HORARIA_OFFSET,

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  enableKeepAlive: true,
  keepAliveInitialDelay: 30000,
};

const pool = mysql.createPool(opcionesMySQL);

// Fuerza la TZ del servidor MySQL en cada conexión nueva del pool.
// Usamos el mismo offset para que CURRENT_TIME, NOW(), etc. devuelvan hora de Perú.
// Con un offset numérico no dependemos de que las tablas de zonas horarias
// de MySQL estén cargadas (que no lo están en Aiven por defecto).
pool.on('connection', (conn) => {
  conn.query(`SET time_zone = '${ZONA_HORARIA_OFFSET}'`);
});

export default pool;

/**
 * Ejecuta `fn` dentro de una transacción y libera siempre la conexión.
 *
 * mysql2 no tiene transacciones implícitas: sin esto, una operación que borra
 * y después inserta (o borra y después actualiza) puede dejar la base a medias
 * si la segunda sentencia falla. El orden correcto siempre es COMMIT y, ante
 * cualquier error, ROLLBACK.
 *
 * `fn` recibe la conexión dedicada: dentro de la transacción hay que usarla
 * (`conexion.query`), nunca `pool.query`, que abriría otra conexión y
 * trabajaría fuera de la transacción.
 *
 * @template T
 * @param {(conexion: import('mysql2/promise').PoolConnection) => Promise<T>} fn
 * @returns {Promise<T>} lo que devuelva `fn` tras el COMMIT
 */
export async function withTransaction(fn) {
  const conexion = await pool.getConnection();

  try {
    await conexion.beginTransaction();
    const resultado = await fn(conexion);
    await conexion.commit();
    return resultado;
  } catch (error) {
    // El rollback también puede fallar si la conexión se perdió; el error
    // original es el que informa, así que no se enmascara.
    await conexion.rollback().catch(() => {});
    throw error;
  } finally {
    conexion.release();
  }
}