import authService from '../services/authService.js';
import pool from '../config/db.js';
import permisosService from '../services/permisosService.js';

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

export async function me(req, res, next) {
  try {
    const userId = req.session.userId;

    const [userRows] = await pool.query(
      `SELECT id, usuario, nombre, apellido
       FROM usuarios
       WHERE id = ?`,
      [userId]
    );

    if (userRows.length === 0) {
      return res.status(404).json({ ok: false, mensaje: 'Usuario no encontrado' });
    }

    const permisos = await permisosService.obtenerPermisosEfectivos(userId);

    const [roles] = await pool.query(
      `SELECT r.id, r.nombre, r.tipo
       FROM usuarios_roles ur
       INNER JOIN roles r ON r.id = ur.rol_id
       WHERE ur.usuario_id = ?`,
      [userId]
    );

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
