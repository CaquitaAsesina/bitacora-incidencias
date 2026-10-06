// backend/src/config/mysqlSSL.js

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import dotenv from 'dotenv';

// Cargamos el .env aquí mismo: server.js importa este módulo de forma
// transitiva antes de que db.js haya llamado a dotenv.config().
dotenv.config();

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
 *
 * ============================================================================
 *  2. Parche del SSL Request de mysql2 (efecto secundario de este módulo)
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ_BACKEND = path.resolve(__dirname, '../..');

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

// ---------------------------------------------------------------------
// Parche: partir el SSL Request en dos escrituras
// ---------------------------------------------------------------------

const require = createRequire(import.meta.url);
const mysql = require('mysql2');

const CLIENT_SSL = 0x800;
const escribirPacketOriginal = mysql.Connection.prototype.writePacket;

mysql.Connection.prototype.writePacket = function escribirPacket(packet) {
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
