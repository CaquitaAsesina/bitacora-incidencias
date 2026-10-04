/**
 * =====================================================================
 * middlewares/errorHandler.js — Manejo central de errores
 * =====================================================================
 * Último middleware de la cadena (se registra en server.js). Traduce los
 * errores lanzados por los services a respuestas JSON { ok:false, mensaje }.
 *
 * Convención de los services: lanzar un Error con error.statusCode y, si el
 * mensaje es apto para el usuario, error.expose = true (o statusCode < 500).
 *
 * Para extender: agrega aquí el código de MySQL y su mensaje amigable.
 * =====================================================================
 */

/** Traducción de códigos de error de MySQL a mensajes para el usuario. */
const MENSAJES_POR_CODIGO = {
  ER_DUP_ENTRY: 'Ya existe un registro con esos datos',
  ER_NO_REFERENCED_ROW_2: 'La referencia indicada no existe',
  ER_NO_REFERENCED_ROW: 'La referencia indicada no existe',
  ER_ROW_IS_REFERENCED_2: 'No se puede eliminar: hay registros relacionados',
  ER_ROW_IS_REFERENCED: 'No se puede eliminar: hay registros relacionados',
  ER_DATA_TOO_LONG: 'Algún dato supera la longitud máxima permitida',
  ER_BAD_NULL_ERROR: 'Faltan datos obligatorios',
  ER_CHECK_CONSTRAINT_VIOLATED: 'El valor enviado no cumple las restricciones del catálogo',
};

/**
 * Middleware de error de Express (4 argumentos).
 * @param {Error & { statusCode?: number, expose?: boolean, code?: string }} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err.statusCode || 500;

  console.error(`[${req.method} ${req.originalUrl}]`, err.message);

  let mensaje = 'Error interno del servidor';

  if (err.expose || statusCode < 500) {
    mensaje = err.message;
  } else if (err.code && MENSAJES_POR_CODIGO[err.code]) {
    mensaje = MENSAJES_POR_CODIGO[err.code];
  }

  res.status(statusCode).json({ ok: false, mensaje });
}