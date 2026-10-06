// backend/src/config/db.js

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// Perú es UTC-5 todo el año (no aplica horario de verano).
// MySQL2 no acepta "America/Lima"; debe ser un offset numérico.
const ZONA_HORARIA_OFFSET = '-05:00';

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || process.env.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'bitacora_incidencias',

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
});

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