export function errorHandler(err, req, res, next) {
  console.error(err);
  
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err.statusCode || 500;
  const mensaje = err.message || 'Error interno del servidor';

  res.status(statusCode).json({
    ok: false,
    mensaje,
  });
}
