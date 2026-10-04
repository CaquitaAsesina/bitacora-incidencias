export class AppError extends Error {
  constructor(mensaje, statusCode = 500) {
    super(mensaje);
    this.statusCode = statusCode;
    this.expose = true;
  }
}

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