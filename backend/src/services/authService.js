import bcrypt from 'bcrypt';
import pool from '../config/db.js';
import permisosService from './permisosService.js';

export async function login(usuario, contrasena) {
  const [rows] = await pool.query(
    `SELECT id, usuario, contrasena, nombre, apellido, habilitado
     FROM usuarios
     WHERE usuario = ?`,
    [usuario]
  );

  if (rows.length === 0) {
    const error = new Error('Credenciales inválidas');
    error.statusCode = 401;
    throw error;
  }

  const user = rows[0];

  if (!user.habilitado) {
    const error = new Error('Usuario deshabilitado');
    error.statusCode = 401;
    throw error;
  }

  const match = await bcrypt.compare(contrasena, user.contrasena);
  if (!match) {
    const error = new Error('Credenciales inválidas');
    error.statusCode = 401;
    throw error;
  }

  const permisos = await permisosService.obtenerPermisosEfectivos(user.id);

  const [roles] = await pool.query(
    `SELECT r.id, r.nombre, r.tipo
     FROM usuarios_roles ur
     INNER JOIN roles r ON r.id = ur.rol_id
     WHERE ur.usuario_id = ?`,
    [user.id]
  );

  return {
    usuario: {
      id: user.id,
      usuario: user.usuario,
      nombre: user.nombre,
      apellido: user.apellido,
    },
    roles,
    permisos,
  };
}

export default {
  login,
};
