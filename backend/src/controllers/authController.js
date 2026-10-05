/**
 * =====================================================================
 * controllers/authController.js — Autenticación
 * =====================================================================
 * Endpoints:
 *   login  -> valida credenciales y crea la sesión.
 *   logout -> destruye la sesión y limpia la cookie.
 *   me     -> devuelve usuario + roles + permisos efectivos de la sesión.
 *
 * Esta capa NO tiene reglas de negocio: delega en authService / permisosService
 * y traduce el resultado a JSON.
 *
 * Para extender: añade aquí la función y regístrala en routes/auth.routes.js.
 * =====================================================================
 */
import authService from '../services/authService.js';
import pool from '../config/db.js';
import permisosService from '../services/permisosService.js';

/** POST /api/auth/login — autentica y abre sesión. */
export async function login(req, res, next) {
  try {
    const { usuario, contrasena } = req.body;

    const resultado = await authService.login(usuario, contrasena);

    req.session.userId = resultado.usuario.id;
    req.session.usuario = resultado.usuario.usuario;
    req.session.nombre = resultado.usuario.nombre;
    req.session.apellido = resultado.usuario.apellido;

    res.json({
      ok: true,
      ...resultado,
    });
  } catch (error) {
    next(error);
  }
}

/** POST /api/auth/logout — cierra la sesión (requiere sesión activa). */
export async function logout(req, res, next) {
  try {
    req.session.destroy((err) => {
      if (err) {
        return next(err);
      }
      res.clearCookie('bitacora.sid');
      res.json({ ok: true, mensaje: 'Sesión cerrada' });
    });
  } catch (error) {
    next(error);
  }
}

/** GET /api/auth/me — datos de la sesión para pintar menú y permisos. */
export async function me(req, res, next) {
  try {
    const userId = req.session.userId;

    // Rendimiento: usuario, permisos y roles son independientes -> en paralelo.
    const [[userRows], permisos, [roles]] = await Promise.all([
      pool.query(
        `SELECT id, usuario, nombre, apellido
         FROM usuarios
         WHERE id = ?`,
        [userId]
      ),
      permisosService.obtenerPermisosEfectivos(userId),
      pool.query(
        `SELECT r.id, r.nombre, r.tipo
         FROM usuarios_roles ur
         INNER JOIN roles r ON r.id = ur.rol_id
         WHERE ur.usuario_id = ?`,
        [userId]
      ),
    ]);

    if (userRows.length === 0) {
      return res.status(404).json({ ok: false, mensaje: 'Usuario no encontrado' });
    }

    res.json({
      ok: true,
      usuario: userRows[0],
      roles,
      permisos,
    });
  } catch (error) {
    next(error);
  }
}
