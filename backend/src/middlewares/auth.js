/**
 * =====================================================================
 * middlewares/auth.js — Autenticación y autorización por permisos
 * =====================================================================
 * Dos middlewares reutilizables por todas las rutas:
 *   - requireAuth: exige sesión iniciada (401 si no hay sesión).
 *   - requirePermission(...permisos): exige al menos uno de los permisos
 *     indicados (403 si el usuario no los tiene).
 *
 * Los permisos efectivos se resuelven en permisosService.obtenerPermisosEfectivos
 * (Lógica A para roles SISTEMA, Lógica B para roles PERSONALIZADO).
 *
 * Para extender: para endurecer el acceso basta con añadir/quitar permisos en
 * la llamada requirePermission(...) de cada ruta; no hace falta tocar este archivo.
 * =====================================================================
 */
import permisosService from '../services/permisosService.js';

/**
 * Exige que la petición venga de una sesión autenticada.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({
      ok: false,
      mensaje: 'No autorizado. Inicie sesión.',
    });
  }
  next();
}

/**
 * Exige que el usuario tenga AL MENOS UNO de los permisos indicados (OR).
 * @param {...string} permisosRequeridos nombres de permiso (p. ej. 'VER_DASHBOARD')
 * @returns {import('express').RequestHandler}
 */
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
