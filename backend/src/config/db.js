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