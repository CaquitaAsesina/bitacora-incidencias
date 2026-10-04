import permisosService from '../services/permisosService.js';

export function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({
      ok: false,
      mensaje: 'No autorizado. Inicie sesión.',
    });
  }
  next();
}

export function requirePermission(...permisosRequeridos) {
  return async (req, res, next) => {
    try {
      if (!req.session || !req.session.userId) {
        return res.status(401).json({
          ok: false,
          mensaje: 'No autorizado. Inicie sesión.',
        });
      }

      const permisosEfectivos = await permisosService.obtenerPermisosEfectivos(
        req.session.userId
      );

      const tienePermiso = permisosRequeridos.some((permiso) =>
        permisosEfectivos.includes(permiso)
      );

      if (!tienePermiso) {
        return res.status(403).json({
          ok: false,
          mensaje: 'Sin permisos para realizar esta acción.',
        });
      }

      req.permisosEfectivos = permisosEfectivos;
      next();
    } catch (error) {
      next(error);
    }
  };
}
