/**
 * =====================================================================
 * config/db.js — Conexión a MySQL (pool de conexiones)
 * =====================================================================
 * Crea un pool reutilizable con mysql2/promise a partir de las variables de
 * entorno. Todas las capas (controllers -> services) comparten este mismo pool.
 *
 * Variables de entorno (.env):
 *   DB_HOST, DB_PORT, DB_USER (o DB_USERNAME), DB_PASSWORD, DB_NAME.
 *
 * Para extender: si necesitas otra base de datos o ajustar el pool, hazlo aquí;
 * el resto del código importa el pool desde este archivo.
 * =====================================================================
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || process.env.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'bitacora_incidencias',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  // Mantiene vivos los sockets del pool: evita reconexiones (handshake TCP/TLS)
  // cuando la base remota cierra conexiones inactivas.
  enableKeepAlive: true,
  keepAliveInitialDelay: 30000,
});

export default pool;
